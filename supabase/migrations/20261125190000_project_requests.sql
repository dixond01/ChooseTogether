-- Project requests: the site is public, so new projects need a site admin's
-- approval. A signed-in user sends a request (request-project Edge Function,
-- which also emails the admin). The admin approves or denies it in the app
-- (decide-project-request Edge Function -> decide_project_request()), and the
-- requester is emailed the decision. Approving creates the project with the
-- requester as owner. See Documents/spec/roles-and-auth.md.

-- ============================================================
-- Site admins
-- ============================================================

-- Whoever approves project requests. Added by hand in the SQL editor, never in
-- a migration (the repo is public):
--   insert into public.site_admins (user_id)
--   select id from auth.users where email = '<your email>';
create table site_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- No policies: nobody reads this table through the API. is_site_admin() does.
alter table site_admins enable row level security;
revoke all on site_admins from anon, authenticated;

-- security definer: reads site_admins, which RLS hides from everyone.
-- coalesce: always true/false, so the app can call it to decide what to show.
create function public.is_site_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (select 1 from public.site_admins a where a.user_id = auth.uid()), false);
$$;

-- ============================================================
-- Requests
-- ============================================================

create type request_status as enum ('pending', 'approved', 'denied');

create table project_requests (
  id                   uuid primary key default gen_random_uuid(),
  -- The requester. Their verified sign-in email is copied here so the admin
  -- can contact them.
  user_id              uuid not null references auth.users(id) on delete cascade,
  email                extensions.citext not null,
  project_name         text not null check (length(trim(project_name)) between 1 and 200),
  -- The form link they asked for. If it's taken by approval time, a -2, -3...
  -- suffix is added (the owner can change it later in settings).
  slug                 text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  submissions_close_at timestamptz not null,
  note                 text not null check (length(trim(note)) between 1 and 2000),
  status               request_status not null default 'pending',
  -- Optional message to the requester with the decision.
  decision_note        text check (length(decision_note) <= 2000),
  decided_at           timestamptz,
  -- Set on approval. set null: deleting the project keeps the request record.
  project_id           uuid references projects(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- One waiting request per person, so nobody can flood the admin's inbox.
create unique index project_requests_one_pending
  on project_requests (user_id) where status = 'pending';

create index project_requests_status_idx on project_requests (status, created_at);
create index project_requests_project_id_idx on project_requests (project_id);

-- Requesters see their own requests; site admins see all of them.
-- No insert/update/delete policies: the Edge Functions and
-- decide_project_request() do all writes.
alter table project_requests enable row level security;

create policy "requesters read own requests" on project_requests
  for select to authenticated using (user_id = auth.uid());

create policy "site admins read requests" on project_requests
  for select to authenticated using (public.is_site_admin());

revoke insert, update, delete on project_requests from anon, authenticated;

-- ============================================================
-- Creating projects
-- ============================================================

-- Inserts a project and its owner membership in one transaction. Not an API
-- endpoint: only create_project() and decide_project_request() call it.
create function public.insert_project_with_owner(
  p_name                 text,
  p_slug                 text,
  p_submissions_close_at timestamptz,
  p_owner_id             uuid,
  p_owner_email          text
) returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  insert into public.projects (name, slug, submissions_close_at)
  values (p_name, p_slug, p_submissions_close_at)
  returning * into v_project;

  -- in_review_rotation left out: the default_review_rotation trigger sets it.
  insert into public.project_members (project_id, user_id, email, role)
  values (v_project.id, p_owner_id, p_owner_email, 'owner');

  return v_project;
end;
$$;

revoke execute on function public.insert_project_with_owner(text, text, timestamptz, uuid, text)
  from public, anon, authenticated;

-- Direct creation is now for site admins only; everyone else sends a request.
-- Frontend: supabase.rpc('create_project', { p_name, p_slug, p_submissions_close_at }).
-- A taken slug returns error code 23505 (unique violation).
create or replace function public.create_project(
  p_name                 text,
  p_slug                 text,
  p_submissions_close_at timestamptz
) returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a project';
  end if;
  if not public.is_site_admin() then
    raise exception 'New projects need approval. Send a project request instead.'
      using errcode = '42501';
  end if;

  return public.insert_project_with_owner(
    p_name, p_slug, p_submissions_close_at, auth.uid(), auth.jwt() ->> 'email');
end;
$$;

-- Approve or deny a pending request. Site admins only.
-- Approving creates the project with the requester as owner. If the requested
-- form link is taken by now, a numbered suffix is added.
-- Called by the decide-project-request Edge Function as the signed-in admin,
-- so auth.uid() is the admin here.
create function public.decide_project_request(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
) returns public.project_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.project_requests;
  v_project public.projects;
  v_slug    text;
  v_n       int := 1;
begin
  if not public.is_site_admin() then
    raise exception 'Only site admins can decide project requests' using errcode = '42501';
  end if;

  -- for update: two admins clicking at once can't both approve.
  select * into v_request from public.project_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request was already %', v_request.status using errcode = '55000';
  end if;

  if p_approve then
    v_slug := v_request.slug;
    while exists (select 1 from public.projects where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_request.slug || '-' || v_n;
    end loop;

    v_project := public.insert_project_with_owner(
      v_request.project_name, v_slug, v_request.submissions_close_at,
      v_request.user_id, v_request.email::text);
  end if;

  update public.project_requests
     set status        = case when p_approve then 'approved' else 'denied' end::public.request_status,
         decision_note = nullif(trim(p_note), ''),
         decided_at    = now(),
         project_id    = v_project.id
   where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke execute on function public.decide_project_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_project_request(uuid, boolean, text) to authenticated;
