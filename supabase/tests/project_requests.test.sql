-- Tests for the project_requests migration: who can create projects, who can
-- see requests (and requesters' emails), and approving/denying.
-- Run with: npx supabase test db
-- Same approach as rls_and_constraints.test.sql: one transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.com',     now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'other@test.com',     now());

insert into public.site_admins (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ============================================================
-- Direct creation is admin-only
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"requester@test.com"}';

select is(public.is_site_admin(), false, 'a regular user is not a site admin');

select throws_ok(
  $$ select public.create_project('Sneaky', 'sneaky', now() + interval '7 days') $$,
  '42501', 'New projects need approval. Send a project request instead.',
  'a regular user cannot create a project directly');

select throws_ok(
  $$ select public.insert_project_with_owner('Sneaky', 'sneaky', now(),
       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com') $$,
  '42501', null,
  'the internal create helper is not callable from the API');

select throws_ok(
  $$ select * from public.site_admins $$,
  '42501', null,
  'users cannot read the site admin list');

select throws_ok(
  $$ insert into public.project_requests (user_id, email, project_name, slug, submissions_close_at, note)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com', 'X', 'x', now(), 'hi') $$,
  '42501', null,
  'users cannot insert requests directly (the Edge Function does)');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"admin@test.com"}';

select is(public.is_site_admin(), true, 'the admin is a site admin');

select is(
  (select slug from public.create_project('Admin Show', 'talent-show', now() + interval '7 days')),
  'talent-show',
  'a site admin can create a project directly');

-- ============================================================
-- Requests (written by the Edge Function as service_role)
-- ============================================================
reset role;
set local role service_role;

insert into public.project_requests (id, user_id, email, project_name, slug, submissions_close_at, note) values
  ('11111111-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com',
   'Talent Show', 'talent-show', now() + interval '14 days', 'Ward talent show'),
  ('11111111-0000-0000-0000-000000000002', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'other@test.com',
   'Spam Show', 'spam-show', now() + interval '14 days', 'Please');

select throws_ok(
  $$ insert into public.project_requests (user_id, email, project_name, slug, submissions_close_at, note)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com', 'Again', 'again', now(), 'again') $$,
  '23505', null,
  'only one pending request per person');

select throws_ok(
  $$ insert into public.project_requests (user_id, email, project_name, slug, submissions_close_at, note)
     values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'other@test.com', 'Bad', 'Bad Slug', now(), 'x') $$,
  '23514', null,
  'request slugs follow the same format as project slugs');

-- ============================================================
-- Who sees requests
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"requester@test.com"}';

select is((select count(*) from public.project_requests)::int, 1, 'a requester sees only their own request');
select is(
  (select email::text from public.project_requests),
  'requester@test.com',
  'and it is theirs');

select throws_ok(
  $$ select public.decide_project_request('11111111-0000-0000-0000-000000000001', true) $$,
  '42501', null,
  'a requester cannot approve their own request');

select throws_ok(
  $$ update public.project_requests set status = 'approved' $$,
  '42501', null,
  'a requester cannot update their request status');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*) from public.project_requests)::int, 0, 'anonymous visitors see no requests');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"admin@test.com"}';

-- Counted by requester so leftover local data doesn't change the result.
select is(
  (select count(*) from public.project_requests
    where user_id in ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'))::int,
  2,
  'the admin sees every request, including other people''s');

-- ============================================================
-- Deciding
-- ============================================================

-- 'talent-show' was taken by the admin's project above.
select is(
  (select status::text from public.decide_project_request('11111111-0000-0000-0000-000000000001', true)),
  'approved',
  'the admin can approve a request');

-- The admin isn't a member of the new project, so RLS hides it from them.
-- Check it as the server.
reset role;
set local role service_role;

select is(
  (select p.slug from public.projects p
     join public.project_requests r on r.project_id = p.id
    where r.id = '11111111-0000-0000-0000-000000000001'),
  'talent-show-2',
  'a taken form link gets a numbered suffix');

select is(
  (select m.role::text from public.project_members m
     join public.project_requests r on r.project_id = m.project_id
    where r.id = '11111111-0000-0000-0000-000000000001' and m.email = 'requester@test.com'),
  'owner',
  'the requester owns the approved project');

select is(
  (select count(*) from public.project_members m
     join public.project_requests r on r.project_id = m.project_id
    where r.id = '11111111-0000-0000-0000-000000000001')::int,
  1,
  'the admin is not added to the approved project');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"admin@test.com"}';

select throws_ok(
  $$ select public.decide_project_request('11111111-0000-0000-0000-000000000001', false) $$,
  '55000', 'This request was already approved',
  'a decided request cannot be decided again');

select is(
  (select decision_note from public.decide_project_request(
     '11111111-0000-0000-0000-000000000002', false, '  Not a real event.  ')),
  'Not a real event.',
  'the admin can deny a request with a note');

select is(
  (select project_id from public.project_requests where id = '11111111-0000-0000-0000-000000000002'),
  null,
  'a denied request creates no project');

-- The requester can now see and use their new project.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"requester@test.com"}';

select is(
  (select name from public.projects),
  'Talent Show',
  'the requester sees their approved project');

-- After approval they can send another request.
reset role;
set local role service_role;
select lives_ok(
  $$ insert into public.project_requests (user_id, email, project_name, slug, submissions_close_at, note)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'requester@test.com', 'Second', 'second', now(), 'next year') $$,
  'a new request is allowed once the last one is decided');

select * from finish();
rollback;
