// Lambda entry point: converts one submission file per invocation.
//
// Invoked asynchronously by the upload Edge Function (and, from 12/1, the
// pg_cron sweep) with { "job_id": "<uuid>" }. Steps:
//   1. claim_job: queued -> running with a lease. Lost the race? Exit.
//   2. Download the original from R2 into /tmp.
//   3. Convert with ffmpeg (src/convert.mjs), in "safe" mode for Reprocess jobs.
//   4. Upload the result to converted/<project>/<file>.<ext>, replacing any
//      earlier conversion.
//   5. finish_job: done (with the real duration) or failed (with the error).
//
// It never throws after claiming: errors are recorded on the job instead, so
// AWS doesn't retry a file that will fail the same way again. Stuck jobs
// (e.g. the whole Lambda was killed) are the sweep's job.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_* (see r2.mjs),
//      FFMPEG_PATH / FFPROBE_PATH (optional).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { OUTPUT, convert } from './convert.mjs'
import { download, upload } from './r2.mjs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Longer than Lambda's 15-minute limit, so the sweep only takes over from a
// run that is really gone.
const LEASE_SECONDS = 20 * 60
// Stop ffmpeg this long before Lambda's deadline, to leave time to record the failure.
const SAFETY_MS = 45 * 1000

let db

function supabase() {
  if (db) return db
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not set up (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }
  db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return db
}

// originals/<project>/<file>.mov -> converted/<project>/<file>.mp4
export function convertedKey(originalKey, ext) {
  const base = originalKey.replace(/^originals\//, '').replace(/\.[^./]*$/, '')
  return `converted/${base}.${ext}`
}

async function finish(jobId, result) {
  const { data, error } = await supabase().rpc('finish_job', {
    p_job_id: jobId,
    p_ok: result.ok,
    p_converted_key: result.convertedKey ?? null,
    p_duration_seconds: result.duration ?? null,
    p_error: result.error ?? null,
  })
  if (error) console.error(`job ${jobId}: finish_job failed`, error.message)
  else if (data === false) console.warn(`job ${jobId}: no longer running; result not recorded`)
}

export async function handler(event, context) {
  const jobId = event?.job_id
  if (typeof jobId !== 'string' || !UUID_RE.test(jobId)) {
    console.error('Invoked without a valid job_id', JSON.stringify(event))
    return { status: 'invalid' }
  }

  const { data: rows, error } = await supabase().rpc('claim_job', {
    p_job_id: jobId,
    p_lease_seconds: LEASE_SECONDS,
  })
  if (error) throw new Error(`claim_job failed: ${error.message}`)
  const job = rows?.[0]
  if (!job) {
    console.log(`job ${jobId}: not queued (already claimed or finished); exiting`)
    return { status: 'skipped' }
  }
  console.log(`job ${jobId}: claimed (${job.kind}, ${job.mode}, attempt ${job.attempts})`)

  if (job.original_deleted) {
    await finish(jobId, { ok: false, error: 'The original file was deleted' })
    return { status: 'failed' }
  }
  if (!job.needs_conversion) {
    await finish(jobId, { ok: true, convertedKey: job.original_key })
    return { status: 'done' }
  }

  const remaining = context?.getRemainingTimeInMillis?.() ?? 15 * 60 * 1000
  const signal = AbortSignal.timeout(Math.max(remaining - SAFETY_MS, 10_000))
  const dir = await mkdtemp(join(tmpdir(), 'job-'))
  const started = Date.now()

  try {
    const out = OUTPUT[job.kind]
    const input = join(dir, 'original')
    const output = join(dir, `converted.${out.ext}`)

    await download(job.original_key, input, { signal })
    const { duration } = await convert(job.kind, input, output, { mode: job.mode, signal })
    const key = convertedKey(job.original_key, out.ext)
    await upload(output, key, out.mime, { signal })

    await finish(jobId, { ok: true, convertedKey: key, duration })
    console.log(`job ${jobId}: done in ${Math.round((Date.now() - started) / 1000)}s -> ${key}`)
    return { status: 'done', key, duration }
  } catch (e) {
    const message = signal.aborted ? 'Conversion timed out' : (e?.message ?? String(e))
    console.error(`job ${jobId}: failed after ${Math.round((Date.now() - started) / 1000)}s: ${message}`)
    await finish(jobId, { ok: false, error: message })
    return { status: 'failed', error: message }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
