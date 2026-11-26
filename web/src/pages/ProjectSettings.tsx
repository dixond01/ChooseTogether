import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import type { Enums, Tables, TablesUpdate } from '../lib/database.types'
import {
  formatDeadline, formatShortDate, publicFormUrl, SLUG_PATTERN, toLocalInput,
} from '../lib/format'
import { isTemplateDirty, type Drafts, type Template } from '../lib/emailTemplates'
import { FILE_REQUIREMENTS, MEDIA_KINDS, type FileRequirement, type MediaKind } from '../lib/formFields'
import EmailTemplates from './EmailTemplates'
import FormFieldsSection from './FormFieldsSection'
import TeamSection from './TeamSection'

type Project = Tables<'projects'>
type Tag = Pick<Tables<'tags'>, 'id' | 'name'>

// Editable values, as the inputs hold them. Converted to/from DB columns below.
type Form = {
  name: string
  slug: string
  closesAt: string // datetime-local value
  limitParticipants: boolean
  maxParticipants: string
  maxMinutes: string
  agreement: string
  titleLabel: string
  descriptionLabel: string
  participantLabel: string
  participantsLabel: string
  fileLabel: string
  fileRequirement: FileRequirement
  acceptedKinds: string // comma list in MEDIA_KINDS order, so it compares as a plain value
  reviewers: number
  decisionRule: Enums<'decision_rule'>
  scoreRequired: boolean
  retention: Enums<'retention_policy'>
  graceDays: string
  targetMinutes: string
  showEnabled: boolean
}

type SectionId = 'basics' | 'team' | 'form' | 'review' | 'emails' | 'files' | 'show'

const SECTIONS: { id: SectionId; label: string; save?: string; keys: (keyof Form)[] }[] = [
  { id: 'basics', label: 'Basics', save: 'Save Basics', keys: ['name', 'slug', 'closesAt', 'showEnabled'] },
  { id: 'team', label: 'Team', keys: [] }, // each invite/removal saves on its own
  {
    id: 'form', label: 'Submission Form', save: 'Save Form Settings',
    keys: [
      'limitParticipants', 'maxParticipants', 'maxMinutes', 'agreement', 'titleLabel', 'descriptionLabel',
      'participantLabel', 'participantsLabel', 'fileLabel', 'fileRequirement', 'acceptedKinds',
    ],
  },
  { id: 'review', label: 'Reviewing', save: 'Save Review Rules', keys: ['reviewers', 'decisionRule', 'scoreRequired'] },
  { id: 'emails', label: 'Emails', keys: [] }, // templates save one status at a time
  { id: 'files', label: 'Files', save: 'Save File Settings', keys: ['retention', 'graceDays'] },
  { id: 'show', label: 'Show', save: 'Save Show Settings', keys: ['targetMinutes'] },
]

// Codes are stored; labels live only in the UI.
const DECISION_RULES: [Enums<'decision_rule'>, string][] = [
  ['any_disagreement_to_owner', 'Owner Decides'],
  ['majority', 'Majority Wins'],
]
const RETENTION: [Enums<'retention_policy'>, string][] = [
  ['until_results_sent', 'Keep Until Results Are Sent'],
  ['after_conversion', 'Delete After Conversion'],
  ['forever', 'Keep Forever'],
]
// Sections merged into others keep working as old links.
const MOVED: Record<string, SectionId> = { fields: 'form', tags: 'review' }
const MAX_REVIEWERS = 10

const LABEL_KEYS = ['titleLabel', 'descriptionLabel', 'participantLabel', 'participantsLabel', 'fileLabel'] as const
const LABEL_NAMES: Record<(typeof LABEL_KEYS)[number], string> = {
  titleLabel: 'Title',
  descriptionLabel: 'Description',
  participantLabel: 'One Participant',
  participantsLabel: 'Several Participants',
  fileLabel: 'File',
}

function toForm(p: Project): Form {
  return {
    name: p.name,
    slug: p.slug,
    closesAt: toLocalInput(p.submissions_close_at),
    limitParticipants: p.max_participants !== null,
    maxParticipants: String(p.max_participants ?? 6),
    maxMinutes: p.max_duration_seconds ? String(p.max_duration_seconds / 60) : '',
    agreement: p.agreement_text ?? '',
    titleLabel: p.title_label,
    descriptionLabel: p.description_label,
    participantLabel: p.participant_label,
    participantsLabel: p.participants_label,
    fileLabel: p.file_label,
    fileRequirement: p.file_requirement,
    acceptedKinds: joinKinds(p.accepted_kinds),
    reviewers: p.reviewers_per_submission,
    decisionRule: p.decision_rule,
    scoreRequired: p.score_required,
    retention: p.retention_policy,
    graceDays: String(p.retention_grace_days),
    targetMinutes: p.target_show_seconds ? String(p.target_show_seconds / 60) : '',
    showEnabled: p.show_enabled,
  }
}

function joinKinds(kinds: MediaKind[]) {
  return MEDIA_KINDS.map(([k]) => k).filter((k) => kinds.includes(k)).join(',')
}
const splitKinds = (v: string) => (v ? v.split(',') : []) as MediaKind[]
const acceptsTimed = (f: Form) =>
  f.fileRequirement !== 'none' && splitKinds(f.acceptedKinds).some((k) => k === 'video' || k === 'audio')

// Blank = null (no limit / not set). Minutes are stored as whole seconds.
const minutesToSeconds = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 60))

function toUpdate(section: SectionId, f: Form): TablesUpdate<'projects'> {
  switch (section) {
    case 'basics':
      return {
        name: f.name.trim(),
        slug: f.slug,
        submissions_close_at: new Date(f.closesAt).toISOString(),
        show_enabled: f.showEnabled,
      }
    case 'form':
      return {
        max_participants: f.limitParticipants ? Number(f.maxParticipants) : null,
        max_duration_seconds: minutesToSeconds(f.maxMinutes),
        agreement_text: f.agreement.trim() || null,
        title_label: f.titleLabel.trim(),
        description_label: f.descriptionLabel.trim(),
        participant_label: f.participantLabel.trim(),
        participants_label: f.participantsLabel.trim(),
        file_label: f.fileLabel.trim(),
        file_requirement: f.fileRequirement,
        // Unchanged when there's no file, so switching back keeps the old choice.
        accepted_kinds: splitKinds(f.acceptedKinds),
      }
    case 'review':
      return {
        reviewers_per_submission: f.reviewers,
        decision_rule: f.decisionRule,
        score_required: f.scoreRequired,
      }
    case 'files':
      return { retention_policy: f.retention, retention_grace_days: Number(f.graceDays || 0) }
    case 'show':
      return { target_show_seconds: minutesToSeconds(f.targetMinutes) }
    default:
      return {}
  }
}

function pick(f: Form, keys: (keyof Form)[]): Partial<Form> {
  return Object.fromEntries(keys.map((k) => [k, f[k]]))
}

export default function ProjectSettings() {
  const { projectId = '', section: sectionParam } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [saved, setSaved] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [role, setRole] = useState<Enums<'member_role'> | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [drafts, setDrafts] = useState<Drafts>({})
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  // UI only; RLS is what actually enforces these.
  const canEdit = role === 'owner' || role === 'co_manager'
  const isOwner = role === 'owner'

  useEffect(() => {
    async function load() {
      const [p, myRole, t, et, owner] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabase.rpc('my_role', { p_project_id: projectId }),
        supabase.from('tags').select('id, name').eq('project_id', projectId).order('name'),
        supabase.from('email_templates').select('id, status, subject, body').eq('project_id', projectId),
        supabase.from('project_members').select('email').eq('project_id', projectId).eq('role', 'owner').maybeSingle(),
      ])
      if (p.error || !p.data) {
        setLoadError(p.error?.message ?? 'Project not found, or you no longer have access.')
        return
      }
      setProject(p.data)
      setSaved(toForm(p.data))
      setForm(toForm(p.data))
      setRole(myRole.data ?? null)
      setTags(t.data ?? [])
      setTemplates(et.data ?? [])
      setDrafts(Object.fromEntries((et.data ?? []).map((x) => [x.status, { subject: x.subject, body: x.body }])))
      setOrganizerEmail(owner.data?.email ?? '')
    }
    load()
  }, [projectId])

  if (sectionParam && MOVED[sectionParam]) {
    return <Navigate to={`/projects/${projectId}/settings/${MOVED[sectionParam]}`} replace />
  }
  const section = SECTIONS.find((s) => s.id === sectionParam)
  if (sectionParam && !section) return <Navigate to={`/projects/${projectId}/settings`} replace />
  const current = section ?? SECTIONS[0]

  if (loadError) {
    return (
      <main className="page">
        <Link to="/" className="back">← Projects</Link>
        <p className="error">{loadError}</p>
      </main>
    )
  }
  if (!project || !form || !saved) return <p className="loading">Loading…</p>
  // Show settings appear once they're turned on (and saved) in Basics.
  const visibleSections = SECTIONS.filter((s) => s.id !== 'show' || saved.showEnabled)
  if (!visibleSections.includes(current)) return <Navigate to={`/projects/${projectId}/settings`} replace />

  const isDirty = (id: SectionId) =>
    id === 'emails'
      ? templates.some((t) => isTemplateDirty(t, drafts))
      : SECTIONS.find((s) => s.id === id)!.keys.some((k) => form[k] !== saved[k])
  const closed = new Date(project.submissions_close_at) < new Date()

  function onSaved(p: Project, keys: (keyof Form)[]) {
    const fresh = toForm(p)
    setProject(p)
    setSaved(fresh)
    // Only reset this section's inputs; other sections keep their unsaved edits.
    setForm((f) => ({ ...f!, ...pick(fresh, keys) }))
  }

  return (
    <div className="settings">
      <aside className="side">
        <Link to="/" className="back">← Projects</Link>
        <h2 className="proj">{project.name}</h2>
        <div className="closes">
          <span className={closed ? 'dot closed' : 'dot'} />
          {closed ? 'Closed' : 'Closes'} {formatShortDate(project.submissions_close_at)}
        </div>
        <nav className="nav" aria-label="Settings sections">
          {visibleSections.map((s) => (
            <Link
              key={s.id}
              to={`/projects/${projectId}/settings/${s.id}`}
              aria-current={s.id === current.id ? 'page' : undefined}
            >
              {s.label}
              {isDirty(s.id) && <span className="dirty" aria-label="Unsaved changes" />}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="page">
        <h1 className="page-title">{current.label}</h1>
        {current.id === 'team' ? (
          <TeamSection projectId={projectId} canEdit={canEdit} />
        ) : current.id === 'emails' ? (
          <EmailTemplates
            templates={templates}
            setTemplates={setTemplates}
            drafts={drafts}
            setDrafts={setDrafts}
            canEdit={canEdit}
            projectName={project.name}
            organizerEmail={organizerEmail}
          />
        ) : (
          <SectionForm
            key={current.id}
            projectId={projectId}
            section={current}
            form={form}
            setForm={setForm}
            saved={saved}
            dirty={isDirty(current.id)}
            canEdit={canEdit}
            onSaved={onSaved}
          />
        )}
        {current.id === 'form' && (
          <section className="subsection">
            <h2 className="subhead">Form Fields</h2>
            <FormFieldsSection projectId={projectId} canEdit={canEdit} />
          </section>
        )}
        {current.id === 'review' && (
          <section className="subsection">
            <h2 className="subhead">Tags</h2>
            <TagsSection projectId={projectId} tags={tags} setTags={setTags} canEdit={canEdit} />
          </section>
        )}
        {current.id === 'basics' && isOwner && (
          <DeleteProject projectId={projectId} projectName={project.name} />
        )}
      </main>
    </div>
  )
}

type SectionFormProps = {
  projectId: string
  section: (typeof SECTIONS)[number]
  form: Form
  setForm: Dispatch<SetStateAction<Form | null>>
  saved: Form
  dirty: boolean
  canEdit: boolean
  onSaved: (p: Project, keys: (keyof Form)[]) => void
}

function SectionForm({ projectId, section, form, setForm, saved, dirty, canEdit, onSaved }: SectionFormProps) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [copied, setCopied] = useState(false)

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f!, [key]: value }))
    setMessage(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await supabase
      .from('projects')
      .update(toUpdate(section.id, form))
      .eq('id', projectId)
      .select()
      .single()
    setSaving(false)
    if (error) {
      setMessage({ ok: false, text: error.code === '23505' ? 'That form link is already taken.' : error.message })
      return
    }
    onSaved(data, section.keys)
    setEditingDeadline(false)
    setMessage({ ok: true, text: 'Saved' })
  }

  function discard() {
    setForm((f) => ({ ...f!, ...pick(saved, section.keys) }))
    setEditingDeadline(false)
    setMessage(null)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicFormUrl(saved.slug))
    setCopied(true)
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="fields">
          {section.id === 'basics' && (
            <>
              <div className="field">
                <label className="label" htmlFor="name">Project Name</label>
                <div className="input">
                  <input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
                </div>
              </div>

              <div className="field">
                <span className="label">Submissions Close</span>
                {editingDeadline ? (
                  <div className="input date">
                    <input
                      type="datetime-local"
                      required
                      aria-label="Submissions close"
                      value={form.closesAt}
                      onChange={(e) => set('closesAt', e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="value">
                    <strong>{formatDeadline(new Date(form.closesAt).toISOString())}</strong>
                    {canEdit && (
                      <button type="button" className="textbtn" onClick={() => setEditingDeadline(true)}>
                        Change
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <span className="label">Public Form</span>
                <div className="value">
                  <code>{publicFormUrl(saved.slug)}</code>
                  <button type="button" className="textbtn" onClick={copyLink}>
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
                {canEdit && (
                  <details open={form.slug !== saved.slug || undefined}>
                    <summary>Change Link</summary>
                    <div className="field">
                      <div className="input" style={{ maxWidth: 340 }}>
                        <span className="unit prefix">/f/</span>
                        <input
                          required
                          aria-label="Form link"
                          pattern={SLUG_PATTERN}
                          title="Lowercase letters, numbers and single dashes"
                          value={form.slug}
                          onChange={(e) => set('slug', e.target.value)}
                        />
                      </div>
                      <p className="warn">Changing this breaks links you've already shared.</p>
                    </div>
                  </details>
                )}
              </div>

              <div className="field">
                <span className="label">Show Planning</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.showEnabled}
                    onChange={(e) => set('showEnabled', e.target.checked)}
                  />
                  Enable Show Settings
                </label>
              </div>
            </>
          )}

          {section.id === 'form' && (
            <>
              <div className="field">
                <span className="label">File Upload</span>
                <div className="choices" role="radiogroup">
                  {FILE_REQUIREMENTS.map(([code, label]) => (
                    <label key={code} className="choice">
                      <input
                        type="radio"
                        name="file_requirement"
                        checked={form.fileRequirement === code}
                        onChange={() => set('fileRequirement', code)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {form.fileRequirement !== 'none' && (
                <div className="field">
                  <span className="label">Accepted Files</span>
                  <div className="choices">
                    {MEDIA_KINDS.map(([kind, label]) => {
                      const kinds = splitKinds(form.acceptedKinds)
                      const on = kinds.includes(kind)
                      return (
                        <label key={kind} className="choice">
                          <input
                            type="checkbox"
                            checked={on}
                            // At least one kind stays selected.
                            disabled={on && kinds.length === 1}
                            onChange={() =>
                              set('acceptedKinds', joinKinds(on ? kinds.filter((k) => k !== kind) : [...kinds, kind]))
                            }
                          />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="pair">
                <div className="field">
                  <span className="label">Participants per Submission</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={form.limitParticipants}
                      onChange={(e) => set('limitParticipants', e.target.checked)}
                    />
                    Set a Limit
                  </label>
                  {form.limitParticipants && (
                    <div className="input narrow" style={{ width: 170 }}>
                      <input
                        type="number"
                        min={1}
                        required
                        aria-label="Max participants"
                        value={form.maxParticipants}
                        onChange={(e) => set('maxParticipants', e.target.value)}
                      />
                      <span className="unit">people</span>
                    </div>
                  )}
                </div>
                <div className="field" hidden={!acceptsTimed(form)}>
                  <label className="label" htmlFor="len">Max Video / Audio Length</label>
                  <div className="input narrow">
                    <input
                      id="len"
                      type="number"
                      min={0.5}
                      step="any"
                      placeholder="None"
                      value={form.maxMinutes}
                      onChange={(e) => set('maxMinutes', e.target.value)}
                    />
                    <span className="unit">min</span>
                  </div>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="agree">Agreement Checkbox Text</label>
                <div className="input wide">
                  <textarea
                    id="agree"
                    rows={5}
                    value={form.agreement}
                    onChange={(e) => set('agreement', e.target.value)}
                  />
                </div>
              </div>
              <details open={LABEL_KEYS.some((k) => form[k] !== saved[k]) || undefined}>
                <summary>Change Field Labels</summary>
                <div className="pair">
                  {LABEL_KEYS.filter((k) => k !== 'fileLabel' || form.fileRequirement !== 'none').map((k) => (
                    <div className="field" key={k}>
                      <label className="label" htmlFor={k}>{LABEL_NAMES[k]}</label>
                      <div className="input">
                        <input
                          id={k}
                          required
                          maxLength={60}
                          value={form[k]}
                          onChange={(e) => set(k, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}

          {section.id === 'review' && (
            <>
              <div className="field">
                <span className="label">Reviewers per Submission</span>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="Fewer reviewers"
                    disabled={form.reviewers <= 1}
                    onClick={() => set('reviewers', form.reviewers - 1)}
                  >−</button>
                  <output aria-live="polite">{form.reviewers}</output>
                  <button
                    type="button"
                    aria-label="More reviewers"
                    disabled={form.reviewers >= MAX_REVIEWERS}
                    onClick={() => set('reviewers', form.reviewers + 1)}
                  >+</button>
                </div>
              </div>
              <div className="field">
                <span className="label">When Reviewers Disagree</span>
                <div className="choices" role="radiogroup">
                  {DECISION_RULES.map(([code, label]) => (
                    <label key={code} className="choice">
                      <input
                        type="radio"
                        name="decision_rule"
                        checked={form.decisionRule === code}
                        onChange={() => set('decisionRule', code)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">Scoring</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.scoreRequired}
                    onChange={(e) => set('scoreRequired', e.target.checked)}
                  />
                  Score Each Vote 1–5
                </label>
              </div>
            </>
          )}

          {section.id === 'files' && (
            <>
              <div className="field">
                <span className="label">Original Uploads</span>
                <div className="choices" role="radiogroup">
                  {RETENTION.map(([code, label]) => (
                    <label key={code} className="choice">
                      <input
                        type="radio"
                        name="retention"
                        checked={form.retention === code}
                        onChange={() => set('retention', code)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {form.retention === 'after_conversion' && (
                <div className="field">
                  <label className="label" htmlFor="grace">Wait Before Deleting</label>
                  <div className="input narrow">
                    <input
                      id="grace"
                      type="number"
                      min={0}
                      required
                      value={form.graceDays}
                      onChange={(e) => set('graceDays', e.target.value)}
                    />
                    <span className="unit">days</span>
                  </div>
                  <p className="warn">Once originals are deleted, Reprocess no longer works for those files.</p>
                </div>
              )}
            </>
          )}

          {section.id === 'show' && (
            <div className="field">
              <label className="label" htmlFor="target">Target Show Length</label>
              <div className="input narrow">
                <input
                  id="target"
                  type="number"
                  min={1}
                  step="any"
                  placeholder="None"
                  value={form.targetMinutes}
                  onChange={(e) => set('targetMinutes', e.target.value)}
                />
                <span className="unit">min</span>
              </div>
            </div>
          )}
        </div>
      </fieldset>

      {canEdit ? (
        <div className="actions">
          <button className="btn" type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : section.save}
          </button>
          {dirty && !saving && <button type="button" className="textbtn" onClick={discard}>Discard</button>}
          {message && <span className={message.ok ? 'status-msg' : 'error'}>{message.text}</span>}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 48 }}>Only the owner and co-managers can change settings.</p>
      )}
    </form>
  )
}

type TagsProps = {
  projectId: string
  tags: Tag[]
  setTags: Dispatch<SetStateAction<Tag[]>>
  canEdit: boolean
}

function TagsSection({ projectId, tags, setTags, canEdit }: TagsProps) {
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function addTag(e: FormEvent) {
    e.preventDefault()
    const name = newTag.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('tags')
      .insert({ project_id: projectId, name })
      .select('id, name')
      .single()
    if (error) {
      setError(error.code === '23505' ? `"${name}" is already a tag.` : error.message)
      return
    }
    setTags((t) => [...t, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewTag('')
    setError(null)
  }

  async function removeTag(tag: Tag) {
    const { error } = await supabase.from('tags').delete().eq('id', tag.id)
    if (error) {
      setError(error.message)
      return
    }
    setTags((t) => t.filter((x) => x.id !== tag.id))
    setError(null)
  }

  return (
    <div className="fields">
      {tags.length === 0 ? (
        <p className="muted">No tags yet.</p>
      ) : (
        <ul className="tags">
          {tags.map((t) => (
            <li key={t.id} className="tag">
              {t.name}
              {canEdit && (
                <button type="button" aria-label={`Remove ${t.name}`} onClick={() => removeTag(t)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="addtag" onSubmit={addTag}>
          <div className="input">
            <input
              placeholder="New Tag"
              aria-label="New tag"
              value={newTag}
              onChange={(e) => {
                setNewTag(e.target.value)
                setError(null)
              }}
            />
          </div>
          <button className="btn" type="submit">Add</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Owner only (the "owner deletes project" RLS policy enforces it). Deleting
// cascades to members, tags, submissions, participants, media rows and jobs.
// TODO: once uploads exist, the R2 files also need deleting (server-side).
function DeleteProject({ projectId, projectName }: { projectId: string; projectName: string }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = confirm.trim() === projectName.trim()

  async function onDelete(e: FormEvent) {
    e.preventDefault()
    if (!matches) return
    setDeleting(true)
    setError(null)
    // .select() returns the deleted rows, so a delete blocked by RLS (0 rows) shows as an error.
    const { data, error } = await supabase.from('projects').delete().eq('id', projectId).select('id')
    setDeleting(false)
    if (error || !data?.length) {
      setError(error?.message ?? 'Only the owner can delete this project.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <details className="danger-zone">
      <summary>Delete Project</summary>
      <form className="fields" onSubmit={onDelete}>
        <p className="warn">
          This permanently deletes the project, its team, tags and all submissions. It can't be undone.
        </p>
        <div className="field">
          <label className="label" htmlFor="confirm-delete">Type the Project Name to Confirm</label>
          <div className="input">
            <input
              id="confirm-delete"
              autoComplete="off"
              placeholder={projectName}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <button className="btn danger" type="submit" disabled={!matches || deleting}>
            {deleting ? 'Deleting…' : 'Delete Project'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </form>
    </details>
  )
}
