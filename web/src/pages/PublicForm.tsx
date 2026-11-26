// The public submission form at /#/f/:slug (no sign-in). See Documents/spec/submission-form.md.
// Core fields (title, description, participants, file, agreement) use the
// project's labels; custom fields come from get_public_form_fields().
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { callFunction, putFile } from '../lib/functions'
import { LOGO_URL } from '../lib/format'
import { Turnstile } from '../components/Turnstile'
import {
  acceptAttr, checkFile, formatDuration, formatSize, kindOf, readDuration, toPayload, validate,
  type Draft, type Errors, type PublicField, type PublicForm as Form,
} from '../lib/formFields'

let nextKey = 1
const newParticipant = () => ({ key: nextKey++, name: '', email: '' })

export default function PublicForm() {
  const { slug = '' } = useParams()
  const [form, setForm] = useState<Form | null | undefined>(undefined) // null = not found
  const [fields, setFields] = useState<PublicField[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.rpc('get_public_form', { p_slug: slug }),
      supabase.rpc('get_public_form_fields', { p_slug: slug }),
    ]).then(([f, ff]) => {
      if (f.error || ff.error) return setLoadError((f.error ?? ff.error)!.message)
      setForm(f.data?.[0] ?? null)
      setFields(ff.data ?? [])
    })
  }, [slug])

  return (
    <div className="public">
      <header className="public-head">
        <img src={LOGO_URL} alt="" />
        <span>ChooseTogether</span>
      </header>
      <main className="public-main">
        {loadError ? (
          <p className="error">{loadError}</p>
        ) : form === undefined ? (
          <p className="muted">Loading…</p>
        ) : form === null ? (
          <h1 className="page-title">This form doesn't exist.</h1>
        ) : !form.is_open ? (
          <>
            <h1 className="page-title">{form.name}</h1>
            <p className="public-closed">Submissions are closed.</p>
          </>
        ) : (
          <SubmissionForm form={form} fields={fields} />
        )}
      </main>
    </div>
  )
}

function SubmissionForm({ form, fields }: { form: Form; fields: PublicField[] }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    title: '',
    description: '',
    participants: [newParticipant()],
    answers: {},
    file: null,
    agreed: false,
  }))
  const [errors, setErrors] = useState<Errors>({})
  // Errors show after the first submit attempt, then update as the person types.
  const [tried, setTried] = useState(false)
  const [checkingFile, setCheckingFile] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // Turnstile (bot check): each token works once, so it's reset after every try.
  const [token, setToken] = useState<string | null>(null)
  const [botCheckFailed, setBotCheckFailed] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  // After the submission is saved, the file uploads straight to R2.
  const [upload, setUpload] = useState<{ jobId: string; progress: number; error: string | null } | null>(null)

  // Leaving mid-upload would leave the submission without its file.
  const uploading = upload !== null && upload.error === null && !done
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const max = form.max_participants
  const pLabel = form.participant_label
  const psLabel = form.participants_label

  function update(next: Partial<Draft>) {
    const d = { ...draft, ...next }
    setDraft(d)
    if (tried) setErrors(validate(d, form, fields))
    setSubmitError(null)
  }

  function setParticipant(key: number, patch: Partial<{ name: string; email: string }>) {
    update({ participants: draft.participants.map((p) => (p.key === key ? { ...p, ...patch } : p)) })
  }

  // The file is checked as soon as it's picked (not only on submit), so nobody
  // fills in everything else before learning their video is too long.
  async function onFile(file: File | undefined) {
    let info: Draft['file'] = null
    let problem: string | null = null
    if (file) {
      const kind = kindOf(file)
      if (!kind) {
        problem = 'This kind of file isn’t accepted.'
      } else {
        setCheckingFile(true)
        const duration = kind === 'video' || kind === 'audio' ? await readDuration(file, kind) : null
        setCheckingFile(false)
        info = { file, kind, duration }
        problem = checkFile(info, form)
      }
    }
    if (problem) {
      info = null
      if (fileInput.current) fileInput.current.value = ''
    }
    const d = { ...draft, file: info }
    setDraft(d)
    setSubmitError(null)
    const rest = Object.fromEntries(Object.entries(tried ? validate(d, form, fields) : errors).filter(([k]) => k !== 'file'))
    setErrors(problem ? { ...rest, file: problem } : tried ? validate(d, form, fields) : rest)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    const found = validate(draft, form, fields)
    setErrors(found)
    if (Object.keys(found).length) {
      // Move to the first problem.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    if (!token) return
    setSubmitting(true)
    const res = await callFunction<{ submission_id: string; upload: { job_id: string; url: string | null } | null }>(
      'submit',
      { ...toPayload(draft, form, fields), turnstile_token: token },
    )
    setSubmitting(false)
    setResetKey((k) => k + 1) // the token is used up either way
    if (res.error) return setSubmitError(res.error)
    if (!res.upload || !draft.file) return setDone(true)
    await sendFile(res.upload.job_id, res.upload.url, draft.file.file)
  }

  // Uploads the file for a saved submission, then tells the server it arrived.
  // With no URL (a retry, or signing failed), asks for a fresh one first.
  async function sendFile(jobId: string, url: string | null, file: File) {
    setUpload({ jobId, progress: 0, error: null })
    const failed = (error: string) => setUpload({ jobId, progress: 0, error })
    if (!url) {
      const r = await callFunction<{ url: string }>('upload', { job_id: jobId, action: 'url' })
      if (r.error) return failed(r.error)
      url = r.url
    }
    try {
      await putFile(url, file, (progress) => setUpload({ jobId, progress, error: null }))
    } catch {
      return failed('The upload stopped before it finished.')
    }
    const r = await callFunction<{ ok: true }>('upload', { job_id: jobId, action: 'complete' })
    if (r.error) return failed(r.error)
    setDone(true)
  }

  if (done) {
    return (
      <>
        <h1 className="page-title">Thank You</h1>
        <p className="public-closed">Your submission to {form.name} was received.</p>
      </>
    )
  }

  if (upload && draft.file) {
    const file = draft.file.file
    return (
      <>
        <h1 className="page-title">{form.name}</h1>
        <div className="upload">
          <p className="filename">{file.name}</p>
          {upload.error ? (
            <>
              <p className="error">
                Your submission was saved, but the file didn’t finish uploading. {upload.error}
              </p>
              <div>
                <button className="btn" type="button" onClick={() => sendFile(upload.jobId, null, file)}>
                  Try Again
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="progress"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(upload.progress * 100)}
              >
                <span style={{ width: `${upload.progress * 100}%` }} />
              </div>
              <p className="muted">
                Uploading… {Math.round(upload.progress * 100)}% of {formatSize(file.size)}. Keep this page open.
              </p>
            </>
          )}
        </div>
      </>
    )
  }

  const err = (key: string) => errors[key]

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="page-title">{form.name}</h1>
      <div className="fields">
        <Field id="title" label={form.title_label} error={err('title')}>
          <div className="input">
            <input
              id="title"
              maxLength={200}
              aria-invalid={!!err('title')}
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </div>
        </Field>

        <Field id="description" label={form.description_label} error={err('description')}>
          <div className="input wide">
            <textarea
              id="description"
              rows={5}
              maxLength={5000}
              aria-invalid={!!err('description')}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>
        </Field>

        {fields.map((f) => (
          <CustomField
            key={f.id}
            field={f}
            value={draft.answers[f.id]}
            error={err(`field-${f.id}`)}
            onChange={(v) => update({ answers: { ...draft.answers, [f.id]: v } })}
          />
        ))}

        <fieldset className="field participants" aria-describedby={err('participants') ? 'participants-error' : undefined}>
          <legend className="label">{psLabel}</legend>
          {max && <p className="muted">Up to {max} {psLabel.toLowerCase()}</p>}
          <ol>
            {draft.participants.map((p, i) => (
              <li key={p.key}>
                <div className="field">
                  <div className="input">
                    <input
                      aria-label={`${pLabel} ${i + 1} name`}
                      placeholder="Name"
                      autoComplete={i === 0 ? 'name' : 'off'}
                      maxLength={200}
                      aria-invalid={!!err(`name-${p.key}`)}
                      value={p.name}
                      onChange={(e) => setParticipant(p.key, { name: e.target.value })}
                    />
                  </div>
                  {err(`name-${p.key}`) && <p className="error">{err(`name-${p.key}`)}</p>}
                </div>
                <div className="field">
                  <div className="input">
                    <input
                      type="email"
                      aria-label={`${pLabel} ${i + 1} email`}
                      placeholder="Email"
                      autoComplete={i === 0 ? 'email' : 'off'}
                      maxLength={320}
                      aria-invalid={!!err(`email-${p.key}`)}
                      value={p.email}
                      onChange={(e) => setParticipant(p.key, { email: e.target.value })}
                    />
                  </div>
                  {err(`email-${p.key}`) && <p className="error">{err(`email-${p.key}`)}</p>}
                </div>
                {draft.participants.length > 1 && (
                  <button
                    type="button"
                    className="textbtn"
                    aria-label={`Remove ${pLabel.toLowerCase()} ${i + 1}`}
                    onClick={() => update({ participants: draft.participants.filter((x) => x.key !== p.key) })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>
          {(!max || draft.participants.length < max) && (
            <div>
              <button
                type="button"
                className="textbtn"
                onClick={() => update({ participants: [...draft.participants, newParticipant()] })}
              >
                Add {pLabel}
              </button>
            </div>
          )}
          {err('participants') && <p className="error" id="participants-error">{err('participants')}</p>}
        </fieldset>

        {form.file_requirement !== 'none' && (
          <Field
            id="file"
            label={form.file_requirement === 'optional' ? `${form.file_label} (Optional)` : form.file_label}
            error={err('file')}
          >
            <label className={draft.file ? 'filepick has-file' : 'filepick'}>
              <input
                ref={fileInput}
                id="file"
                type="file"
                accept={acceptAttr(form.accepted_kinds)}
                aria-invalid={!!err('file')}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              {checkingFile ? (
                <span className="muted">Checking File…</span>
              ) : draft.file ? (
                <>
                  <span className="filename">{draft.file.file.name}</span>
                  <span className="muted">
                    {formatSize(draft.file.file.size)}
                    {draft.file.duration !== null && ` · ${formatDuration(draft.file.duration)}`}
                  </span>
                  <span className="textbtn">Change</span>
                </>
              ) : (
                <span className="textbtn">Choose File</span>
              )}
            </label>
            {form.max_duration_seconds && form.accepted_kinds.some((k) => k === 'video' || k === 'audio') && (
              <p className="muted">Video and audio up to {formatDuration(form.max_duration_seconds)} long</p>
            )}
          </Field>
        )}

        {form.agreement_text && (
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                aria-invalid={!!err('agreed')}
                checked={draft.agreed}
                onChange={(e) => update({ agreed: e.target.checked })}
              />
              <span className="agreement">{form.agreement_text}</span>
            </label>
            {err('agreed') && <p className="error">{err('agreed')}</p>}
          </div>
        )}
      </div>

      <div className="actions submit">
        <p className="warn">
          Submissions are final and can't be edited. To make changes, contact the organizer at{' '}
          <a href={`mailto:${form.organizer_email}`}>{form.organizer_email}</a>.
        </p>
        <Turnstile
          resetKey={resetKey}
          onToken={(t) => {
            setToken(t)
            if (t) setBotCheckFailed(false)
          }}
          onError={() => setBotCheckFailed(true)}
        />
        {botCheckFailed && (
          <p className="error">The spam check couldn’t load. Refresh the page to try again.</p>
        )}
        <div className="row">
          <button className="btn" type="submit" disabled={submitting || checkingFile || !token}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
          {tried && Object.keys(errors).length > 0 && <span className="error">Fix the highlighted fields.</span>}
          {submitError && <span className="error">{submitError}</span>}
        </div>
      </div>
    </form>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

type CustomProps = {
  field: PublicField
  value: string | boolean | undefined
  error?: string
  onChange: (v: string | boolean) => void
}

function CustomField({ field: f, value, error, onChange }: CustomProps) {
  const id = `field-${f.id}`
  const text = typeof value === 'string' ? value : ''
  const label = f.required || f.type === 'checkbox' ? f.label : `${f.label} (Optional)`
  const common = { id, 'aria-invalid': !!error, placeholder: f.placeholder ?? undefined }

  if (f.type === 'checkbox') {
    return (
      <div className="field">
        <label className="check">
          <input type="checkbox" id={id} aria-invalid={!!error} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{f.label}</span>
        </label>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  if (f.type === 'choice') {
    return (
      <fieldset className="field">
        <legend className="label">{label}</legend>
        <div className="choices" role="radiogroup">
          {(f.options ?? []).map((o, i) => (
            <label key={o} className="choice">
              <input
                type="radio"
                name={id}
                id={i === 0 ? id : undefined}
                aria-invalid={i === 0 ? !!error : undefined}
                checked={text === o}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </fieldset>
    )
  }

  return (
    <Field id={id} label={label} error={error}>
      {f.type === 'long_text' ? (
        <div className="input wide">
          <textarea {...common} rows={4} maxLength={5000} value={text} onChange={(e) => onChange(e.target.value)} />
        </div>
      ) : f.type === 'number' ? (
        <div className="input narrow">
          <input {...common} type="number" step="any" inputMode="decimal" value={text} onChange={(e) => onChange(e.target.value)} />
        </div>
      ) : f.type === 'date' ? (
        <div className="input date">
          <input {...common} type="date" value={text} onChange={(e) => onChange(e.target.value)} />
        </div>
      ) : (
        <div className="input">
          <input {...common} maxLength={500} value={text} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </Field>
  )
}
