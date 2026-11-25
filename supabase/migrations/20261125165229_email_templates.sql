-- Email templates: one per final status per project (see Documents/spec/results-and-email.md).
-- Every project gets the three default templates automatically, so the app
-- and the future send Edge Function never have to handle a missing row.

create table email_templates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Only final statuses get an email.
  status     submission_status not null
               check (status in ('selected', 'waitlisted', 'not_selected')),
  subject    text not null check (length(trim(subject)) > 0),
  body       text not null check (length(trim(body)) > 0),
  updated_at timestamptz not null default now(),
  unique (project_id, status)
);

-- Inserts the default templates for one project (skips any that exist).
-- Placeholders are filled in when the email is sent:
-- {participant_name}, {act_title}, {project_name}, {organizer_email}.
-- security definer: users have no insert policy on email_templates.
create function public.add_default_email_templates(p_project_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_templates (project_id, status, subject, body)
  select p_project_id, t.status, t.subject, t.body
  from (values
    ('selected'::public.submission_status,
     'You''re in {project_name}!',
     E'Hi {participant_name},\n\n'
     'Congratulations! "{act_title}" has been selected for {project_name}. '
     'We''ll be in touch soon with next steps.\n\n'
     'Questions? Email {organizer_email}.'),
    ('waitlisted'::public.submission_status,
     '{project_name}: you''re on the waitlist',
     E'Hi {participant_name},\n\n'
     'Thank you for submitting "{act_title}" to {project_name}. '
     'Your act is on our waitlist, and we''ll let you know if a spot opens up.\n\n'
     'Questions? Email {organizer_email}.'),
    ('not_selected'::public.submission_status,
     'Thank you for submitting to {project_name}',
     E'Hi {participant_name},\n\n'
     'Thank you for sharing "{act_title}" with us. We had many wonderful submissions, '
     'and unfortunately we couldn''t include every act in {project_name}.\n\n'
     'Questions? Email {organizer_email}.')
  ) as t(status, subject, body)
  on conflict (project_id, status) do nothing;
$$;

-- Not an API endpoint: only the trigger below (and this migration) call it.
revoke execute on function public.add_default_email_templates(uuid) from public, anon, authenticated;

create function public.default_email_templates_trigger() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_default_email_templates(new.id);
  return new;
end;
$$;

revoke execute on function public.default_email_templates_trigger() from public, anon, authenticated;

create trigger projects_default_email_templates
  after insert on projects
  for each row execute function public.default_email_templates_trigger();

-- Backfill projects created before this migration.
select public.add_default_email_templates(id) from projects;

-- Keep updated_at current on edits.
create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger email_templates_touch
  before update on email_templates
  for each row execute function public.touch_updated_at();

-- RLS ---------------------------------------------------------
-- Templates hold no personal data, so the whole team can read them.
-- Managers edit subject and body only. No insert/delete policies: rows come
-- from the trigger above and go away with the project (cascade).
alter table email_templates enable row level security;

create policy "members read email templates" on email_templates
  for select to authenticated using (public.is_member(project_id));

create policy "managers update email templates" on email_templates
  for update to authenticated
  using (public.is_manager(project_id)) with check (public.is_manager(project_id));

revoke insert, update, delete on email_templates from anon, authenticated;
grant update (subject, body) on email_templates to authenticated;
