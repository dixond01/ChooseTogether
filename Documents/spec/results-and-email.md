# Results and Email

## Templates
- An editable template per final status (Selected, Waitlisted, Not Selected), prefilled with default text.
- Placeholders: `{participant_name}`, `{act_title}`, `{project_name}`, `{organizer_email}`.

## Sending
- **Emails go out only when a manager clicks Send results.** Status changes never send emails automatically.
- Send results sends everything at once.
- Recipients: every participant on the submission who has an email, de-duplicated per send.
- Send through an email service (Resend or similar) from an Edge Function so the API key stays server-side.

## Follow-ups
- If a final status changes after results are sent, flag the act. A manager can then send it a follow-up email.

## Email log
- Every email sent is a row: submission, recipient, template/status, sent at, sent by, delivery status.
