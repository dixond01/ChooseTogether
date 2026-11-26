// Submit: saves a public form submission (no sign-in). See
// Documents/spec/submission-form.md and files-and-conversion.md.
//
// 1. Checks the Turnstile token (bot check).
// 2. create_submission() checks every form rule and saves the submission,
//    participants, emails, answers, file row and first job in one transaction.
// 3. If there's a file, returns a signed URL the browser uploads it to
//    directly (R2), then the browser calls `upload` { action: 'complete' }.
//
// POST { project_id, title, description, agreed, participants, answers, file, turnstile_token }
// Returns { submission_id, upload: { job_id, url } | null }, or { error } with a 4xx/5xx status.
import { adminClient, checkMethod, json, readJson } from '../_shared/http.ts'
import { r2Configured, signedPutUrl } from '../_shared/r2.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'
import { extensionOf, fileMatchesKind, MEDIA_KINDS } from '../_shared/files.ts'

type Body = {
  project_id?: unknown
  title?: unknown
  description?: unknown
  agreed?: unknown
  participants?: unknown
  answers?: unknown
  file?: unknown
  turnstile_token?: unknown
}

type FileBody = { name?: unknown; mime?: unknown; size_bytes?: unknown; kind?: unknown; duration_seconds?: unknown }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rule failures from create_submission (22023) and the database checks behind
// it. Their messages are safe to show; the others get a general message.
const RULE_CODES = new Set(['22023', '23514', '22P02', '22007', '22008', '22003'])

Deno.serve(async (req) => {
  const early = checkMethod(req)
  if (early) return early

  const body = await readJson<Body>(req)
  if (!body || typeof body !== 'object') return json(400, { error: 'Request body must be JSON.' })

  const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : ''
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null
  if (!(await verifyTurnstile(token, ip))) {
    return json(403, { error: 'The spam check didn’t pass. Please try again.', code: 'turnstile' })
  }

  if (typeof body.project_id !== 'string' || !UUID_RE.test(body.project_id)) {
    return json(400, { error: 'This form doesn’t exist.' })
  }
  if (!Array.isArray(body.participants)) return json(400, { error: 'Participants must be a list.' })
  if (body.answers != null && !Array.isArray(body.answers)) return json(400, { error: 'Answers must be a list.' })

  // The file's details as the database wants them. The extension must fit the
  // kind, so e.g. an .exe can't be sent as a "video".
  let file: Record<string, unknown> | null = null
  if (body.file != null) {
    const f = body.file as FileBody
    const name = typeof f.name === 'string' ? f.name : ''
    const kind = typeof f.kind === 'string' ? f.kind : ''
    const size = typeof f.size_bytes === 'number' && Number.isInteger(f.size_bytes) ? f.size_bytes : 0
    const duration = typeof f.duration_seconds === 'number' ? Math.round(f.duration_seconds) : null
    const mime = typeof f.mime === 'string' && f.mime.length <= 200 ? f.mime : null
    if (!MEDIA_KINDS.includes(kind as never) || !fileMatchesKind(name, mime, kind)) {
      return json(400, { error: 'This kind of file isn’t accepted.' })
    }
    if (!r2Configured) {
      console.error('submit: R2 secrets are missing')
      return json(503, { error: 'File uploads aren’t working right now. Please try again later.' })
    }
    file = { kind, mime, size_bytes: size, duration_seconds: duration, ext: extensionOf(name) }
  }

  const admin = adminClient()
  const { data, error } = await admin.rpc('create_submission', {
    p_project_id: body.project_id,
    p_title: typeof body.title === 'string' ? body.title : '',
    p_description: typeof body.description === 'string' ? body.description : '',
    p_agreed: body.agreed === true,
    p_participants: body.participants,
    p_answers: body.answers ?? [],
    p_file: file,
  })
  if (error) {
    if (RULE_CODES.has(error.code)) {
      const message = error.code === '22023' ? error.message : 'Check your answers and try again.'
      return json(400, { error: message })
    }
    console.error('submit: create_submission failed:', error)
    return json(500, { error: 'Something went wrong, so your submission wasn’t sent. Please try again.' })
  }

  const row = (data as { submission_id: string; job_id: string | null; original_key: string | null }[])[0]
  if (!row.job_id || !row.original_key) return json(200, { submission_id: row.submission_id, upload: null })

  // The submission is saved. If signing fails here, the browser can ask again
  // with the job ID (upload { action: 'url' }).
  let url: string | null = null
  try {
    url = await signedPutUrl(row.original_key)
  } catch (e) {
    console.error('submit: signing failed:', e)
  }
  return json(200, { submission_id: row.submission_id, upload: { job_id: row.job_id, url } })
})
