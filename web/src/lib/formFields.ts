// Shared pieces of the flexible submission form (Documents/spec/submission-form.md):
// UI labels for the stored codes, accepted file types, and browser-side validation.
// The submit Edge Function repeats the same checks on the server.
import type { Database, Enums } from './database.types'

export type FieldType = Enums<'field_type'>
export type MediaKind = Enums<'media_kind'>
export type FileRequirement = Enums<'file_requirement'>

type Functions = Database['public']['Functions']
export type PublicForm = Functions['get_public_form']['Returns'][number]
export type PublicField = Functions['get_public_form_fields']['Returns'][number]

// Codes are stored; labels live only in the UI.
export const FIELD_TYPES: [FieldType, string][] = [
  ['short_text', 'Short Text'],
  ['long_text', 'Paragraph'],
  ['choice', 'Choice'],
  ['checkbox', 'Checkbox'],
  ['number', 'Number'],
  ['date', 'Date'],
]
export const fieldTypeLabel = (t: FieldType) => FIELD_TYPES.find(([c]) => c === t)?.[1] ?? t
export const hasPlaceholder = (t: FieldType) => t === 'short_text' || t === 'long_text' || t === 'number'

export const MEDIA_KINDS: [MediaKind, string][] = [
  ['video', 'Video'],
  ['audio', 'Audio'],
  ['image', 'Image'],
  ['text', 'Document'],
]

export const FILE_REQUIREMENTS: [FileRequirement, string][] = [
  ['required', 'Required'],
  ['optional', 'Optional'],
  ['none', 'No File'],
]

// Extensions per kind, for when the browser reports no MIME type (common for
// .heic, .mov on Windows, .md, .docx).
const EXTENSIONS: Record<MediaKind, string[]> = {
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'],
  audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'],
  text: ['txt', 'md', 'rtf', 'pdf', 'doc', 'docx'],
}
const TEXT_MIMES = [
  'application/pdf', 'application/rtf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Value for <input type="file" accept>.
export function acceptAttr(kinds: MediaKind[]) {
  return kinds
    .flatMap((k) => [...(k === 'text' ? ['text/*', ...TEXT_MIMES] : [`${k}/*`]), ...EXTENSIONS[k].map((e) => `.${e}`)])
    .join(',')
}

export function kindOf(file: File): MediaKind | null {
  const mime = file.type
  for (const k of ['video', 'audio', 'image'] as const) if (mime.startsWith(`${k}/`)) return k
  if (mime.startsWith('text/') || TEXT_MIMES.includes(mime)) return 'text'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (Object.keys(EXTENSIONS) as MediaKind[]).find((k) => EXTENSIONS[k].includes(ext)) ?? null
}

// Length of a video/audio file in seconds, read from its metadata. null when
// the browser can't tell (e.g. a codec it can't play); the worker records the
// real duration after upload either way.
export function readDuration(file: File, kind: MediaKind): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video')
    const url = URL.createObjectURL(file)
    const done = (v: number | null) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(v)
    }
    const timer = setTimeout(() => done(null), 10000)
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null)
    el.onerror = () => done(null)
    el.src = url
  })
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ---------- the form as the browser holds it ----------

export type ParticipantDraft = { key: number; name: string; email: string }
export type FileInfo = { file: File; kind: MediaKind; duration: number | null }
export type Answers = Record<string, string | boolean>

export type Draft = {
  title: string
  description: string
  participants: ParticipantDraft[]
  answers: Answers
  file: FileInfo | null
  agreed: boolean
}

// Same pattern as the participant_emails check in the schema.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type Errors = Record<string, string>

// One custom answer, in the value column that matches its field type.
export type AnswerPayload = { field_id: string } & (
  | { value_text: string }
  | { value_number: number }
  | { value_bool: boolean }
  | { value_date: string }
)

// Keys: 'title', 'description', 'participants', `name-${key}`, `email-${key}`,
// `field-${id}`, 'file', 'agreed'.
export function validate(d: Draft, form: PublicForm, fields: PublicField[]): Errors {
  const e: Errors = {}
  if (!d.title.trim()) e.title = 'Enter a title.'
  if (!d.description.trim()) e.description = 'Enter a description.'

  for (const p of d.participants) {
    if (!p.name.trim()) e[`name-${p.key}`] = 'Enter a name.'
    if (p.email.trim() && !EMAIL_RE.test(p.email.trim())) e[`email-${p.key}`] = 'Check this email address.'
  }
  if (!d.participants.some((p) => p.email.trim())) {
    e.participants = `At least one ${form.participant_label.toLowerCase()} needs an email address.`
  }
  if (form.max_participants && d.participants.length > form.max_participants) {
    e.participants = `Up to ${form.max_participants} ${form.participants_label.toLowerCase()}.`
  }

  for (const f of fields) {
    const v = d.answers[f.id]
    if (f.type === 'checkbox') {
      if (f.required && v !== true) e[`field-${f.id}`] = 'This box must be checked.'
      continue
    }
    const text = typeof v === 'string' ? v.trim() : ''
    if (!text) {
      if (f.required) e[`field-${f.id}`] = f.type === 'choice' ? 'Pick one.' : 'This field is required.'
    } else if (f.type === 'number' && !Number.isFinite(Number(text))) {
      e[`field-${f.id}`] = 'Enter a number.'
    } else if (f.type === 'choice' && !(f.options ?? []).includes(text)) {
      e[`field-${f.id}`] = 'Pick one of the options.'
    }
  }

  if (form.file_requirement === 'required' && !d.file) e.file = 'Choose a file.'
  if (d.file) {
    const fileError = checkFile(d.file, form)
    if (fileError) e.file = fileError
  }

  if (form.agreement_text && !d.agreed) e.agreed = 'You need to agree before submitting.'
  return e
}

// R2's limit for one upload (same check as media_files_max_size).
export const MAX_FILE_BYTES = 5_000_000_000

export function checkFile(f: FileInfo, form: PublicForm): string | null {
  if (!form.accepted_kinds.includes(f.kind)) return 'This kind of file isn’t accepted.'
  if (f.file.size === 0) return 'This file is empty.'
  if (f.file.size > MAX_FILE_BYTES) return 'Files can be up to 5 GB.'
  const max = form.max_duration_seconds
  if (max && f.duration !== null && (f.kind === 'video' || f.kind === 'audio') && f.duration > max + 0.5) {
    return `This file is ${formatDuration(f.duration)} long. The limit is ${formatDuration(max)}.`
  }
  return null
}

// What the submit Edge Function receives. Blank optional answers are left out,
// and each answer goes in the value column that matches its field type.
export function toPayload(d: Draft, form: PublicForm, fields: PublicField[]) {
  return {
    project_id: form.project_id,
    title: d.title.trim(),
    description: d.description.trim(),
    agreed: d.agreed,
    participants: d.participants.map((p) => ({ name: p.name.trim(), email: p.email.trim() || null })),
    answers: fields.flatMap((f): AnswerPayload[] => {
      const v = d.answers[f.id]
      // A checkbox always has an answer: unticked is a real "no".
      if (f.type === 'checkbox') return [{ field_id: f.id, value_bool: v === true }]
      const text = typeof v === 'string' ? v.trim() : ''
      if (!text) return []
      if (f.type === 'number') return [{ field_id: f.id, value_number: Number(text) }]
      if (f.type === 'date') return [{ field_id: f.id, value_date: text }]
      return [{ field_id: f.id, value_text: text }]
    }),
    file: d.file && {
      name: d.file.file.name,
      mime: d.file.file.type || null,
      size_bytes: d.file.file.size,
      kind: d.file.kind,
      duration_seconds: d.file.duration === null ? null : Math.round(d.file.duration),
    },
  }
}
