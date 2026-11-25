-- Tests for the email_templates migration: default rows, RLS, column grants
-- and constraints. Run with: npx supabase test db
-- Same approach as rls_and_constraints.test.sql: one transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.com',     now()),
  ('22222222-2222-2222-2222-222222222222', 'coman@test.com',     now()),
  ('33333333-3333-3333-3333-333333333333', 'reviewer@test.com',  now()),
  ('55555555-5555-5555-5555-555555555555', 'stranger@test.com',  now());

-- Owner creates the project through the app's only path.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.com"}';
do $$ begin perform public.create_project('Test Show', 'test-show', now() + interval '7 days'); end $$;

reset role;
set local role service_role;
do $$
begin
  perform set_config('test.project_id', (select id::text from public.projects where slug = 'test-show'), true);
end
$$;
insert into public.project_members (project_id, user_id, email, role) values
  (current_setting('test.project_id')::uuid, '22222222-2222-2222-2222-222222222222', 'coman@test.com', 'co_manager'),
  (current_setting('test.project_id')::uuid, '33333333-3333-3333-3333-333333333333', 'reviewer@test.com', 'member');

-- ------------------------------------------------------------
-- Defaults
-- ------------------------------------------------------------
select is(
  (select array_agg(status::text order by status) from public.email_templates
    where project_id = current_setting('test.project_id')::uuid),
  array['selected', 'waitlisted', 'not_selected'],
  'creating a project adds one template per final status');

select ok(
  (select bool_and(body like '%{participant_name}%' and subject like '%{project_name}%')
     from public.email_templates where project_id = current_setting('test.project_id')::uuid),
  'default templates use the placeholders');

select throws_ok(
  $$ insert into public.email_templates (project_id, status, subject, body)
     values (current_setting('test.project_id')::uuid, 'in_review', 's', 'b') $$,
  '23514', null,
  'templates only exist for final statuses');

select throws_ok(
  $$ insert into public.email_templates (project_id, status, subject, body)
     values (current_setting('test.project_id')::uuid, 'selected', 's', 'b') $$,
  '23505', null,
  'only one template per status per project');

-- ------------------------------------------------------------
-- Reviewer: can read, cannot edit
-- ------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reviewer@test.com"}';

select is((select count(*) from public.email_templates), 3::bigint,
  'reviewer can read the templates');

update public.email_templates set subject = 'hacked' where status = 'selected';
select isnt((select subject from public.email_templates where status = 'selected'), 'hacked',
  'reviewer cannot edit a template (RLS hides the row from the update)');

select throws_ok(
  $$ insert into public.email_templates (project_id, status, subject, body)
     values (current_setting('test.project_id')::uuid, 'selected', 's', 'b') $$,
  '42501', null,
  'reviewer cannot insert templates');

-- ------------------------------------------------------------
-- Co-manager: can edit subject and body only
-- ------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"coman@test.com"}';

select lives_ok(
  $$ update public.email_templates set subject = 'Welcome to {project_name}', body = 'New body'
     where status = 'selected' $$,
  'co-manager can edit subject and body');

select is((select subject from public.email_templates where status = 'selected'), 'Welcome to {project_name}',
  'the edit is saved');

select throws_ok(
  $$ update public.email_templates set status = 'waitlisted' where status = 'selected' $$,
  '42501', null,
  'status cannot be changed (column not granted)');

select throws_ok(
  $$ update public.email_templates set body = '   ' where status = 'selected' $$,
  '23514', null,
  'a blank body is rejected');

select throws_ok(
  $$ delete from public.email_templates where status = 'selected' $$,
  '42501', null,
  'templates cannot be deleted directly');

-- ------------------------------------------------------------
-- Stranger: sees nothing
-- ------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","email":"stranger@test.com"}';

select is((select count(*) from public.email_templates), 0::bigint,
  'non-members cannot read templates');

-- ------------------------------------------------------------
-- Deleting the project removes its templates
-- ------------------------------------------------------------
reset role;
set local role service_role;
delete from public.projects where id = current_setting('test.project_id')::uuid;
select is((select count(*) from public.email_templates), 0::bigint,
  'templates are deleted with their project');

select * from finish();
rollback;
