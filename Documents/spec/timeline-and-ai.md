# Timeline and AI (stretch goal)

## Timeline
- An ordered list of **selected acts** plus non-act items (break, intermission, MC/host segment, transition), each with a duration.
- Shows each item's start time, the running total and the target show length.
- Managers drag items to reorder. The whole team can view the timelines.
- A project can have **several labeled timeline drafts** (e.g. "Version A"). Managers can mark **one as official**, and that's the one the team sees by default.

## AI suggestions
- **Suggestions only. The AI never changes the timeline or statuses itself.** Each suggestion has a short explanation, and a manager accepts or ignores it.
- What it can suggest:
  - an order that balances energy and variety (e.g. not three ballads in a row)
  - spacing so shared performers get time between their acts
  - grouping acts with similar stage & equipment needs
  - fitting the target length by recommending which waitlisted acts to promote or which selected acts to move to the waitlist
- Call the AI API from an **Edge Function** so the API key stays server-side.

## Tabled (keep possible, don't build)
- **Alternates:** a flag on the top 3–4 waitlisted acts, with their own email template.
- **Custom form fields:** possible later with a Postgres `JSONB` column.
- **Per-project status labels.**
