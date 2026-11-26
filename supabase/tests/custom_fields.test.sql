-- Tests for custom form fields and typed answers (20261125220000_custom_form_fields.sql).
-- Run with: npx supabase test db
-- Same approach as rls_and_constraints.test.sql: one transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email, email_confirmed_at) values
  ('a1111111-1111-1111-1111-111111111111', 'fowner@test.com',    now()),
  ('a3333333-3333-3333-3333-333333333333', 'freviewer@test.com', now()),
  ('a5555555-5555-5555-5555-555555555555', 'fstranger@test.com', now());
insert into public.site_admins (user_id) values ('a1111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","email":"fowner@test.com"}';
select set_config('test.project_id',
  (select id::text from public.create_project('Gazette', 'gazette', now() + interval '7 days')), true);
select set_config('test.other_id',
  (select id::text from public.create_project('Other', 'other-form', now() + interval '7 days')), true);

reset role;
set local role service_role;
insert into public.project_members (project_id, email, role, user_id) values
  (current_setting('test.project_id')::uuid, 'freviewer@test.com', 'member',
   'a3333333-3333-3333-3333-333333333333');

-- ============================================================
-- Project defaults
-- ============================================================
select is((select title_label from public.projects where slug = 'gazette'), 'Title',
  'new projects get default labels');
select is((select accepted_kinds from public.projects where slug = 'gazette'),
  '{video,audio,image,text}'::public.media_kind[], 'new projects accept every kind of file');
select throws_ok(
  $$ update public.projects set accepted_kinds = '{}' where slug = 'gazette' $$,
  '23514', null, 'a project must accept at least one kind of file');

-- ============================================================
-- Managing fields
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","email":"fowner@test.com"}';

insert into public.project_fields (id, project_id, label, type, required, position, placeholder, options) values
  ('f0000000-0000-0000-0000-000000000001', current_setting('test.project_id')::uuid,
   'Section', 'choice', true, 1, null, '{News,Sports,Opinion}'),
  ('f0000000-0000-0000-0000-000000000002', current_setting('test.project_id')::uuid,
   'Word Count', 'number', false, 2, 'e.g. 800', null),
  ('f0000000-0000-0000-0000-000000000003', current_setting('test.project_id')::uuid,
   'Notes', 'long_text', false, 3, null, null),
  ('f0000000-0000-0000-0000-000000000004', current_setting('test.project_id')::uuid,
   'Original Work', 'checkbox', true, 4, null, null),
  ('f0000000-0000-0000-0000-000000000005', current_setting('test.project_id')::uuid,
   'Event Date', 'date', false, 5, null, null);

select is((select count(*) from public.project_fields), 5::bigint, 'a manager can add fields');

select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position, options)
     values (current_setting('test.project_id')::uuid, 'One Option', 'choice', 9, '{Only}') $$,
  '23514', null, 'a choice field needs at least 2 options');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position, options)
     values (current_setting('test.project_id')::uuid, 'Dupes', 'choice', 9, '{A,A}') $$,
  '23514', null, 'choice options must be different');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position, options)
     values (current_setting('test.project_id')::uuid, 'Blank', 'choice', 9, '{A," "}') $$,
  '23514', null, 'choice options must not be blank');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position, options)
     values (current_setting('test.project_id')::uuid, 'Text With Options', 'short_text', 9, '{A,B}') $$,
  '23514', null, 'only choice fields have options');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position, placeholder)
     values (current_setting('test.project_id')::uuid, 'Box', 'checkbox', 9, 'hint') $$,
  '23514', null, 'checkboxes have no placeholder');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position)
     values (current_setting('test.project_id')::uuid, 'Same Spot', 'short_text', 1) $$,
  '23505', null, 'two fields cannot share a position');

select throws_ok(
  $$ update public.project_fields set type = 'short_text'
     where id = 'f0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'the app cannot change a field type (column grant)');

select lives_ok(
  $$ select public.reorder_project_fields(current_setting('test.project_id')::uuid, array[
       'f0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001',
       'f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003',
       'f0000000-0000-0000-0000-000000000004']::uuid[]) $$,
  'a manager can reorder fields');
select is((select position from public.project_fields where id = 'f0000000-0000-0000-0000-000000000005'),
  1, 'reorder moves the field to its new position');
select throws_ok(
  $$ select public.reorder_project_fields(current_setting('test.project_id')::uuid,
       array['f0000000-0000-0000-0000-000000000005']::uuid[]) $$,
  'P0001', null, 'reorder must list every field');

-- Reviewer (member) ---------------------------------------------
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","email":"freviewer@test.com"}';
select is((select count(*) from public.project_fields), 5::bigint, 'a member can read the fields');
select throws_ok(
  $$ insert into public.project_fields (project_id, label, type, position)
     values (current_setting('test.project_id')::uuid, 'Sneaky', 'short_text', 9) $$,
  '42501', null, 'a member cannot add fields');
update public.project_fields set label = 'Changed' where id = 'f0000000-0000-0000-0000-000000000003';
select is((select label from public.project_fields where id = 'f0000000-0000-0000-0000-000000000003'),
  'Notes', 'a member cannot rename fields');
select throws_ok(
  $$ select public.reorder_project_fields(current_setting('test.project_id')::uuid, array[
       'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002',
       'f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004',
       'f0000000-0000-0000-0000-000000000005']::uuid[]) $$,
  'P0001', null, 'a member cannot reorder fields');

-- Stranger -------------------------------------------------------
set local request.jwt.claims = '{"sub":"a5555555-5555-5555-5555-555555555555","email":"fstranger@test.com"}';
select is((select count(*) from public.project_fields), 0::bigint, 'a stranger sees no fields');

-- ============================================================
-- Answers (written by the submit Edge Function as service role)
-- ============================================================
reset role;
set local role service_role;
insert into public.submissions (id, project_id, act_title, description, agreed_at) values
  ('e0000000-0000-0000-0000-000000000001', current_setting('test.project_id')::uuid,
   'City Council Votes', 'Coverage of the budget vote', now()),
  ('e0000000-0000-0000-0000-000000000002', current_setting('test.other_id')::uuid,
   'Elsewhere', 'Other project', now());

select lives_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_text, value_number, value_bool, value_date) values
     ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'News', null, null, null),
     ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, 812, null, null),
     ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', null, null, true, null),
     ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', null, null, null, '2026-12-01') $$,
  'answers of each type are stored');

select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_text)
     values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', '   ') $$,
  '23514', null, 'a blank text answer is rejected');
select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_number)
     values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 5) $$,
  '23514', null, 'an answer in the wrong value column is rejected');
select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_text, value_number)
     values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'x', 5) $$,
  '23514', null, 'an answer with two values is rejected');
select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_number)
     values ('e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', 1) $$,
  '23514', null, 'an answer to another project''s field is rejected');

-- A fresh field, so the choice check isn't hidden by the primary key.
insert into public.project_fields (id, project_id, label, type, position, options) values
  ('f0000000-0000-0000-0000-000000000006', current_setting('test.project_id')::uuid,
   'Length', 'choice', 6, '{Short,Long}');
select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_text)
     values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'Medium') $$,
  '23514', null, 'a choice answer must be one of the options');
select throws_ok(
  $$ insert into public.submission_answers (submission_id, field_id, value_number)
     values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 1) $$,
  '23514', null, 'a choice answer must be text');

select throws_ok(
  $$ update public.submission_answers set value_number = 900
     where field_id = 'f0000000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'answers are final, even for the service role');

-- ============================================================
-- Field changes once answers exist
-- ============================================================
select throws_ok(
  $$ update public.project_fields set options = '{News,Opinion}'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'options with answers cannot be removed');
select lives_ok(
  $$ update public.project_fields set options = '{News,Sports,Opinion,Arts}'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  'options with answers can be added to the end');
select lives_ok(
  $$ update public.project_fields set options = '{Brief,Feature}'
     where id = 'f0000000-0000-0000-0000-000000000006' $$,
  'options without answers can change freely');
select throws_ok(
  $$ update public.project_fields set type = 'short_text'
     where id = 'f0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a field type never changes, even for the service role');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","email":"fowner@test.com"}';
select throws_ok(
  $$ delete from public.project_fields where id = 'f0000000-0000-0000-0000-000000000002' $$,
  '23503', null, 'a field with answers cannot be deleted');
update public.project_fields set archived_at = now() where id = 'f0000000-0000-0000-0000-000000000002';
select is((select count(*) from public.submission_answers), 4::bigint,
  'a manager reads answers, and hiding a field keeps them');

-- ============================================================
-- Public form
-- ============================================================
reset role;
set local role anon;
select is((select string_agg(label, ',') from public.get_public_form_fields('gazette')),
  'Event Date,Section,Notes,Original Work,Length',
  'the public form gets the visible fields in order, without hidden ones');
select is((select participants_label from public.get_public_form('gazette')), 'Participants',
  'the public form gets the labels');

select * from finish();
rollback;
