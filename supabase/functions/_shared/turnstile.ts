// Cloudflare Turnstile: the public form's bot check. The browser widget gives
// a one-time token; this asks Cloudflare whether it's valid.
//
// Secret TURNSTILE_SECRET_KEY (npx supabase secrets set --remote ...). Locally,
// supabase/functions/.env uses Cloudflare's always-pass test secret.

const SECRET = Deno.env.get('TURNSTILE_SECRET_KEY')

export const turnstileConfigured = !!SECRET

export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!SECRET || !token) return false
  const form = new FormData()
  form.set('secret', SECRET)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const out = await res.json()
    return out.success === true
  } catch (e) {
    console.error('turnstile: verify failed:', e)
    return false
  }
}
