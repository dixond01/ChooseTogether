import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { supabase } from '../lib/supabase'
import { isTemplateDirty, type Drafts, type Draft, type Template } from '../lib/emailTemplates'
import TokenField, { type TokenFieldHandle } from '../components/TokenField'

// Final statuses in display order (codes stored, labels only here).
const STATUSES: [Template['status'], string][] = [
  ['selected', 'Selected'],
  ['waitlisted', 'Waitlisted'],
  ['not_selected', 'Not Selected'],
]

// Filled in by the send Edge Function. Keep in sync with Documents/spec/results-and-email.md.
const PLACEHOLDERS: [string, string][] = [
  ['participant_name', 'Participant Name'],
  ['act_title', 'Act Title'],
  ['project_name', 'Project Name'],
  ['organizer_email', 'Organizer Email'],
]
const KNOWN = new Set(PLACEHOLDERS.map(([key]) => key))
// Module-level so TokenField sees a stable object.
const LABELS: Record<string, string> = Object.fromEntries(PLACEHOLDERS)

function unknownPlaceholders(text: string) {
  return [...text.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]).filter((k) => !KNOWN.has(k))
}

function fill(text: string, values: Record<string, string>) {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => values[key] ?? match)
}

type Props = {
  templates: Template[]
  setTemplates: Dispatch<SetStateAction<Template[]>>
  drafts: Drafts
  setDrafts: Dispatch<SetStateAction<Drafts>>
  canEdit: boolean
  projectName: string
  organizerEmail: string
}

export default function EmailTemplates({
  templates, setTemplates, drafts, setDrafts, canEdit, projectName, organizerEmail,
}: Props) {
  const [status, setStatus] = useState<Template['status']>('selected')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const subjectRef = useRef<TokenFieldHandle>(null)
  const bodyRef = useRef<TokenFieldHandle>(null)
  const lastField = useRef<'subject' | 'body'>('body')

  const template = templates.find((t) => t.status === status)
  if (!template) return <p className="error">This project's email templates are missing.</p>
  const draft = drafts[status] ?? { subject: template.subject, body: template.body }
  const dirty = isTemplateDirty(template, drafts)
  const label = STATUSES.find(([s]) => s === status)![1]

  function update(field: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [status]: { ...draft, [field]: value } }))
    setMessage(null)
  }

  // Insert a placeholder chip at the cursor of whichever field was used last.
  function insert(key: string) {
    const field = lastField.current === 'subject' ? subjectRef.current : bodyRef.current
    field?.insert(key)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!draft.subject.trim() || !draft.body.trim()) {
      setMessage({ ok: false, text: 'Subject and message can\'t be empty.' })
      return
    }
    const unknown = unknownPlaceholders(draft.subject + draft.body)
    if (unknown.length) {
      setMessage({ ok: false, text: `Unknown placeholder: {${unknown[0]}}` })
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('email_templates')
      .update({ subject: draft.subject.trim(), body: draft.body.trim() })
      .eq('id', template!.id)
      .select('id, status, subject, body')
      .single()
    setSaving(false)
    if (error) {
      setMessage({ ok: false, text: error.message })
      return
    }
    setTemplates((ts) => ts.map((t) => (t.id === data.id ? data : t)))
    setDrafts((d) => ({ ...d, [status]: { subject: data.subject, body: data.body } }))
    setMessage({ ok: true, text: 'Saved' })
  }

  function discard() {
    setDrafts((d) => ({ ...d, [status]: { subject: template!.subject, body: template!.body } }))
    setMessage(null)
  }

  const sample = {
    participant_name: 'Jordan Lee',
    act_title: 'Juggling on a Unicycle',
    project_name: projectName,
    organizer_email: organizerEmail,
  }

  return (
    <form onSubmit={onSave}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="fields">
          <div className="choices" role="radiogroup" aria-label="Final status">
            {STATUSES.map(([code, text]) => {
              const t = templates.find((x) => x.status === code)
              return (
                <label key={code} className="choice">
                  <input
                    type="radio"
                    name="template_status"
                    checked={status === code}
                    onChange={() => {
                      setStatus(code)
                      setMessage(null)
                    }}
                  />
                  {text}
                  {t && isTemplateDirty(t, drafts) && <span className="dirty" aria-label="Unsaved changes" />}
                </label>
              )
            })}
          </div>

          <div className="field">
            <span className="label" id="email-subject" onClick={() => subjectRef.current?.focus()}>
              Subject
            </span>
            <div className="input wide">
              <TokenField
                ref={subjectRef}
                labelledBy="email-subject"
                labels={LABELS}
                value={draft.subject}
                disabled={!canEdit}
                onFocus={() => (lastField.current = 'subject')}
                onChange={(v) => update('subject', v)}
              />
            </div>
          </div>

          <div className="field">
            <span className="label" id="email-body" onClick={() => bodyRef.current?.focus()}>
              Message
            </span>
            <div className="input wide">
              <TokenField
                ref={bodyRef}
                multiline
                labelledBy="email-body"
                labels={LABELS}
                value={draft.body}
                disabled={!canEdit}
                onFocus={() => (lastField.current = 'body')}
                onChange={(v) => update('body', v)}
              />
            </div>
            {canEdit && (
              <div className="inserts" aria-label="Insert placeholder">
                {PLACEHOLDERS.map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    className="insert"
                    // Keep focus (and the cursor) in the field while clicking.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(key)}
                  >
                    <span className="ph">+ {text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <details className="preview">
            <summary>Preview</summary>
            <div className="email-preview">
              <strong>{fill(draft.subject, sample)}</strong>
              <p>{fill(draft.body, sample)}</p>
            </div>
          </details>
        </div>
      </fieldset>

      {canEdit && (
        <div className="actions">
          <button className="btn" type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : `Save ${label} Email`}
          </button>
          {dirty && !saving && <button type="button" className="textbtn" onClick={discard}>Discard</button>}
          {message && <span className={message.ok ? 'status-msg' : 'error'}>{message.text}</span>}
        </div>
      )}
    </form>
  )
}
