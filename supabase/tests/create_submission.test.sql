-- Tests for create_submission() (20261128150000_create_submission.sql): the
-- one-transaction insert behind the submit Edge Function.
-- Run with: npx supabase test db
-- Same approach as rls_and_constraints.test.sql: one transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, email_confirmed_at) values
  ('c1111111-1111-1111-1111-111111111111', 'sowner@test.com', now());
insert into public.site_admins (user_id) values ('c1111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","email":"sowner@test.com"}';
select set_config('test.p',
  (select id::text from public.create_project('Show', 'sub-show', now() + interval '7 days')), true);
select set_config('test.closed',
  (select id::text from public.create_project('Closed', 'sub-closed', now() + interval '7 days')), true);

reset role;
set local role service_role;
update public.projects
   set max_participants = 2, max_duration_seconds = 300, agreement_text = 'I agree.',
       accepted_kinds = '{video,audio}'
 where id = current_setting('test.p')::uuid;
update public.projects set submissions_close_at = now() - interval '1 minute'
 where id = current_setting('test.closed')::uuid;

insert into public.project_fields (id, project_id, label, type, required, position, options, archived_at) values
  ('e0000000-0000-0000-0000-000000000001', current_setting('test.p')::uuid, 'Needs',   'long_text', false, 1, null, null),
  ('e0000000-0000-0000-0000-000000000002', current_setting('test.p')::uuid, 'Genre',   'choice',    true,  2, '{Song,Dance}', null),
  ('e0000000-0000-0000-0000-000000000003', current_setting('test.p')::uuid, 'Rehearse','checkbox',  true,  3, null, null),
  ('e0000000-0000-0000-0000-000000000004', current_setting('test.p')::uuid, 'Old',     'short_text',false, 4, null, now());

-- A valid submission's parts, reused (and broken one at a time) below.
create temp table t (people jsonb, answers jsonb, file jsonb);
grant all on t to anon, authenticated, service_role;
insert into t values (
  '[{"name":"Ana","email":"ana@test.com"},{"name":"Ben","email":null}]',
  '[{"field_id":"e0000000-0000-0000-0000-000000000002","value_text":"Song"},
    {"field_id":"e0000000-0000-0000-0000-000000000003","value_bool":true},
    {"field_id":"e0000000-0000-0000-0000-000000000001","value_text":"A piano"}]',
  '{"kind":"video","mime":"video/quicktime","size_bytes":1000,"duration_seconds":120,"ext":"MOV"}'
);

-- ============================================================
-- Who can call it
-- ============================================================
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t), (select file from t)) $$,
  '42501', null, 'anonymous visitors cannot call create_submission directly');

reset role;
set local role authenticated;
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t), (select file from t)) $$,
  '42501', null, 'signed-in users cannot call create_submission directly');

-- ============================================================
-- A valid submission saves every part
-- ============================================================
reset role;
set local role service_role;
create temp table r as
  select * from public.create_submission(current_setting('test.p')::uuid, '  My Act ', 'Juggling', true,
    (select people from t), (select answers from t), (select file from t));

select is((select act_title from public.submissions where id = (select submission_id from r)),
  'My Act', 'the title is saved trimmed');
select is((select array_agg(name order by position) from public.participants
           where submission_id = (select submission_id from r)),
  '{Ana,Ben}'::text[], 'participants are saved in form order');
select is((select count(*) from public.participant_emails e
           join public.participants p on p.id = e.participant_id
           where p.submission_id = (select submission_id from r)),
  1::bigint, 'only participants who gave an email get an email row');
select is((select count(*) from public.submission_answers where submission_id = (select submission_id from r)),
  3::bigint, 'answers are saved');
select is((select original_key from public.media_files where submission_id = (select submission_id from r)),
  'originals/' || current_setting('test.p') || '/' || (select media_file_id from r) || '.mov',
  'the R2 key is under originals/{project}/ with a lowercase extension');
select is((select status::text from public.processing_jobs where id = (select job_id from r)),
  'awaiting_upload', 'the first job waits for the upload');
select is((select processing_status::text from public.media_files where id = (select media_file_id from r)),
  'pending', 'the file starts pending');

-- ============================================================
-- Rules (each call breaks one rule; nothing is saved)
-- ============================================================
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.closed')::uuid, 'T', 'D', true,
       (select people from t), '[]', null) $$,
  '22023', 'Submissions are closed.', 'a closed form rejects submissions');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, ' ', 'D', true,
       (select people from t), (select answers from t), (select file from t)) $$,
  '22023', null, 'a title is required');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', false,
       (select people from t), (select answers from t), (select file from t)) $$,
  '22023', 'You need to agree before submitting.', 'the agreement must be ticked');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       '[{"name":"Ana","email":null}]', (select answers from t), (select file from t)) $$,
  '22023', 'At least one participant needs an email address.', 'at least one participant needs an email');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       '[]', (select answers from t), (select file from t)) $$,
  '22023', null, 'at least one participant is required');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       '[{"name":"A","email":"a@t.co"},{"name":"B","email":null},{"name":"C","email":null}]',
       (select answers from t), (select file from t)) $$,
  '22023', 'Up to 2 participants.', 'max_participants is enforced');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       '[{"name":"Ana","email":"not-an-email"}]', (select answers from t), (select file from t)) $$,
  '22023', null, 'emails are checked');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t), null) $$,
  '22023', 'Choose a file.', 'a required file must be given');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t),
       '{"kind":"image","mime":"image/png","size_bytes":10,"ext":"png"}') $$,
  '22023', 'This kind of file isn''t accepted.', 'only accepted kinds of file are allowed');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t),
       '{"kind":"video","mime":"video/mp4","size_bytes":10,"duration_seconds":301,"ext":"mp4"}') $$,
  '22023', null, 'the max duration is enforced');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t),
       '{"kind":"video","mime":"video/mp4","size_bytes":6000000000,"ext":"mp4"}') $$,
  '22023', 'Files can be up to 5 GB.', 'files over 5 GB are rejected');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t),
       '[{"field_id":"e0000000-0000-0000-0000-000000000003","value_bool":true}]', (select file from t)) $$,
  '22023', 'Fill in "Genre".', 'required fields must be answered');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t),
       '[{"field_id":"e0000000-0000-0000-0000-000000000002","value_text":"Song"},
         {"field_id":"e0000000-0000-0000-0000-000000000003","value_bool":false}]', (select file from t)) $$,
  '22023', 'Fill in "Rehearse".', 'a required checkbox must be ticked');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t),
       (select answers from t) || '[{"field_id":"e0000000-0000-0000-0000-000000000004","value_text":"x"}]',
       (select file from t)) $$,
  '22023', null, 'hidden fields cannot be answered');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t),
       (select answers from t) || '[{"field_id":"e0000000-0000-0000-0000-000000000001","value_text":"again"}]',
       (select file from t)) $$,
  '22023', null, 'a field cannot be answered twice');
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t),
       '[{"field_id":"e0000000-0000-0000-0000-000000000002","value_text":"Opera"},
         {"field_id":"e0000000-0000-0000-0000-000000000003","value_bool":true}]', (select file from t)) $$,
  '23514', null, 'a choice answer must be one of the options');

-- A failure part way through (the bad choice above is caught only after the
-- submission and participants were inserted) leaves nothing behind.
select is((select count(*) from public.submissions where project_id = current_setting('test.p')::uuid),
  1::bigint, 'failed submissions save nothing');

-- ============================================================
-- Forms with no file
-- ============================================================
update public.projects set file_requirement = 'none' where id = current_setting('test.p')::uuid;
select throws_ok(
  $$ select * from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
       (select people from t), (select answers from t), (select file from t)) $$,
  '22023', null, 'a form with no file rejects a file');
select is(
  (select media_file_id from public.create_submission(current_setting('test.p')::uuid, 'T', 'D', true,
     (select people from t), (select answers from t), null)),
  null, 'a submission with no file has no media row or job');

select * from finish();
rollback;
