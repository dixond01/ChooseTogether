// Sends app emails (not sign-in links; Supabase Auth sends those over SMTP).
//
// Secrets (npx supabase secrets set --remote NAME=value):
//   RESEND_API_KEY  Resend API key. Without it, emails go to MAILPIT_URL (local dev).
//   EMAIL_FROM      e.g. "ChooseTogether <noreply@mail.choosetogether.app>"
//   APP_URL         link target in emails, default https://choosetogether.app/
// Locally these come from supabase/functions/.env.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MAILPIT_URL = Deno.env.get('MAILPIT_URL')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'ChooseTogether <noreply@mail.choosetogether.app>'
export const APP_URL = Deno.env.get('APP_URL') ?? 'https://choosetogether.app/'

type Email = {
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

// Returns null when sent, or an error message. Never throws: callers have
// already saved their change and only report a failed email.
export async function sendEmail(email: Email): Promise<string | null> {
  try {
    if (RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: email.replyTo,
        }),
      })
      if (!res.ok) return `Email service error ${res.status}: ${await res.text()}`
      return null
    }
    if (MAILPIT_URL) {
      const from = EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? EMAIL_FROM
      const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from, Name: 'ChooseTogether' },
          To: email.to.map((Email) => ({ Email })),
          ReplyTo: email.replyTo ? [{ Email: email.replyTo }] : [],
          Subject: email.subject,
          HTML: email.html,
          Text: email.text,
        }),
      })
      if (!res.ok) return `Mailpit error ${res.status}: ${await res.text()}`
      return null
    }
    return 'Email is not set up (RESEND_API_KEY is missing).'
  } catch (e) {
    return `Email failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

// Requesters write the project name and note, so escape them before putting
// them in HTML.
export function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// A simple branded layout matching the sign-in email.
export function layout(bodyHtml: string, button?: { label: string; url: string }) {
  const btn = button
    ? `<p style="margin: 28px 0;"><a href="${escapeHtml(button.url)}" style="background: #6e2f63; color: #ffffff; padding: 12px 22px; border-radius: 10px; text-decoration: none;">${escapeHtml(button.label)}</a></p>`
    : ''
  return `<div style="font-family: Georgia, serif; color: #3b3e37; max-width: 520px;">
  <h2 style="font-weight: 400; font-size: 26px; margin: 0 0 16px;">ChooseTogether</h2>
  ${bodyHtml}
  ${btn}
</div>`
}

// "Sat, Dec 12, 11:59 PM MST". Utah time unless TIME_ZONE says otherwise.
export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: Deno.env.get('TIME_ZONE') ?? 'America/Denver',
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}
