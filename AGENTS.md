# AGENTS.md

## Agent Instructions
- Before using any new technology (language, framework, library, service or tool) that isn't already in the project, tell the user what it is and why you're using it.
- Read only the spec file for the area you're changing (see the spec map). Styling, refactors and tooling usually need none.
- **Supabase CLI (v3) targets the local Docker database by default.** Add `--remote` to any command meant for the live project (e.g. `npx supabase db push --remote`, `migration list --remote`, `gen types typescript --remote`). `--linked` is deprecated. Run tests locally with `npx supabase test db` (no flag).

## Project
ChooseTogether helps a team collect a large number of file submissions (video, audio, image, text) through a public form, review them together, and decide which are Selected, Waitlisted or Not Selected. The first real use is a volunteer talent show with about 200–300 videos; **the form must be live by about 12/03/2026** (it opens around 12/05). This is a CS 452 final project (requirements: `Documents/class_requirements.md`).

## Stack
React + TypeScript (Vite) on GitHub Pages · Supabase (Postgres, Auth magic links, Row Level Security, Edge Functions) · Cloudflare R2 for files · AWS Lambda ffmpeg worker · Resend (or similar) for email · free tiers wherever possible.

## Invariants (apply everywhere)
- **Participant emails are visible only to managers** (owner and co-managers). Enforce this with RLS, not only in the UI.
- **Submissions are final**: no editing after submit.
- **Each submission needs at least one participant with an email.** Validate in the browser and on the server.
- **No email is sent without a manager clicking Send.** Log every email.
- **Statuses are stored as fixed codes** (`submitted`, `in_review`, `pending_decision`, `selected`, `waitlisted`, `not_selected`). Labels are only in the UI.
- **History is append-only:** status changes go in the decision log, and votes are never overwritten by reshuffling.
- **API keys (AI, email, R2, AWS, Supabase service role) stay server-side** in Edge Functions or Lambda. The frontend is a public static site and may only contain the Supabase URL and anon key.
- **AI only suggests.** It never changes data itself.
- **GitHub Pages hosting:** use a **hash router** (`/#/...`) because Pages can't serve deep links. Vite `base` must match the Pages path (`/ChooseTogether/`) unless a custom domain is used. Supabase Auth redirect URLs must include the Pages URL.

## Spec map (`Documents/spec/`)
| Working on | Read |
|---|---|
| Roles, permissions, invites, sign-in | `roles-and-auth.md` |
| Project settings and defaults | `projects-and-settings.md` |
| Public form, participants, validation | `submission-form.md` |
| Uploads, ffmpeg worker, reprocess, file retention | `files-and-conversion.md` |
| Assignment, review queue/list, votes, tags, statuses, decision log | `review-workflow.md` |
| Email templates, sending results, follow-ups, email log | `results-and-email.md` |
| Timeline builder, AI suggestions, tabled ideas | `timeline-and-ai.md` |

## Priorities
1. **Intake (by ~12/03):** owner sign-in, projects and settings, invite links, public form, R2 upload, conversion worker, spam protection.
2. **Review MVP (by 12/10):** auto-assignment with conflict check, queue/list review, decision rule, final statuses, decision log, team-visible results.
3. **Next:** email templates and sending, email log, follow-ups, Reprocess, retention settings, manual reviewer swaps.
4. **Stretch:** timeline builder, AI suggestions.
