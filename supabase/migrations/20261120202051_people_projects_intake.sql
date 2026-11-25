-- People & Projects and Intake schema, with basic RLS.
-- See Documents/erd.md for the full data model.

-- ============================================================
-- Extensions
-- ============================================================

-- citext: case-insensitive text, so Sam@x.com = sam@x.com.
-- Used for emails (invite matching and the reviewer conflict check).
create extension if not exists citext with schema extensions;

-- ============================================================
-- Enums (fixed codes; labels live only in the UI)
-- ============================================================

create type member_role       as enum ('owner', 'co_manager', 'member');
create type decision_rule     as enum ('any_disagreement_to_owner', 'majority');
create type retention_policy  as enum ('after_conversion', 'until_results_sent', 'forever');
create type submission_status as enum ('submitted', 'in_review', 'pending_decision',
                                       'selected', 'waitlisted', 'not_selected');
create type media_kind        as enum ('video', 'audio', 'image', 'text');
create type processing_status as enum ('pending', 'ready', 'failed');
create type job_mode          as enum ('standard', 'safe');
-- awaiting_upload: job row exists but the browser hasn't finished uploading to R2.
create type job_status        as enum ('awaiting_upload', 'queued', 'running', 'done', 'failed');

-- ============================================================
-- People & Projects
-- ============================================================

create table projects (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(trim(name)) > 0),
  -- Public form URL piece, e.g. talent-show-2027.
  slug                     text not null unique
                             check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  submissions_close_at     timestamptz not null,
  max_participants         int check (max_participants > 0),          -- null = no limit
  max_duration_seconds     int check (max_duration_seconds > 0),      -- null = no limit
  reviewers_per_submission int not null default 2 check (reviewers_per_submission >= 1),
  decision_rule            decision_rule not null default 'any_disagreement_to_owner',
  score_required           boolean not null default false,
  retention_policy         retention_policy not null default 'until_results_sent',
  -- Days to keep originals after conversion (only used by after_conversion).
  retention_grace_days     int not null default 0 check (retention_grace_days >= 0),
  target_show_seconds      int check (target_show_seconds > 0),
  agreement_text           text,
  results_sent_at          timestamptz,
  created_at               timestamptz not null default now()
);

create table project_members (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  -- Filled in the first time the invited email signs in.
  user_id            uuid references auth.users(id) on delete set null,
  email              extensions.citext not null,
  role               member_role not null default 'member',
  -- member: on = Reviewer, off = Viewer. No column default: the trigger below
  -- fills it in by role (members on, managers off) when it isn't given.
  in_review_rotation boolean not null,
  invited_at         timestamptz not null default now(),
  revoked_at         timestamptz,                                     -- not null = no access
  unique (project_id, email)
);

-- At most one owner per project.
create unique index project_members_one_owner
  on project_members (project_id) where role = 'owner';

-- Speeds up "which projects is this user in?" (used by every RLS check).
create index project_members_user_id_idx on project_members (user_id);

-- Default review rotation by role: members on, owner and co-managers off.
-- Runs before insert, and NOT NULL is checked after it, so a missing value is
-- filled in here instead of failing. An explicit true/false is kept as given.
create function public.default_review_rotation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.in_review_rotation := coalesce(new.in_review_rotation, new.role = 'member');
  return new;
end;
$$;

create trigger project_members_default_rotation
  before insert on project_members
  for each row execute function public.default_review_rotation();

create table tags (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       extensions.citext not null check (length(trim(name)) > 0),
  unique (project_id, name)
);

-- The only way to create a project (there is no insert policy on projects).
-- Inserts the project and makes the signed-in caller its owner in one
-- transaction, so a project can never exist without an owner.
-- Other settings use their defaults and are edited later in settings.
-- security definer: skips RLS, so neither insert is blocked and the new row
-- can be returned. search_path = '': standard safety, so names are fully qualified.
-- Frontend: supabase.rpc('create_project', { p_name, p_slug, p_submissions_close_at }).
-- A taken slug returns error code 23505 (unique violation).
create function public.create_project(
  p_name                 text,
  p_slug                 text,
  p_submissions_close_at timestamptz
) returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a project';
  end if;

  insert into public.projects (name, slug, submissions_close_at)
  values (p_name, p_slug, p_submissions_close_at)
  returning * into v_project;

  -- in_review_rotation left out: the default_review_rotation trigger sets it
  -- (off for the owner), so one rule decides it for every insert.
  insert into public.project_members (project_id, user_id, email, role)
  values (v_project.id, auth.uid(), auth.jwt() ->> 'email', 'owner');

  return v_project;
end;
$$;

-- ============================================================
-- Intake
-- ============================================================

create table submissions (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  act_title           text not null check (length(trim(act_title)) > 0),
  description         text not null check (length(trim(description)) > 0),
  stage_needs         text,                                           -- optional
  status              submission_status not null default 'submitted',
  -- Set when results are emailed; status <> last_emailed_status = needs follow-up.
  last_emailed_status submission_status,
  agreed_at           timestamptz not null,
  submitted_at        timestamptz not null default now()
);

create index submissions_project_id_idx on submissions (project_id);

-- Submissions are final. This also guards against Edge Functions, which use the
-- service role and skip RLS.
-- Allow-list: only status and last_emailed_status may change. The rest of the
-- row (including id and any column added later) is compared as JSON, so new
-- columns are protected automatically.
create function public.prevent_submission_edits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'status' - 'last_emailed_status')
     is distinct from
     (to_jsonb(old) - 'status' - 'last_emailed_status') then
    raise exception 'Submissions are final: only status fields can change';
  end if;
  return new;
end;
$$;

create trigger submissions_final
  before update on submissions
  for each row execute function public.prevent_submission_edits();

-- "At least one participant has an email" and max_participants span several rows,
-- so they're enforced by the submit Edge Function (one transaction) and the browser.
create table participants (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  position      int not null check (position >= 1),                 -- form order
  name          text not null check (length(trim(name)) > 0),
  unique (submission_id, position)
);

-- Emails live in their own table so RLS can show them to managers only.
-- One row per participant who gave an email; no row = no email.
create table participant_emails (
  participant_id uuid primary key references participants(id) on delete cascade,
  email          extensions.citext not null
                   check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Used by the reviewer conflict check.
create index participant_emails_email_idx on participant_emails (email);

-- Participants and their emails are final too. Deletes stay allowed so
-- deleting a project cascades.
create function public.prevent_participant_edits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Submissions are final: participants cannot be edited';
end;
$$;

create trigger participants_final
  before update on participants
  for each row execute function public.prevent_participant_edits();

create trigger participant_emails_final
  before update on participant_emails
  for each row execute function public.prevent_participant_edits();

-- Exactly one file per submission. Keys are R2 object paths, not the files.
-- Note: deleting rows here does not delete the objects in R2.
create table media_files (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null unique references submissions(id) on delete cascade,
  kind                media_kind not null,
  original_key        text not null unique,
  original_mime       text not null,                                -- e.g. video/quicktime
  original_size_bytes bigint not null check (original_size_bytes > 0),
  original_deleted_at timestamptz,                                  -- set = Reprocess disabled
  converted_key       text unique,                                  -- null until converted
  duration_seconds    int check (duration_seconds >= 0),
  processing_status   processing_status not null default 'pending'
);

-- One row per conversion attempt: the initial one, plus one per Reprocess click.
-- Lifecycle: awaiting_upload -> queued -> running -> done | failed.
create table processing_jobs (
  id            uuid primary key default gen_random_uuid(),
  media_file_id uuid not null references media_files(id) on delete cascade,
  -- null = initial upload. on delete cascade: without it, deleting a project
  -- fails once anyone has clicked Reprocess (two cascade paths race). Members
  -- are only hard-deleted along with their project, so no history is lost.
  requested_by  uuid references project_members(id) on delete cascade,
  mode          job_mode not null default 'standard',
  status        job_status not null default 'awaiting_upload',
  -- Running jobs past this time are treated as stuck and requeued by the sweep.
  lease_until   timestamptz,
  attempts      int not null default 0 check (attempts >= 0),
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- At most one unfinished job per file, so extra Reprocess clicks do nothing.
create unique index processing_jobs_one_open
  on processing_jobs (media_file_id)
  where status in ('awaiting_upload', 'queued', 'running');

-- ============================================================
-- RLS helpers
-- ============================================================

-- The signed-in user's role in a project, or null if they have no access
-- (not a member, or revoked).
-- Matches on user_id once linked, or on the verified email from the login
-- token before claim_memberships() has run.
-- security definer: RLS on project_members calls this function, so it must
-- skip RLS itself or it would recurse forever.
-- lower(): with search_path = '', citext's operator isn't found and Postgres
-- would silently fall back to case-sensitive text comparison.
-- email_confirmed_at: the email match only counts for an account whose email
-- was confirmed (backup for the "Confirm email" auth setting).
-- order by / limit 1: if both a linked row and a pending invite match (e.g.
-- after an account email change), use the linked one, never a random one.
create function public.my_role(p_project_id uuid) returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.project_members m
  where m.project_id = p_project_id
    and m.revoked_at is null
    and (
      m.user_id = auth.uid()
      or (m.user_id is null
          and lower(m.email::text) = lower(auth.jwt() ->> 'email')
          and exists (select 1 from auth.users u
                      where u.id = auth.uid() and u.email_confirmed_at is not null))
    )
  order by m.user_id is null   -- false (linked) sorts first
  limit 1;
$$;

-- Readable wrappers for RLS policies. They don't read tables, so no security definer.
-- coalesce(..., false): always return true/false, never null, so the app can
-- call these directly to decide which buttons to show.
create function public.is_member(p_project_id uuid) returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.my_role(p_project_id) is not null, false);
$$;

create function public.is_manager(p_project_id uuid) returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.my_role(p_project_id) in ('owner', 'co_manager'), false);
$$;

-- Called by the app right after sign-in: links pending invites for the
-- signed-in (confirmed) email to this account. Only fills blanks; never takes
-- over a membership already linked to someone else.
create function public.claim_memberships() returns void
language sql
security definer
set search_path = ''
as $$
  update public.project_members
     set user_id = auth.uid()
   where user_id is null
     and auth.uid() is not null
     and lower(email::text) = lower(auth.jwt() ->> 'email')
     and exists (select 1 from auth.users u
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

-- ============================================================
-- Row Level Security
-- Once enabled, every row is hidden and every write is blocked unless a
-- policy allows it. No policy = no access. Edge Functions and the Lambda use
-- the service role, which skips RLS; they do all writes not listed here.
-- ============================================================

alter table projects           enable row level security;
alter table project_members    enable row level security;
alter table tags               enable row level security;
alter table submissions        enable row level security;
alter table participants       enable row level security;
alter table participant_emails enable row level security;
alter table media_files        enable row level security;
alter table processing_jobs    enable row level security;

-- projects -----------------------------------------------------

create policy "members read projects" on projects
  for select to authenticated using (public.is_member(id));

-- No insert policy: projects are created only through create_project(),
-- which also adds the owner row.

create policy "managers update projects" on projects
  for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));

create policy "owner deletes project" on projects
  for delete to authenticated using (public.my_role(id) = 'owner');

-- project_members ----------------------------------------------
-- No insert policy: invites go through the invite Edge Function.
-- No delete policy: removing someone sets revoked_at (soft delete).

create policy "members read team" on project_members
  for select to authenticated using (public.is_member(project_id));

create policy "managers update team" on project_members
  for update to authenticated
  using (public.is_manager(project_id)) with check (public.is_manager(project_id));

-- RLS picks the rows; this grant picks the columns. Managers can change
-- role, rotation and revoked status, but not email or user_id.
revoke update on project_members from authenticated;
grant update (role, in_review_rotation, revoked_at) on project_members to authenticated;

-- Stop anyone (including co-managers) from demoting or revoking the owner.
create function public.protect_owner_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and (new.role <> 'owner' or new.revoked_at is not null) then
    raise exception 'The owner cannot be demoted or revoked';
  end if;
  return new;
end;
$$;

create trigger project_members_protect_owner
  before update on project_members
  for each row execute function public.protect_owner_row();

-- tags ---------------------------------------------------------

create policy "members read tags" on tags
  for select to authenticated using (public.is_member(project_id));

-- for all = select, insert, update and delete.
create policy "managers manage tags" on tags
  for all to authenticated
  using (public.is_manager(project_id)) with check (public.is_manager(project_id));

-- submissions, participants, media_files: read only --------------
-- The submit Edge Function writes these. A manager status-update policy
-- comes with the Review migration (with the decision log trigger).

create policy "members read submissions" on submissions
  for select to authenticated using (public.is_member(project_id));

create policy "members read participants" on participants
  for select to authenticated
  using (exists (
    select 1 from public.submissions s
    where s.id = participants.submission_id and public.is_member(s.project_id)
  ));

-- Participant emails: managers only (AGENTS.md invariant).
create policy "managers read participant emails" on participant_emails
  for select to authenticated
  using (exists (
    select 1 from public.participants p
    join public.submissions s on s.id = p.submission_id
    where p.id = participant_emails.participant_id
      and public.is_manager(s.project_id)
  ));

-- R2 is private; seeing a key doesn't grant access to the file.
create policy "members read media" on media_files
  for select to authenticated
  using (exists (
    select 1 from public.submissions s
    where s.id = media_files.submission_id and public.is_member(s.project_id)
  ));

-- processing_jobs: managers only -------------------------------
-- Reviewers see "Processing..." from media_files.processing_status instead.

create policy "managers read jobs" on processing_jobs
  for select to authenticated
  using (exists (
    select 1 from public.media_files f
    join public.submissions s on s.id = f.submission_id
    where f.id = processing_jobs.media_file_id and public.is_manager(s.project_id)
  ));

-- ============================================================
-- Public form
-- Performers are anonymous, so RLS shows them nothing. This returns only
-- what the form page needs. The submit Edge Function re-checks the deadline.
-- ============================================================

create function public.get_public_form(p_slug text)
returns table (project_id           uuid,
               name                 text,
               agreement_text       text,
               max_participants     int,
               max_duration_seconds int,
               submissions_close_at timestamptz,
               is_open              boolean,
               organizer_email      text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.name, pr.agreement_text,
         pr.max_participants, pr.max_duration_seconds,
         pr.submissions_close_at, now() < pr.submissions_close_at,
         m.email::text
  from public.projects pr
  left join public.project_members m
    on m.project_id = pr.id and m.role = 'owner'
  where pr.slug = p_slug;
$$;
