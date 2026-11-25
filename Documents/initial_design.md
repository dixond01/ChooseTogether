# ChooseTogether: Initial Design

> This is the original design from 11/19. For the current schema, see [erd.md](erd.md) and the migrations in `supabase/migrations/`.

## Purpose and Goals

I am creating ChooseTogether to help my Stake Activities Committee retrieve and review hundreds of submissions for a talent show in January. Though it solves a specific problem, I am making it as extensible as I can by adding support for other file types, creation of new projects, and project-by-project settings to meet the needs of potential users. Important features include creating projects, inviting reviewers, the submission form, deciding whether to include a submission based on the reviewers' votes, and sending emails to those who submitted. 

I hope to have it mostly functioning by the time of my demo so I can start using it with the committee. I am considering adding the ability to create timelines of the accepted submissions and possibly integrating AI suggestions based on the reviewers' feedback, but this will be a stretch goal.

![How ChooseTogether works: Submit, Convert, Assign, Review, then reviewers agree or the owner decides, Final decision, Results emailed](images/workflow.svg)

## Initial ERD

Postgres on Supabase. Everyone on a team signs in with a magic link, and their permissions come from `project_members`. Performers never sign in. Full notes are in [erd.md](erd.md).

### Overview

```mermaid
flowchart LR
    subgraph People["1. People & Projects"]
        auth_users --> project_members
        projects --> project_members
        projects --> tags
    end
    subgraph Intake["2. Intake"]
        submissions --> participants
        submissions --> media_files
        media_files --> processing_jobs
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

### 1. People & Projects

```mermaid
erDiagram
    AUTH_USERS ||--o{ PROJECT_MEMBERS : "signs in as"
    PROJECTS ||--|{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ TAGS : defines

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
        text name "UK with project_id"
    }
```

### 2. Intake

```mermaid
erDiagram
    PROJECTS ||--o{ SUBMISSIONS : receives
    SUBMISSIONS ||--|{ PARTICIPANTS : includes
    SUBMISSIONS ||--|| MEDIA_FILES : has
    MEDIA_FILES ||--o{ PROCESSING_JOBS : "converted by"
    PROJECT_MEMBERS ||--o{ PROCESSING_JOBS : "requests reprocess"

    PROJECTS {
        uuid id PK
    }
    PROJECT_MEMBERS {
        uuid id PK
    }
    SUBMISSIONS {
        uuid id PK
        uuid project_id FK
        text act_title
        text description
        text stage_needs "optional"
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
        citext email "optional, managers only"
    }
    MEDIA_FILES {
        uuid id PK
        uuid submission_id FK, UK
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
        job_status status "queued | running | done | failed"
        timestamptz lease_until "running jobs past this are requeued"
        int attempts
        text error
        timestamptz created_at
        timestamptz finished_at
    }
```

### 3. Review

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

### 4. Results & Timeline

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


## System Design

Full details (security boundaries, scaling, concurrency, failover, costs) are in [system_design.md](system_design.md).

### Architecture

```mermaid
flowchart LR
    subgraph Clients
        P["Performer<br/>(public form)"]
        T["Team member<br/>(owner, co-manager, reviewer, viewer)"]
    end

    FE["React + TS app<br/>(GitHub Pages)"]

    subgraph Supabase
        AUTH["Auth<br/>(magic links)"]
        DB[("Postgres<br/>+ RLS")]
        EF["Edge Functions<br/>submit · upload-url · invite<br/>assign · send-results · ai-suggest"]
        CRON["pg_cron<br/>(auto-assign at deadline)"]
    end

    R2[("Cloudflare R2<br/>originals/ · converted/")]
    W["AWS Lambda<br/>(ffmpeg converter)"]
    MAIL["Resend<br/>(email)"]
    AI["AI API<br/>(stretch)"]
    TS["Turnstile<br/>(bot check)"]

    P --> FE
    T --> FE
    FE -- "sign in" --> AUTH
    FE -- "reads/writes (RLS)" --> DB
    FE -- "privileged actions" --> EF
    FE -- "upload/play via signed URLs" --> R2
    FE -. "bot check" .-> TS
    EF --> DB
    EF -- "sign URLs" --> R2
    EF --> MAIL
    EF --> AI
    EF -. "verify" .-> TS
    EF -- "invoke async (job id)" --> W
    CRON --> DB
    CRON -. "re-invoke stuck jobs" .-> W
    W -- "claim job, update status" --> DB
    W -- "download original / upload MP4" --> R2
```


### Submission flow

```mermaid
sequenceDiagram
    actor P as Performer
    participant FE as React app
    participant EF as Edge Function
    participant DB as Postgres
    participant R2 as R2
    participant W as Lambda

    P->>FE: Fill form, pick file
    FE->>FE: Validate fields, participants, duration
    FE->>EF: submit (form data + Turnstile token)
    EF->>EF: Verify Turnstile, deadline, rules
    EF->>DB: Insert submission, participants, media_file, job (one transaction)
    EF-->>FE: Signed upload URL
    FE->>R2: Upload original directly
    FE->>EF: Upload complete
    EF->>DB: Mark job queued
    EF-)W: Invoke async (job id)
    W->>DB: Claim job (queued → running, with lease)
    W->>R2: Download original, upload converted MP4
    W->>DB: Set ready + duration
```


## Daily Goals

Milestones: **form ready by Thu 12/3**, form opens about Sat 12/5, final submission Thu 12/10.

| Date | Goal |
|---|---|
| Thu 11/19 | Initial design, data modeling + system design interviews, project log entry |
| Fri 11/20 | Set up the Supabase project, Vite React + TS app, R2 bucket, repo structure, GitHub Pages deploy workflow |
| Sat 11/21 | Write the database schema for People & Projects and Intake, with basic RLS |
| Mon 11/23 | (Class work day) Owner magic-link sign-in, create project + settings screen |
| Tue 11/24 | Invite Edge Function: add members by email and role, send the magic link |
| Wed 11/25 | Public submission form UI: fields, participants add/remove, duration check |
| Thu 11/26 – Fri 11/27 | Thanksgiving (light or off) |
| Sat 11/28 | Submit Edge Function: one-transaction insert, signed R2 upload, Turnstile |
| Mon 11/30 | (Class) AWS Lambda ffmpeg converter and job claiming |
| Tue 12/1 | pg_cron sweep for stuck jobs, end-to-end test (upload → ready) on the live GitHub Pages site |
| Wed 12/2 | (Class) Test with real phone videos from several browsers, fix bugs |
| Thu 12/3 | **Intake freeze:** form ready to go live |
| Fri 12/4 | Review schema + auto-assignment with conflict check |
| Sat 12/5 | **Form opens.** Review queue/list with vote, score and tags |
| Mon 12/7 | (Class) Decision rule trigger, statuses, decision log, team results view |
| Tue 12/8 | **Demo-ready build:** record the demo video/GIF, prepare presentation slides. Email templates + Send results only if time allows |
| Wed 12/9 | (Last class) **In-class presentation**, collaboration, polish |
| Thu 12/10 | Final submission and class-channel post |
