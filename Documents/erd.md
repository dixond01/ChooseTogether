# ChooseTogether ERD (v1)

Postgres on Supabase. `auth.users` is Supabase's built-in user table. Everyone on a team, owners and invited members alike, signs in with a magic link. Their permissions come from `project_members`, matched by email. Performers never sign in.

The schema is split into four areas. The overview shows how they connect, and each section below has the full columns for its tables. Tables from another area appear as small stubs (just `id`) so the links are clear.

## Overview

```mermaid
flowchart LR
    subgraph People["1. People & Projects"]
        auth_users --> project_members
        projects --> project_members
        projects --> tags
        projects --> project_fields
    end
    subgraph Intake["2. Intake"]
        submissions --> participants
        participants --> participant_emails
        submissions --> media_files
        media_files --> processing_jobs
        submissions --> submission_answers
    end
    subgraph Review["3. Review"]
        assignments --> votes
        submission_tags
        decision_log
    end
    subgraph Results["4. Results & Timeline"]
        email_templates
        email_log
        timelines --> timeline_items
    end
    projects --> submissions
    project_fields --> submission_answers
    submissions --> assignments
    project_members --> assignments
    submissions --> submission_tags
    tags --> submission_tags
    submissions --> decision_log
    projects --> email_templates
    submissions --> email_log
    projects --> timelines
    submissions --> timeline_items
```

Arrows point from the parent ("one") to the child ("many").

## 1. People & Projects

```mermaid
erDiagram
    AUTH_USERS ||--o{ PROJECT_MEMBERS : "signs in as"
    PROJECTS ||--|{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ TAGS : defines
    PROJECTS ||--o{ PROJECT_FIELDS : "adds to form"

    AUTH_USERS {
        uuid id PK
        text email
    }
    PROJECTS {
        uuid id PK
        text name
        text slug UK "public form URL"
        timestamptz submissions_close_at
        int max_participants "null = no limit"
        int max_duration_seconds "null = no limit"
        int reviewers_per_submission "default 2"
        decision_rule decision_rule "any_disagreement_to_owner | majority"
        bool score_required
        retention_policy retention_policy "after_conversion | until_results_sent | forever"
        int retention_grace_days
        int target_show_seconds
        text agreement_text
        text title_label "default Title"
        text description_label "default Description"
        text participant_label "default Participant"
        text participants_label "default Participants"
        text file_label "default File"
        file_requirement file_requirement "required | optional | none"
        media_kind_array accepted_kinds "at least one"
        bool show_enabled "Show settings on/off"
        timestamptz results_sent_at
        timestamptz created_at
    }
    PROJECT_MEMBERS {
        uuid id PK
        uuid project_id FK
        uuid user_id FK "set when they first sign in via magic link"
        citext email "UK with project_id"
        member_role role "owner | co_manager | member"
        bool in_review_rotation "member: on = Reviewer, off = Viewer"
        timestamptz invited_at
        timestamptz revoked_at
    }
    TAGS {
        uuid id PK
        uuid project_id FK
        citext name "UK with project_id, case-insensitive"
    }
    PROJECT_FIELDS {
        uuid id PK
        uuid project_id FK
        text label
        field_type type "short_text | long_text | number | choice | checkbox | date"
        bool required
        int position "UK with project_id, form order"
        text placeholder "text and number types only"
        text_array options "choice only, at least 2"
        timestamptz archived_at "set = hidden from the form"
        timestamptz created_at
    }
```

## 2. Intake

```mermaid
erDiagram
    PROJECTS ||--o{ SUBMISSIONS : receives
    SUBMISSIONS ||--|{ PARTICIPANTS : includes
    PARTICIPANTS ||--o| PARTICIPANT_EMAILS : "may have"
    SUBMISSIONS ||--|| MEDIA_FILES : has
    MEDIA_FILES ||--o{ PROCESSING_JOBS : "converted by"
    PROJECT_MEMBERS ||--o{ PROCESSING_JOBS : "requests reprocess"
    SUBMISSIONS ||--o{ SUBMISSION_ANSWERS : answers
    PROJECT_FIELDS ||--o{ SUBMISSION_ANSWERS : "answered in"

    PROJECTS {
        uuid id PK
    }
    PROJECT_MEMBERS {
        uuid id PK
    }
    PROJECT_FIELDS {
        uuid id PK
    }
    SUBMISSIONS {
        uuid id PK
        uuid project_id FK
        text act_title "label set per project"
        text description "label set per project"
        submission_status status "submitted ... not_selected"
        submission_status last_emailed_status "for follow-up flag"
        timestamptz agreed_at
        timestamptz submitted_at
    }
    PARTICIPANTS {
        uuid id PK
        uuid submission_id FK
        int position "UK with submission_id"
        text name
    }
    PARTICIPANT_EMAILS {
        uuid participant_id PK, FK
        citext email "managers only (RLS)"
    }
    SUBMISSION_ANSWERS {
        uuid submission_id PK, FK
        uuid field_id PK, FK
        text value_text "short_text, long_text, choice"
        numeric value_number "number"
        bool value_bool "checkbox"
        date value_date "date"
    }
    MEDIA_FILES {
        uuid id PK
        uuid submission_id FK, UK "no row when the project asks for no file"
        media_kind kind "video | audio | image | text"
        text original_key "R2 object key"
        text original_mime "uploaded file type, e.g. video/quicktime"
        bigint original_size_bytes
        timestamptz original_deleted_at
        text converted_key
        int duration_seconds
        processing_status processing_status "pending | ready | failed"
    }
    PROCESSING_JOBS {
        uuid id PK
        uuid media_file_id FK
        uuid requested_by FK "null = initial upload"
        job_mode mode "standard | safe"
        job_status status "awaiting_upload | queued | running | done | failed"
        timestamptz lease_until "running jobs past this are requeued"
        int attempts
        text error
        timestamptz created_at
        timestamptz finished_at
    }
```

## 3. Review

```mermaid
erDiagram
    SUBMISSIONS ||--o{ ASSIGNMENTS : "reviewed via"
    PROJECT_MEMBERS ||--o{ ASSIGNMENTS : assigned
    ASSIGNMENTS ||--o| VOTES : "results in"
    SUBMISSIONS ||--o{ SUBMISSION_TAGS : tagged
    TAGS ||--o{ SUBMISSION_TAGS : "applied as"
    PROJECT_MEMBERS ||--o{ SUBMISSION_TAGS : applies
    SUBMISSIONS ||--o{ DECISION_LOG : "status history"
    PROJECT_MEMBERS ||--o{ DECISION_LOG : changes

    SUBMISSIONS {
        uuid id PK
    }
    PROJECT_MEMBERS {
        uuid id PK
    }
    TAGS {
        uuid id PK
    }
    ASSIGNMENTS {
        uuid id PK
        uuid submission_id FK
        uuid member_id FK "UK with submission_id"
        uuid assigned_by FK "null = automatic"
        timestamptz assigned_at
    }
    VOTES {
        uuid id PK
        uuid assignment_id FK, UK
        vote_choice choice "selected | waitlisted | not_selected | maybe"
        smallint score "1-5, nullable"
        text notes
        timestamptz voted_at
        timestamptz updated_at
        timestamptz discarded_at "set if a manager discards on removal"
    }
    SUBMISSION_TAGS {
        uuid submission_id PK, FK
        uuid tag_id PK, FK
        uuid member_id PK, FK
        timestamptz created_at
        timestamptz discarded_at
    }
    DECISION_LOG {
        uuid id PK
        uuid submission_id FK
        submission_status from_status
        submission_status to_status
        uuid changed_by FK "null = system"
        text reason
        timestamptz created_at
    }
```

## 4. Results & Timeline

```mermaid
erDiagram
    PROJECTS ||--o{ EMAIL_TEMPLATES : has
    SUBMISSIONS ||--o{ EMAIL_LOG : "emails sent"
    PROJECT_MEMBERS ||--o{ EMAIL_LOG : sends
    PROJECTS ||--o{ TIMELINES : "drafts (stretch)"
    TIMELINES ||--o{ TIMELINE_ITEMS : contains
    SUBMISSIONS ||--o{ TIMELINE_ITEMS : "placed as"

    PROJECTS {
        uuid id PK
    }
    SUBMISSIONS {
        uuid id PK
    }
    PROJECT_MEMBERS {
        uuid id PK
    }
    EMAIL_TEMPLATES {
        uuid id PK
        uuid project_id FK
        submission_status status "UK with project_id"
        text subject
        text body
    }
    EMAIL_LOG {
        uuid id PK
        uuid submission_id FK
        citext recipient_email
        submission_status status_sent
        text subject
        uuid sent_by FK
        timestamptz sent_at
        text provider_message_id
        text delivery_status
    }
    TIMELINES {
        uuid id PK
        uuid project_id FK
        text label "e.g. Version A"
        bool is_official "at most one per project"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }
    TIMELINE_ITEMS {
        uuid id PK
        uuid timeline_id FK
        int position "UK with timeline_id"
        timeline_item_type item_type "act | break | intermission | mc | transition"
        uuid submission_id FK "only for acts"
        text label
        int duration_seconds
    }
```

## Key constraints and design notes
- **The owner is also a `project_members` row** (role `owner`, with `user_id`). Every permission check uses the same table.
- **Roles vs. reviewing:** `role` sets permissions (`owner`, `co_manager`, `member`). `in_review_rotation` decides who gets auto-assigned. The UI labels a `member` as **Reviewer** (on) or **Viewer** (off). Managers can turn it on for themselves (default off), and members default to on. This avoids contradictory states like a "viewer" who has assignments.
- **One owner per project:** a partial unique index on `project_members(project_id) WHERE role = 'owner'`.
- **One open processing job per file:** a partial unique index on `processing_jobs(media_file_id) WHERE status IN ('awaiting_upload','queued','running')`.
- **Job lifecycle:** `awaiting_upload` (created at submit) → `queued` (upload complete) → `running` (claimed by Lambda) → `done` or `failed`. The sweep only touches `queued` and `running`, so it never sends Lambda after a file that hasn't finished uploading.
- **No duplicate reviewers:** `UNIQUE(submission_id, member_id)` on `assignments`.
- **One vote per assignment:** `UNIQUE(assignment_id)` on `votes`. Votes hang off assignments, so a demoted reviewer's completed votes survive.
- **Votes are editable** (updates `updated_at`) until a manager sets the submission's final status. After that they're read-only. There's no vote history table.
- **Conflict check:** assignment skips a member whose `email` matches any `participant_emails.email` on that submission.
- **At least one participant email:** enforced by the submit Edge Function (in one transaction) and in the browser.
- **Finality of participants:** triggers block updates to `participants` and `participant_emails`, and RLS blocks all browser writes. Adding new participant rows to an existing submission is prevented only by the submit function being the sole writer (the database doesn't block a later insert by server code).
- **Flexible forms:** every project has the same core fields on `submissions` (title, description, participants, optional file), with labels set per project. Anything else is a `project_fields` row, and answers are typed rows in `submission_answers`, so the data stays relational.
  - Exactly one value column is filled per answer, and a trigger checks it matches the field's type and project, and that a choice answer is one of the options.
  - Answers are final (no updates). A field's type never changes, options with answers can only be added to, and a field with answers can't be deleted (foreign key), only hidden with `archived_at`.
  - Required custom fields are checked by the submit Edge Function and in the browser, like the participant email rule.
- **Combined tags:** `SELECT DISTINCT tag_id FROM submission_tags WHERE submission_id = ? AND discarded_at IS NULL`.
- **Decision log is append-only.** Every change to `submissions.status` inserts a row, ideally from a trigger.
- **Follow-up flag:** `status <> last_emailed_status` after results are sent.
- **Privacy:** participant emails live in their own 1-to-1 table, `participant_emails`, whose RLS policy allows only managers to read it. Reviewers and viewers can read `participants` (names) but get no rows from `participant_emails`. A participant without an email has no row there.
- **Removing a member** is soft: set `revoked_at`, so their invite link stops working, and their unfinished assignments are reassigned. The manager chooses whether to **keep or discard** their completed votes and tags.
  - Discarding sets `discarded_at` instead of deleting, so history stays intact.
  - Discarded votes and tags don't count toward decisions or combined tags.
  - Affected submissions get a replacement reviewer to fill the missing vote.
- **Timeline drafts:** a project can have many labeled `timelines`. At most one is marked official (partial unique index on `timelines(project_id) WHERE is_official`), and that's the one the team sees by default. An act appears at most once per timeline (`UNIQUE(timeline_id, submission_id)`).
- `citext` is a case-insensitive text type, so `Sam@x.com` = `sam@x.com`.
