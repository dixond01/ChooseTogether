// Shared HTTP helpers for the Edge Functions.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// Service role: skips RLS. Only ever used on the server.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// The app is a static site on another origin, so the browser sends a CORS
// preflight. Access is decided by the bearer token, not the origin.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const adminClient = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

type Caller = { user: User; token: string; asCaller: SupabaseClient }

// CORS preflight and method check. Returns a Response to send back as-is, or
// null to go on. Public functions (no sign-in) call only this.
export function checkMethod(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  return null
}

// Handles CORS/method checks and identifies the signed-in caller.
// Returns a Response to send back as-is when the request can't go on.
export async function getCaller(req: Request): Promise<Caller | Response> {
  const early = checkMethod(req)
  if (early) return early

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'You must be signed in.' })

  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) return json(401, { error: 'Your session has expired. Sign in again.' })

  // Queries as the caller (their token, RLS on), so database rules decide access.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { user: data.user, token, asCaller }
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// Same check as participant_emails in the schema.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// Same check as projects.slug in the schema.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
