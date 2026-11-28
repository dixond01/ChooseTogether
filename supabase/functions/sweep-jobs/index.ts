// Sweep-jobs: restarts stuck conversion jobs. Called every 5 minutes by
// pg_cron (invoke_job_sweep() in 20261201150000_job_sweep.sql), not by browsers.
//
// POST with Authorization: Bearer <JOB_SWEEP_SECRET>
// Returns { invoked, failed } counts.
//
// Secret: JOB_SWEEP_SECRET, the same value as the job_sweep_secret Vault secret.
import { adminClient, json } from '../_shared/http.ts'
import { startConversion } from '../_shared/converter.ts'

const SECRET = Deno.env.get('JOB_SWEEP_SECRET')
// Invocations sent at once. Each is a quick async call that AWS answers with 202.
const BATCH = 10

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  if (!SECRET) {
    console.error('sweep-jobs: JOB_SWEEP_SECRET is missing')
    return json(503, { error: 'Not set up' })
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!sameSecret(token, SECRET)) return json(401, { error: 'Unauthorized' })

  const { data: ids, error } = await adminClient().rpc('sweep_jobs')
  if (error) {
    console.error('sweep-jobs: sweep_jobs failed', error.message)
    return json(500, { error: error.message })
  }

  const jobIds = (ids ?? []) as string[]
  let invoked = 0
  for (let i = 0; i < jobIds.length; i += BATCH) {
    const results = await Promise.all(jobIds.slice(i, i + BATCH).map(startConversion))
    invoked += results.filter(Boolean).length
  }
  const failed = jobIds.length - invoked
  if (jobIds.length) console.log(`sweep-jobs: invoked ${invoked}, failed ${failed}`)
  return json(200, { invoked, failed })
})
