// Cloudflare R2 access for the Edge Functions. R2 speaks the S3 API, and
// aws4fetch signs the requests (AWS Signature V4) with the R2 API token.
// The bucket is private: the browser only ever gets short-lived signed URLs.
//
// Secrets (npx supabase secrets set --remote NAME=value; locally in supabase/functions/.env):
//   R2_ACCOUNT_ID         Cloudflare account ID
//   R2_ACCESS_KEY_ID      R2 API token's access key ID (Object Read & Write on the bucket)
//   R2_SECRET_ACCESS_KEY  R2 API token's secret access key
//   R2_BUCKET             bucket name
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
const BUCKET = Deno.env.get('R2_BUCKET')

export const r2Configured = !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET)

const client = r2Configured
  ? new AwsClient({ accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY!, service: 's3', region: 'auto' })
  : null

function objectUrl(key: string) {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return new URL(`https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${path}`)
}

// A URL the browser can PUT one file to, valid for `seconds`. R2 checks the
// expiry when the upload starts, so a long upload that started in time finishes.
export async function signedPutUrl(key: string, seconds = 3600): Promise<string> {
  if (!client) throw new Error('R2 is not set up')
  const url = objectUrl(key)
  url.searchParams.set('X-Amz-Expires', String(seconds))
  const signed = await client.sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } })
  return signed.url
}

// The object's size in bytes, or null if it doesn't exist.
export async function objectSize(key: string): Promise<number | null> {
  if (!client) throw new Error('R2 is not set up')
  const res = await client.fetch(objectUrl(key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`)
  return Number(res.headers.get('content-length'))
}
