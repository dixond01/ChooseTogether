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
- **GitHub Pages hosting:** use a **hash router** (`/#/...`) because Pages can't serve deep links. The site is served at the custom domain **https://choosetogether.app/** (www redirects to it), so Vite `base` is `/`. Supabase Auth Site URL and redirect URLs must include `https://choosetogether.app/`.

## UI design
- **Helper text is a last resort.** Don't add small explanatory text (subtitles, hints, "what this does" lines) under headings or fields. Let signifiers do the explaining: clear labels, placeholders, units, input types, icons, grouping and sensible defaults. Use helper text only when a mistake would be costly or hard to undo (e.g. "Changing this breaks links you've already shared").
- **Less text, no decoration.** No eyebrow lines above titles (e.g. "SETTINGS · REVIEW"), no captions on choice cards, no monospace or all-caps labels, no decorative symbols (✦, →). These make the UI look generic and AI-made.
- **Type (Google Fonts):** large titles in **Marcellus** (e.g. 56px page titles, 26px project name in the sidebar). Everything else is **Tenor Sans**: body, buttons, inputs, values. Field labels are Tenor Sans **bold** 15px.
- **Capitalization: Title Case** for every label, heading, button, link, nav item, choice card, placeholder chip and tab ("Reviewers per Submission", "Save Review Rules", "Email Me a Sign-In Link"). Keep short words (a, an, the, and, or, of, per, to, for, in, on, at, by) lowercase unless first. Full sentences (warnings, errors, empty states) stay in normal sentence form, and units inside fields stay lowercase ("90 min"). Tenor Sans has one weight (bold is browser-synthesized), so build hierarchy mostly with big size jumps.
- **Palette:** white `#ffffff` page and top bar, light plum tint `#f8f1f6` for the sidebar, charcoal `#3b3e37` for most text (`#5f625a` for secondary), plum `#6e2f63` as the main accent, plum tint `#f6eef4` for selected/focus states, pale plum `#ecdfe8` for divider lines, gold `#d1a318` as a rare accent for small markers only (never text). No creams.
- **Controls:** inputs, steppers, choice cards and tags are white with a 1px plum border. Focus adds a plum ring plus a soft plum-tint glow; a selected choice card gets the plum-tint fill and a thicker plum border. Size each field to its content (e.g. ~150px for numbers with units, ~270px for dates, ~420px for names, full column ~680px for paragraphs). Put units inside the field ("90 min"), prefer steppers, switches and choice cards over bare number inputs and selects, and show read-only values (e.g. a formatted date) with a "Change" link.
- **Buttons:** one filled plum primary per section, named for what it does ("Save review rules"), disabled until something changes; secondary actions are plain plum text links.
- **Shape:** rounded corners (10px), pills for tags. Prefer spacing and thin rules over bordered cards. Keep animations fast or none.
- **Logo:** `web/public/logo.svg` ("Tumble"): a gold circle, charcoal square and plum triangle as playful wooden shape-sorter pieces, slightly tilted, no holes. Shown left of the Marcellus "ChooseTogether" wordmark.
- **Layout:** pages fill the width. Settings use a left sidebar of sections with one section shown at a time, and rarely changed options are collapsed (progressive disclosure).

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
