// Invite Edge Function: a manager adds someone to the team by email and role,
// and Supabase emails them a magic link. Also used to resend an invite and to
// bring back a removed member.
//
// POST { projectId, email, role: 'co_manager' | 'member', inReviewRotation, redirectTo, resend? }
// Returns { member } (the project_members row), or { error } with a 4xx/5xx status.
//
// Permissions come from project_members, not from the link: this only creates
// the row and sends a normal sign-in link. claim_memberships() links the row
// to the account the first time they sign in.
import { adminClient, EMAIL_RE, getCaller, json, readJson } from '../_shared/http.ts'

// The owner is set when the project is created; nobody is invited as owner.
const INVITABLE_ROLES = ['co_manager', 'member'] as const
type InvitableRole = (typeof INVITABLE_ROLES)[number]

type Body = {
  projectId?: unknown
  email?: unknown
  role?: unknown
  inReviewRotation?: unknown
  redirectTo?: unknown
  resend?: unknown
}

Deno.serve(async (req) => {
  // --- Who is calling? ---------------------------------------------------
  const caller = await getCaller(req)
  if (caller instanceof Response) return caller
  const { asCaller } = caller
  const admin = adminClient()

  // --- Validate input ----------------------------------------------------
  const body = await readJson<Body>(req)
  if (!body) return json(400, { error: 'Request body must be JSON.' })
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role as InvitableRole
  const resend = body.resend === true
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined

  if (!projectId) return json(400, { error: 'Missing project.' })
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' })
  if (!resend && !INVITABLE_ROLES.includes(role)) return json(400, { error: 'Choose a role.' })
  if (!resend && typeof body.inReviewRotation !== 'boolean') {
    return json(400, { error: 'Missing review rotation.' })
  }

  // --- Is the caller a manager of this project? ----------------------------
  // Asked as the caller (their token, RLS on), so the same is_manager() rule
  // the database policies use decides it. Revoked managers get false.
  const { data: isManager, error: roleError } = await asCaller.rpc('is_manager', { p_project_id: projectId })
  if (roleError) return json(500, { error: roleError.message })
  if (!isManager) return json(403, { error: 'Only the owner and co-managers can invite people.' })

  // --- Create, restore or find the membership row ---------------------------
  const { data: existing, error: findError } = await admin
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('email', email)
    .maybeSingle()
  if (findError) return json(500, { error: findError.message })

  let member = existing
  if (resend) {
    if (!existing || existing.revoked_at) return json(404, { error: 'That person is not on the team.' })
  } else if (existing && !existing.revoked_at) {
    return json(409, { error: `${email} is already on the team.` })
  } else if (existing) {
    // Removed earlier: bring them back with the new role. Their old votes stay
    // tied to this same row, so history isn't lost.
    if (existing.role === 'owner') return json(409, { error: 'That email is the project owner.' })
    const { data, error } = await admin
      .from('project_members')
      .update({
        role,
        in_review_rotation: body.inReviewRotation as boolean,
        revoked_at: null,
        invited_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return json(500, { error: error.message })
    member = data
  } else {
    const { data, error } = await admin
      .from('project_members')
      .insert({
        project_id: projectId,
        email,
        role,
        in_review_rotation: body.inReviewRotation as boolean,
      })
      .select()
      .single()
    // 23505: someone else invited the same email a moment ago.
    if (error) {
      return json(error.code === '23505' ? 409 : 500, {
        error: error.code === '23505' ? `${email} is already on the team.` : error.message,
      })
    }
    member = data
  }

  // --- Send the magic link ---------------------------------------------------
  // A normal Supabase sign-in link (creates the account on first use). The
  // email templates point it at the app with ?token_hash=..., which the app
  // verifies; Auth only redirects to URLs on its allow list.
  const { error: sendError } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  })
  if (sendError) {
    // The row is saved either way, so the manager can just click Resend.
    const tooSoon = sendError.status === 429
    return json(tooSoon ? 429 : 502, {
      member,
      error: tooSoon
        ? `Added ${email}, but the email wasn't sent: too many emails were sent recently. Try Resend in a minute.`
        : `Added ${email}, but the email wasn't sent: ${sendError.message}`,
    })
  }

  return json(200, { member })
})
