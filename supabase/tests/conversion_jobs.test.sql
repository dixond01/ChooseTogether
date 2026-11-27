-- Tests for complete_upload(), claim_job() and finish_job()
-- (20261130150000_conversion_jobs.sql): the job lifecycle the ffmpeg Lambda uses.
-- Run with: npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, email_confirmed_at) values
  ('d1111111-1111-1111-1111-111111111111', 'jowner@test.com', now());
insert into public.site_admins (user_id) values ('d1111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","email":"jowner@test.com"}';
select set_config('test.p',
  (select id::text from public.create_project('Jobs', 'jobs-show', now() + interval '7 days')), true);

reset role;
set local role service_role;

-- Four submissions: a video, a text file, a HEIC photo and a PNG.
insert into public.submissions (id, project_id, act_title, description, agreed_at)
select ('f000000' || n || '-0000-0000-0000-000000000000')::uuid,
       current_setting('test.p')::uuid, 'Act ' || n, 'Desc', now()
from generate_series(1, 4) n;

insert into public.media_files (id, submission_id, kind, original_key, original_mime, original_size_bytes, duration_seconds) values
  ('a0000001-0000-0000-0000-000000000000', 'f0000001-0000-0000-0000-000000000000', 'video', 'originals/p/v.mov',  'video/quicktime', 1000, 61),
  ('a0000002-0000-0000-0000-000000000000', 'f0000002-0000-0000-0000-000000000000', 'text',  'originals/p/t.pdf',  'application/pdf', 1000, null),
  ('a0000003-0000-0000-0000-000000000000', 'f0000003-0000-0000-0000-000000000000', 'image', 'originals/p/i.HEIC', 'application/octet-stream', 1000, null),
  ('a0000004-0000-0000-0000-000000000000', 'f0000004-0000-0000-0000-000000000000', 'image', 'originals/p/i.png',  'image/png', 1000, null);

insert into public.processing_jobs (id, media_file_id) values
  ('b0000001-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000000'),
  ('b0000002-0000-0000-0000-000000000000', 'a0000002-0000-0000-0000-000000000000'),
  ('b0000003-0000-0000-0000-000000000000', 'a0000003-0000-0000-0000-000000000000'),
  ('b0000004-0000-0000-0000-000000000000', 'a0000004-0000-0000-0000-000000000000');

-- ============================================================
-- Who can call them
-- ============================================================
reset role;
set local role anon;
select throws_ok($$ select public.complete_upload('b0000001-0000-0000-0000-000000000000') $$,
  '42501', null, 'anonymous visitors cannot call complete_upload');
select throws_ok($$ select * from public.claim_job('b0000001-0000-0000-0000-000000000000') $$,
  '42501', null, 'anonymous visitors cannot call claim_job');

reset role;
set local role authenticated;
select throws_ok($$ select public.finish_job('b0000001-0000-0000-0000-000000000000', true, 'x') $$,
  '42501', null, 'signed-in users cannot call finish_job');

reset role;
set local role service_role;

-- ============================================================
-- complete_upload
-- ============================================================
select is(public.complete_upload('b0000001-0000-0000-0000-000000000000'), 'queued',
  'a video is queued for conversion');
select is(public.complete_upload('b0000001-0000-0000-0000-000000000000'), 'queued',
  'a repeated complete changes nothing');

select is(public.complete_upload('b0000002-0000-0000-0000-000000000000'), 'done',
  'a text file is finished right away');
select is((select processing_status from public.media_files where id = 'a0000002-0000-0000-0000-000000000000'),
  'ready', 'the text file is ready');
select is((select converted_key from public.media_files where id = 'a0000002-0000-0000-0000-000000000000'),
  'originals/p/t.pdf', 'the original doubles as the converted text file');
select isnt((select finished_at from public.processing_jobs where id = 'b0000002-0000-0000-0000-000000000000'),
  null, 'the text job has a finish time');

select is(public.complete_upload('b0000003-0000-0000-0000-000000000000'), 'queued',
  'a HEIC photo (known by its extension) is queued');
select is(public.complete_upload('b0000004-0000-0000-0000-000000000000'), 'done',
  'a PNG needs no conversion');

select throws_ok($$ select public.complete_upload('b0000009-0000-0000-0000-000000000000') $$,
  'P0002', null, 'an unknown job is an error');

-- ============================================================
-- claim_job
-- ============================================================
select is((select count(*)::int from public.claim_job('b0000002-0000-0000-0000-000000000000')), 0,
  'a finished job cannot be claimed');

create temp table claimed as
  select * from public.claim_job('b0000001-0000-0000-0000-000000000000', 1200);
select is((select count(*)::int from claimed), 1, 'a queued job can be claimed');
select is((select kind from claimed), 'video', 'the claim returns the file kind');
select is((select original_key from claimed), 'originals/p/v.mov', 'the claim returns the original key');
select is((select mode from claimed), 'standard', 'the claim returns the mode');
select ok((select needs_conversion from claimed), 'the claim says a video needs conversion');
select is((select attempts from claimed), 1, 'the claim counts the attempt');
select is((select status from public.processing_jobs where id = 'b0000001-0000-0000-0000-000000000000'),
  'running', 'the claimed job is running');
select ok((select lease_until > now() + interval '19 minutes'
             from public.processing_jobs where id = 'b0000001-0000-0000-0000-000000000000'),
  'the claimed job has a lease');

select is((select count(*)::int from public.claim_job('b0000001-0000-0000-0000-000000000000')), 0,
  'a second claim of the same job gets nothing');

-- ============================================================
-- finish_job
-- ============================================================
select throws_ok(
  $$ select public.finish_job('b0000001-0000-0000-0000-000000000000', true) $$,
  '22023', null, 'success without a converted key is refused');

select ok(public.finish_job('b0000001-0000-0000-0000-000000000000', true, 'converted/p/v.mp4', 63),
  'a running job can be finished');
select is((select processing_status from public.media_files where id = 'a0000001-0000-0000-0000-000000000000'),
  'ready', 'the converted video is ready');
select is((select duration_seconds from public.media_files where id = 'a0000001-0000-0000-0000-000000000000'),
  63, 'the real duration replaces the estimate');
select is((select status from public.processing_jobs where id = 'b0000001-0000-0000-0000-000000000000'),
  'done', 'the job is done');

select ok(not public.finish_job('b0000001-0000-0000-0000-000000000000', false, null, null, 'late'),
  'a job that is no longer running cannot be finished again');

-- A Reprocess of the converted video that fails keeps the old version playable.
insert into public.processing_jobs (id, media_file_id, mode, status) values
  ('b0000005-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000000', 'safe', 'queued');
update public.media_files set processing_status = 'pending' where id = 'a0000001-0000-0000-0000-000000000000';
do $$ begin
  perform public.claim_job('b0000005-0000-0000-0000-000000000000');
  perform public.finish_job('b0000005-0000-0000-0000-000000000000', false, null, null, 'ffmpeg exited 1');
end $$;
select is((select processing_status from public.media_files where id = 'a0000001-0000-0000-0000-000000000000'),
  'ready', 'a failed Reprocess leaves the earlier conversion ready');

-- A first conversion that fails marks the file failed.
do $$ begin
  perform public.claim_job('b0000003-0000-0000-0000-000000000000');
  perform public.finish_job('b0000003-0000-0000-0000-000000000000', false, null, null, 'bad file');
end $$;
select is((select processing_status from public.media_files where id = 'a0000003-0000-0000-0000-000000000000'),
  'failed', 'a failed first conversion marks the file failed');
select is((select error from public.processing_jobs where id = 'b0000003-0000-0000-0000-000000000000'),
  'bad file', 'the job keeps the error');

select * from finish();
rollback;
