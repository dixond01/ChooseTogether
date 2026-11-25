// Request a project: a signed-in user asks for a new project, and the site
// admin is emailed. Projects are only created when an admin approves
// (decide-project-request). See Documents/spec/roles-and-auth.md.
//
// POST { name, slug, closesAt, note }
// Returns { request, emailError? }, or { error } with a 4xx/5xx status.
//
// Secret ADMIN_EMAIL: where request notices go (comma-separated for several).
// Without it, they go to the site admins' sign-in emails.
import { adminClient, getCaller, json, readJson, SLUG_RE } from '../_shared/http.ts'
import { APP_URL, escapeHtml, formatDate, layout, sendEmail } from '../_shared/email.ts'

type Body = { name?: unknown; slug?: unknown; closesAt?: unknown; note?: unknown }

Deno.serve(async (req) => {
  const caller = await getCaller(req)
  if (caller instanceof Response) return caller
  const { user } = caller

  // The email is what the admin uses to contact them, so it must be verified
  // (magic-link sign-in always is).
  if (!user.email || !user.email_confirmed_at) {
    return json(403, { error: 'Confirm your email address before requesting a project.' })
  }

  const body = await readJson<Body>(req)
  if (!body) return json(400, { error: 'Request body must be JSON.' })
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const closesAt = typeof body.closesAt === 'string' ? new Date(body.closesAt) : null

  if (!name || name.length > 200) return json(400, { error: 'Enter a project name (up to 200 characters).' })
  if (!SLUG_RE.test(slug)) return json(400, { error: 'The form link can use lowercase letters, numbers and single dashes.' })
  if (!closesAt || isNaN(closesAt.getTime())) return json(400, { error: 'Choose when submissions close.' })
  if (!note || note.length > 2000) return json(400, { error: 'Tell us what the project is for (up to 2000 characters).' })

  const admin = adminClient()

  const { data: taken } = await admin.from('projects').select('id').eq('slug', slug).maybeSingle()
  if (taken) return json(409, { error: 'That form link is already taken.' })

  const { data: request, error } = await admin
    .from('project_requests')
    .insert({
      user_id: user.id,
      email: user.email,
      project_name: name,
      slug,
      submissions_close_at: closesAt.toISOString(),
      note,
    })
    .select()
    .single()
  if (error) {
    // project_requests_one_pending
    if (error.code === '23505') return json(409, { error: 'You already have a request waiting for approval.' })
    return json(500, { error: error.message })
  }

  // --- Tell the admin --------------------------------------------------------
  let to = (Deno.env.get('ADMIN_EMAIL') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) {
    const { data: admins } = await admin.from('site_admins').select('user_id')
    for (const a of admins ?? []) {
      const { data } = await admin.auth.admin.getUserById(a.user_id)
      if (data.user?.email) to.push(data.user.email)
    }
  }
  to = [...new Set(to)]

  // The request is saved either way; the admin also sees it in the app.
  let emailError: string | null = 'No admin email is set up.'
  if (to.length > 0) {
    const reviewUrl = `${APP_URL}#/admin/requests`
    emailError = await sendEmail({
      to,
      replyTo: user.email, // reply goes straight to the requester
      subject: `Project Request: ${name}`,
      html: layout(
        `<p style="font-size: 16px; line-height: 1.5;"><strong>${escapeHtml(user.email)}</strong> requested a project.</p>
  <table style="font-size: 15px; line-height: 1.5; border-collapse: collapse;">
    <tr><td style="padding: 2px 16px 2px 0; color: #5f625a;">Project</td><td>${escapeHtml(name)}</td></tr>
    <tr><td style="padding: 2px 16px 2px 0; color: #5f625a;">Form Link</td><td>/f/${escapeHtml(slug)}</td></tr>
    <tr><td style="padding: 2px 16px 2px 0; color: #5f625a;">Closes</td><td>${escapeHtml(formatDate(closesAt.toISOString()))}</td></tr>
  </table>
  <p style="font-size: 15px; line-height: 1.5; white-space: pre-wrap; border-left: 2px solid #ecdfe8; padding-left: 12px;">${escapeHtml(note)}</p>
  <p style="font-size: 14px; color: #5f625a;">Reply to this email to contact them.</p>`,
        { label: 'Review Request', url: reviewUrl },
      ),
      text: `${user.email} requested a project.\n\nProject: ${name}\nForm link: /f/${slug}\nCloses: ${formatDate(closesAt.toISOString())}\n\n${note}\n\nReview it: ${reviewUrl}\nReply to this email to contact them.`,
    })
    if (emailError) console.error('request-project: admin email failed:', emailError)
  }

  return json(200, { request, emailError: emailError ?? undefined })
})
