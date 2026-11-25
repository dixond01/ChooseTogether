-- Tests for the People & Projects and Intake migration:
-- RLS (who can see/change what), the finality triggers and key constraints.
-- Run with: npx supabase test db
--
-- How it works:
--   * Everything runs in one transaction and is rolled back at the end,
--     so the tests leave no data behind.
--   * "set local role service_role" = act as the server (Edge Functions and
--     the Lambda use this role; it skips RLS). We "reset role" first because
--     only the test's starting role can switch to another role.
--   * "set local role authenticated" + request.jwt.claims = act as a signed-in
--     user. This is exactly what Supabase does for each request from the app.
--   * "set local role anon" = act as an anonymous visitor.
--   * There are two projects (A = test-show, B = other-show), so a policy that
--     wrongly checks "member of ANY project" would fail the count tests.

begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- ============================================================
-- Fake accounts (fine in a local test database)
-- ============================================================
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.com',         now()),
  ('22222222-2222-2222-2222-222222222222', 'coman@test.com',         now()),
  ('33333333-3333-3333-3333-333333333333', 'reviewer@test.com',      now()),
  ('44444444-4444-4444-4444-444444444444', 'revoked@test.com',       now()),
  ('55555555-5555-5555-5555-555555555555', 'stranger@test.com',      now()),
  ('66666666-6666-6666-6666-666666666666', 'invitee@test.com',       now()),
  ('77777777-7777-7777-7777-777777777777', 'otherowner@test.com',    now()),
  ('99999999-9999-9999-9999-999999999999', 'revokedinvite@test.com', now());

-- Never confirmed their email (e.g. a password sign-up someone else made).
insert into auth.users (id, email, email_confirmed_at) values
  ('88888888-8888-8888-8888-888888888888', 'pending@test.com', null);

-- ============================================================
-- Creating projects
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.com"}';

select is(
  (select slug from public.create_project('Test Show', 'test-show', now() + interval '7 days')),
  'test-show',
  'signed-in user can create a project and gets it back in one call');

select is(
  (select role::text from public.project_members where email = 'owner@test.com'),
  'owner',
  'creator becomes the owner');

-- create_project doesn't pass a value, so this checks the rotation trigger.
select is(
  (select in_review_rotation from public.project_members where email = 'owner@test.com'),
  false,
  'owner starts out of the review rotation (set by the trigger)');

select throws_ok(
  $$ select public.create_project('Copy', 'test-show', now()) $$,
  '23505', null,
  'a slug that is already taken is rejected');

select throws_ok(
  $$ select public.create_project('Bad', 'Bad Slug', now()) $$,
  '23514', null,
  'a slug with capitals or spaces is rejected');

select throws_ok(
  $$ select public.create_project('   ', 'blank-name', now()) $$,
  '23514', null,
  'a blank project name is rejected');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select public.create_project('Anon Show', 'anon-show', now()) $$,
  'P0001', 'You must be signed in to create a project',
  'anonymous visitors cannot create projects');

-- Project B, owned by someone else.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","email":"otherowner@test.com"}';

do $$
begin
  perform public.create_project('Other Show', 'other-show', now() + interval '7 days');
end
$$;

-- ============================================================
-- Setup, acting as the server
-- ============================================================
reset role;
set local role service_role;

-- Remember both project ids so every test can use them, even users whose
-- RLS wouldn't let them look the ids up.
do $$
begin
  perform set_config('test.project_id',
    (select id::text from public.projects where slug = 'test-show'), true);
  perform set_config('test.other_project_id',
    (select id::text from public.projects where slug = 'other-show'), true);
end
$$;

-- Project A team. No in_review_rotation given, so the trigger picks it by role.
insert into public.project_members (project_id, user_id, email, role) values
  (current_setting('test.project_id')::uuid, '22222222-2222-2222-2222-222222222222', 'coman@test.com', 'co_manager'),
  (current_setting('test.project_id')::uuid, '33333333-3333-3333-3333-333333333333', 'reviewer@test.com', 'member');

insert into public.project_members (project_id, user_id, email, role, revoked_at) values
  (current_setting('test.project_id')::uuid, '44444444-4444-4444-4444-444444444444', 'revoked@test.com', 'member', now());

-- Pending invites (no user_id yet). Mixed case on purpose, to test case-insensitive matching.
insert into public.project_members (project_id, email) values
  (current_setting('test.project_id')::uuid, 'Invitee@Test.com'),
  (current_setting('test.project_id')::uuid, 'pending@test.com'),
  (current_setting('test.project_id')::uuid, 'extra@test.com');

insert into public.project_members (project_id, email, revoked_at) values
  (current_setting('test.project_id')::uuid, 'revokedinvite@test.com', now());

-- Project A submission: two participants, only Pat gave an email.
insert into public.submissions (id, project_id, act_title, description, agreed_at) values
  ('b0000000-0000-0000-0000-000000000001', current_setting('test.project_id')::uuid,
   'Juggling', 'Three clubs and a unicycle', now());

insert into public.participants (id, submission_id, position, name) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'Pat Performer'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 2, 'Sam Sidekick');

insert into public.participant_emails (participant_id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'performer@test.com');

insert into public.media_files (id, submission_id, kind, original_key, original_mime, original_size_bytes) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'video', 'originals/d0000000-0000-0000-0000-000000000001.mov', 'video/quicktime', 1000000);

insert into public.processing_jobs (media_file_id) values
  ('d0000000-0000-0000-0000-000000000001');

-- Project B submission (one of everything), to catch cross-project leaks.
insert into public.submissions (id, project_id, act_title, description, agreed_at) values
  ('b0000000-0000-0000-0000-000000000002', current_setting('test.other_project_id')::uuid,
   'Magic', 'Card tricks', now());

insert into public.participants (id, submission_id, position, name) values
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 1, 'Morgan Magician');

insert into public.participant_emails (participant_id, email) values
  ('c0000000-0000-0000-0000-000000000003', 'magician@test.com');

insert into public.media_files (id, submission_id, kind, original_key, original_mime, original_size_bytes) values
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   'video', 'originals/d0000000-0000-0000-0000-000000000002.mov', 'video/mp4', 2000000);

insert into public.processing_jobs (media_file_id) values
  ('d0000000-0000-0000-0000-000000000002');

select is(
  (select in_review_rotation from public.project_members where email = 'coman@test.com'),
  false,
  'co-manager defaults out of the review rotation');

select is(
  (select in_review_rotation from public.project_members where email = 'reviewer@test.com'),
  true,
  'member defaults into the review rotation');

-- ============================================================
-- Co-manager of project A
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"coman@test.com"}';

-- Each count is 1 for project A; a cross-project leak would make it 2.
select is((select count(*) from public.participant_emails), 1::bigint,
  'manager sees participant emails for their project only');

select is((select count(*) from public.processing_jobs), 1::bigint,
  'manager sees processing jobs for their project only');

select is((select count(*) from public.submissions), 1::bigint,
  'manager sees submissions for their project only');

update public.projects set name = 'Renamed Show';
select is((select name from public.projects), 'Renamed Show',
  'co-manager can update the project');

delete from public.projects;
select is((select count(*) from public.projects), 1::bigint,
  'co-manager cannot delete the project');

select throws_ok(
  $$ update public.project_members set role = 'member' where email = 'owner@test.com' $$,
  'P0001', 'The owner cannot be demoted or revoked',
  'co-manager cannot demote the owner');

select throws_ok(
  $$ update public.project_members set revoked_at = now() where email = 'owner@test.com' $$,
  'P0001', 'The owner cannot be demoted or revoked',
  'co-manager cannot revoke the owner');

select throws_ok(
  $$ update public.project_members set email = 'me@test.com' where email = 'reviewer@test.com' $$,
  '42501', null,
  'managers cannot change a member''s email (column not granted)');

select lives_ok(
  $$ update public.project_members
       set role = 'co_manager', in_review_rotation = true, revoked_at = now()
     where email = 'extra@test.com' $$,
  'manager can change role, rotation and revoked status');

select is(
  (select (role, in_review_rotation, revoked_at is not null)::text
     from public.project_members where email = 'extra@test.com'),
  '(co_manager,t,t)',
  'those three changes were saved');

select lives_ok(
  $$ insert into public.tags (project_id, name)
     values (current_setting('test.project_id')::uuid, 'Comedy') $$,
  'manager can add a tag');

select throws_ok(
  $$ insert into public.tags (project_id, name)
     values (current_setting('test.project_id')::uuid, 'comedy') $$,
  '23505', null,
  'tag names are case-insensitive: comedy duplicates Comedy');

-- ============================================================
-- Reviewer of project A
-- ============================================================
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"reviewer@test.com"}';

-- Project A has 2 participants; a cross-project leak would make it 3.
select is((select count(*) from public.participants), 2::bigint,
  'reviewer sees participant names for their project only');

select is((select count(*) from public.participant_emails), 0::bigint,
  'reviewer cannot see participant emails');

select is((select count(*) from public.media_files), 1::bigint,
  'reviewer sees media files for their project only');

select is((select count(*) from public.processing_jobs), 0::bigint,
  'reviewer cannot see processing jobs');

select is((select count(*) from public.tags), 1::bigint,
  'reviewer can read tags');

select throws_ok(
  $$ insert into public.tags (project_id, name)
     values (current_setting('test.project_id')::uuid, 'Music') $$,
  '42501', null,
  'reviewer cannot add tags');

-- RLS doesn't raise an error here; it just matches 0 rows.
update public.projects set name = 'Hacked';
select is((select name from public.projects), 'Renamed Show',
  'reviewer cannot update the project');

update public.project_members set role = 'co_manager'
 where user_id = '33333333-3333-3333-3333-333333333333';
select is(
  (select role::text from public.project_members
    where user_id = '33333333-3333-3333-3333-333333333333'),
  'member',
  'reviewer cannot promote themselves');

-- ============================================================
-- Owner of project A
-- ============================================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.com"}';

select is((select count(*) from public.participant_emails), 1::bigint,
  'owner can see participant emails');

-- ============================================================
-- Pending invitee (signed in, confirmed, user_id not linked yet)
-- ============================================================
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","email":"invitee@test.com"}';

select is((select count(*) from public.projects), 1::bigint,
  'pending invitee can see the project before claiming (email match ignores case)');

do $$
begin
  perform public.claim_memberships();
end
$$;

select is(
  (select user_id from public.project_members where lower(email::text) = 'invitee@test.com'),
  '66666666-6666-6666-6666-666666666666'::uuid,
  'claim_memberships links the invite to the account');

-- ============================================================
-- People who must get nothing
-- ============================================================

-- A different account whose token carries an email already linked to the
-- reviewer (e.g. after an email change). It must not take the membership.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","email":"reviewer@test.com"}';

do $$
begin
  perform public.claim_memberships();
end
$$;

select is((select count(*) from public.projects), 0::bigint,
  'an email already linked to another account grants no access');

-- Unconfirmed account with an invited email.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","email":"pending@test.com"}';

select is((select count(*) from public.projects), 0::bigint,
  'an unconfirmed account gets no access through an invite');

do $$
begin
  perform public.claim_memberships();
end
$$;

-- Revoked pending invite (never linked).
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","email":"revokedinvite@test.com"}';

select is((select count(*) from public.projects), 0::bigint,
  'a revoked pending invite grants no access');

-- Revoked linked member.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"revoked@test.com"}';

select is(
  (select count(*) from public.projects)
  + (select count(*) from public.project_members)
  + (select count(*) from public.submissions),
  0::bigint,
  'revoked member sees nothing');

-- Signed in, not on any team.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","email":"stranger@test.com"}';

select is(
  (select count(*) from public.projects)
  + (select count(*) from public.project_members)
  + (select count(*) from public.submissions),
  0::bigint,
  'signed-in stranger sees nothing');

select is(public.is_manager(current_setting('test.project_id')::uuid), false,
  'is_manager returns false (not null) for a non-member');

-- ============================================================
-- Anonymous visitor
-- ============================================================

-- Close project B's form first, as the server.
reset role;
set local role service_role;
update public.projects set submissions_close_at = now() - interval '1 day'
 where id = current_setting('test.other_project_id')::uuid;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*) from public.projects)
  + (select count(*) from public.project_members)
  + (select count(*) from public.tags)
  + (select count(*) from public.submissions)
  + (select count(*) from public.participants)
  + (select count(*) from public.participant_emails)
  + (select count(*) from public.media_files)
  + (select count(*) from public.processing_jobs),
  0::bigint,
  'anonymous visitor sees no rows in any table');

-- The anon key is public, so direct inserts must be blocked.
select throws_ok(
  $$ insert into public.submissions (project_id, act_title, description, agreed_at)
     values (current_setting('test.project_id')::uuid, 'Spam', 'Spam', now()) $$,
  '42501', null,
  'anonymous visitor cannot insert submissions');

select throws_ok(
  $$ insert into public.participants (submission_id, position, name)
     values ('b0000000-0000-0000-0000-000000000001', 9, 'Spammer') $$,
  '42501', null,
  'anonymous visitor cannot insert participants');

select throws_ok(
  $$ insert into public.participant_emails (participant_id, email)
     values ('c0000000-0000-0000-0000-000000000002', 'spam@test.com') $$,
  '42501', null,
  'anonymous visitor cannot insert participant emails');

select is((select organizer_email from public.get_public_form('test-show')), 'owner@test.com',
  'public form shows the organizer email');

select is((select is_open from public.get_public_form('test-show')), true,
  'public form is open before the deadline');

select is((select is_open from public.get_public_form('other-show')), false,
  'public form is closed after the deadline');

select is((select count(*) from public.get_public_form('no-such-show')), 0::bigint,
  'an unknown slug returns nothing');

-- ============================================================
-- Acting as the server: finality and constraints still apply
-- ============================================================
reset role;
set local role service_role;

select throws_ok(
  $$ update public.submissions set act_title = 'Changed'
     where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Submissions are final: only status fields can change',
  'submission content cannot be edited, even by the server');

select throws_ok(
  $$ update public.submissions set id = gen_random_uuid()
     where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Submissions are final: only status fields can change',
  'a submission''s id cannot be changed');

select lives_ok(
  $$ update public.submissions set status = 'in_review'
     where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'submission status can still change');

select throws_ok(
  $$ update public.participants set name = 'Changed'
     where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Submissions are final: participants cannot be edited',
  'participants cannot be edited');

select throws_ok(
  $$ update public.participant_emails set email = 'x@test.com'
     where participant_id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Submissions are final: participants cannot be edited',
  'participant emails cannot be edited');

select throws_ok(
  $$ insert into public.participant_emails (participant_id, email)
     values ('c0000000-0000-0000-0000-000000000002', 'nope') $$,
  '23514', null,
  'a participant email without an @ and domain is rejected');

select throws_ok(
  $$ insert into public.participants (submission_id, position, name)
     values ('b0000000-0000-0000-0000-000000000001', 0, 'Zero') $$,
  '23514', null,
  'participant position must be 1 or more');

select throws_ok(
  $$ insert into public.processing_jobs (media_file_id)
     values ('d0000000-0000-0000-0000-000000000001') $$,
  '23505', null,
  'only one open job per file (extra Reprocess clicks do nothing)');

update public.processing_jobs set status = 'done'
 where media_file_id = 'd0000000-0000-0000-0000-000000000001';

-- A Reprocess request from the reviewer, so a job points at a member.
-- The delete test below checks this doesn't block deleting the project.
select lives_ok(
  $$ insert into public.processing_jobs (media_file_id, mode, requested_by)
     values ('d0000000-0000-0000-0000-000000000001', 'safe',
             (select id from public.project_members where email = 'reviewer@test.com')) $$,
  'a new job is allowed once the previous one is done');

select is(
  (select user_id from public.project_members where email = 'reviewer@test.com'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'claim_memberships did not take over the reviewer''s linked membership');

select is(
  (select user_id from public.project_members where email = 'pending@test.com'),
  null::uuid,
  'claim_memberships did not link an unconfirmed account');

-- ============================================================
-- Owner deletes project A: everything under it goes with it
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@test.com"}';

select lives_ok(
  $$ delete from public.projects where id = current_setting('test.project_id')::uuid $$,
  'owner can delete the project, even with a job that points at a member');

reset role;
set local role service_role;

select is(
  (select count(*) from public.projects where id = current_setting('test.project_id')::uuid)
  + (select count(*) from public.project_members where project_id = current_setting('test.project_id')::uuid)
  + (select count(*) from public.submissions where project_id = current_setting('test.project_id')::uuid)
  + (select count(*) from public.processing_jobs where media_file_id = 'd0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'deleting the project removed its members, submissions and jobs');

select * from finish();
rollback;
