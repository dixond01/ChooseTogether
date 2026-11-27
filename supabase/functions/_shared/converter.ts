// Starts the ffmpeg Lambda (worker/) for one job. The invocation is
// asynchronous: AWS queues it and answers 202 right away.
//
// Secrets (npx supabase secrets set --remote NAME=value; locally in supabase/functions/.env).
// They belong to the choosetogether-invoker IAM user, which can only invoke this function.
//   CONVERTER_AWS_ACCESS_KEY_ID
//   CONVERTER_AWS_SECRET_ACCESS_KEY
//   CONVERTER_AWS_REGION       e.g. us-west-2
//   CONVERTER_FUNCTION_NAME    default choosetogether-converter
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const ACCESS_KEY_ID = Deno.env.get('CONVERTER_AWS_ACCESS_KEY_ID')
const SECRET_ACCESS_KEY = Deno.env.get('CONVERTER_AWS_SECRET_ACCESS_KEY')
const REGION = Deno.env.get('CONVERTER_AWS_REGION')
const FUNCTION_NAME = Deno.env.get('CONVERTER_FUNCTION_NAME') ?? 'choosetogether-converter'

const client = ACCESS_KEY_ID && SECRET_ACCESS_KEY && REGION
  ? new AwsClient({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY, service: 'lambda', region: REGION })
  : null

// Returns whether AWS accepted the invocation. A false here isn't an error for
// the caller: the job stays queued and the sweep starts it later.
export async function startConversion(jobId: string): Promise<boolean> {
  if (!client) {
    console.warn('converter: CONVERTER_AWS_* secrets are missing; job stays queued', jobId)
    return false
  }
  const url = `https://lambda.${REGION}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(FUNCTION_NAME)}/invocations`
  try {
    const res = await client.fetch(url, {
      method: 'POST',
      headers: { 'X-Amz-Invocation-Type': 'Event', 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 202) return true
    console.error('converter: invoke failed', res.status, await res.text())
  } catch (e) {
    console.error('converter: invoke failed', e)
  }
  return false
}
