// Upload: the browser's side of putting a submission's file in R2 (no sign-in).
// The job ID from `submit` is the key: it's random and only the submitter's
// browser (and managers) ever see it.
//
// POST { job_id, action: 'url' }       a fresh signed upload URL (to retry a failed upload)
// POST { job_id, action: 'complete' }  checks the file arrived whole, then queues conversion
// Returns { url } / { ok: true }, or { error } with a 4xx/5xx status.
import { adminClient, checkMethod, json, readJson } from '../_shared/http.ts'
import { objectSize, r2Configured, signedPutUrl } from '../_shared/r2.ts'

type Body = { job_id?: unknown; action?: unknown }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// How long after submitting the browser may still upload.
const UPLOAD_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const early = checkMethod(req)
  if (early) return early

  const body = await readJson<Body>(req)
  const jobId = typeof body?.job_id === 'string' ? body.job_id : ''
  const action = body?.action
  if (!UUID_RE.test(jobId) || (action !== 'url' && action !== 'complete')) {
    return json(400, { error: 'Send a job_id and an action of "url" or "complete".' })
  }
  if (!r2Configured) {
    console.error('upload: R2 secrets are missing')
    return json(503, { error: 'File uploads aren’t working right now. Please try again later.' })
  }

  const admin = adminClient()
  const { data: job, error } = await admin
    .from('processing_jobs')
    .select('id, status, created_at, requested_by, media_files(original_key, original_size_bytes)')
    .eq('id', jobId)
    .maybeSingle()
  if (error) return json(500, { error: error.message })
  // Reprocess jobs (requested_by set) never take uploads.
  if (!job || job.requested_by) return json(404, { error: 'This upload doesn’t exist.' })

  const media = job.media_files as unknown as { original_key: string; original_size_bytes: number }

  if (job.status !== 'awaiting_upload') {
    // A repeated "complete" (e.g. a retry after a dropped response) is fine.
    if (action === 'complete') return json(200, { ok: true })
    return json(409, { error: 'This file was already uploaded.' })
  }
  if (Date.now() - new Date(job.created_at).getTime() > UPLOAD_WINDOW_MS) {
    return json(410, { error: 'This upload link has expired. Contact the organizer.' })
  }

  if (action === 'url') return json(200, { url: await signedPutUrl(media.original_key) })

  // ---------- complete ----------
  const size = await objectSize(media.original_key)
  if (size === null) return json(409, { error: 'The file didn’t finish uploading. Try again.', code: 'missing' })
  if (size !== Number(media.original_size_bytes)) {
    return json(409, { error: 'The file didn’t finish uploading. Try again.', code: 'size' })
  }

  const { error: updateError } = await admin
    .from('processing_jobs')
    .update({ status: 'queued' })
    .eq('id', jobId)
    .eq('status', 'awaiting_upload')
  if (updateError) return json(500, { error: updateError.message })

  // TODO (11/30): invoke the ffmpeg Lambda asynchronously with the job ID.
  return json(200, { ok: true })
})
