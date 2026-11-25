# Roles and Auth

## Accounts and access
- Anyone can sign in with a passwordless **magic link** (Supabase Auth).
- **New projects need a site admin's approval** (the site is public and storage is limited).
  - A signed-in user sends a **project request**: project name, form link, close date and what it's for. They can have one waiting request at a time.
  - The site admin is emailed the request, with the requester's email (replying goes to the requester). They approve or deny it on the **Project Requests** page in the app, not from the email, because email link scanners could click an approve link.
  - Approving creates the project with the requester as **owner** (the admin isn't added to it). If the form link was taken in the meantime, a number is added (e.g. `-2`). Denying keeps the request, with an optional message.
  - The requester is emailed the decision and sees it on their Projects page.
  - Site admins (`site_admins`, added by hand in the SQL editor) can also create projects directly. Requests and requesters' emails are visible only to site admins and to the requester (RLS).
- Team members join by **email invite**. A manager adds their email and role, and an Edge Function creates the `project_members` row and emails them a **Supabase magic link**. Everyone uses the same sign-in system; there are no custom invite tokens.
  - Members never create a password or fill out an account form. Clicking the link signs them in.
  - If their session expires, they enter their email to get a new link.
  - **Permissions come from `project_members`, not from the link.** One email can be an owner in one project and a viewer in another.
  - Their votes are saved to their membership/email.
  - Managers can resend an invite or revoke access (`revoked_at`). RLS denies a revoked member even if they still have a valid session.

## Permissions
| Role | View submissions and results | Vote/score/tag | Final decisions, assignments, send results | Manage project and team | Delete project |
|---|---|---|---|---|---|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Co-manager | ✅ | ✅ | ✅ | ✅ | ❌ |
| Reviewer | ✅ | ✅ (assigned items) | ❌ | ❌ | ❌ |
| Viewer | ✅ | ❌ | ❌ | ❌ | ❌ |

"Managers" means the owner and co-managers.

## Rules
- Each member has an **"Include in review rotation"** checkbox. Only members with it on get assignments.
  - Stored as `role` (`owner` / `co_manager` / `member`) plus `in_review_rotation`.
  - A `member` with it on is shown as **Reviewer**, and with it off as **Viewer**. Members default to on.
  - Managers default to off but can turn it on to review too (not required).
  - Managers can change this for anyone.
- If a reviewer is switched to viewer, their **completed votes stay** and their **unfinished assignments are reassigned** to other reviewers.
- **Removing a member** revokes their invite link, so they lose access, and reassigns their unfinished assignments. The manager chooses **"Keep their votes?"**
  - Keep: their votes and tags still count.
  - Discard: they're marked discarded (not deleted), stop counting, and those submissions get a replacement reviewer.
- **Participant emails are visible only to managers.** Enforce this with Postgres Row Level Security (RLS), not only in the UI.
- Final statuses and the timeline are visible to the whole team.
