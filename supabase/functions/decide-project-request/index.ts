// Approve or deny a project request (site admins only), then email the
// requester. The database function decide_project_request() does the change
// and the admin check; it runs as the caller so is_site_admin() sees them.
//
// POST { requestId, approve: boolean, note? }
// Returns { request, emailError? }, or { error } with a 4xx/5xx status.
//
// Optional secret REPLY_TO_EMAIL: where requesters' replies go. Without it,
// the email has no reply-to, so your personal address isn't shared.
import { getCaller, json, readJson } from '../_shared/http.ts'
import { APP_URL, escapeHtml, layout, sendEmail } from '../_shared/email.ts'

type Body = { requestId?: unknown; approve?: unknown; note?: unknown }

// Postgres error codes raised by decide_project_request().
const STATUS_FOR_CODE: Record<string, number> = { '42501': 403, P0002: 404, '55000': 409 }

Deno.serve(async (req) => {
  const caller = await getCaller(req)
  if (caller instanceof Response) return caller

  const body = await readJson<Body>(req)
  if (!body) return json(400, { error: 'Request body must be JSON.' })
  if (typeof body.requestId !== 'string') return json(400, { error: 'Missing request.' })
  if (typeof body.approve !== 'boolean') return json(400, { error: 'Choose approve or deny.' })
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > 2000) return json(400, { error: 'Keep the message under 2000 characters.' })

  const { data: request, error } = await caller.asCaller.rpc('decide_project_request', {
    p_request_id: body.requestId,
    p_approve: body.approve,
    p_note: note || null,
  })
  if (error) return json(STATUS_FOR_CODE[error.code] ?? 500, { error: error.message })

  // --- Tell the requester ------------------------------------------------------
  const name = request.project_name as string
  const noteHtml = request.decision_note
    ? `<p style="font-size: 15px; line-height: 1.5; white-space: pre-wrap; border-left: 2px solid #ecdfe8; padding-left: 12px;">${escapeHtml(request.decision_note)}</p>`
    : ''
  const noteText = request.decision_note ? `\n\n${request.decision_note}` : ''
  const replyTo = Deno.env.get('REPLY_TO_EMAIL') || undefined

  let emailError: string | null
  if (request.status === 'approved') {
    const url = `${APP_URL}#/projects/${request.project_id}/settings`
    emailError = await sendEmail({
      to: [request.email],
      replyTo,
      subject: `Your Project Is Approved: ${name}`,
      html: layout(
        `<p style="font-size: 16px; line-height: 1.5;">Your project <strong>${escapeHtml(name)}</strong> is approved. You're its owner, so you can set up the form and invite your team.</p>${noteHtml}`,
        { label: 'Open Your Project', url },
      ),
      text: `Your project "${name}" is approved. You're its owner, so you can set up the form and invite your team.${noteText}\n\nOpen it: ${url}`,
    })
  } else {
    emailError = await sendEmail({
      to: [request.email],
      replyTo,
      subject: `About Your Project Request: ${name}`,
      html: layout(
        `<p style="font-size: 16px; line-height: 1.5;">Your request for <strong>${escapeHtml(name)}</strong> wasn't approved.</p>${noteHtml}`,
      ),
      text: `Your request for "${name}" wasn't approved.${noteText}`,
    })
  }
  if (emailError) console.error('decide-project-request: requester email failed:', emailError)

  return json(200, { request, emailError: emailError ?? undefined })
})
