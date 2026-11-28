-- Tests for sweep_jobs() and invoke_job_sweep() (20261201150000_job_sweep.sql).
-- Run with: npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1111111-1111-1111-1111-111111111111', 'sowner@test.com', now());
insert into public.site_admins (user_id) values ('e1111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","email":"sowner@test.com"}';
select set_config('test.p',
  (select id::text from public.create_project('Sweep', 'sweep-show', now() + interval '7 days')), true);
reset role;

insert into public.submissions (id, project_id, act_title, description, agreed_at)
select ('f100000' || n || '-0000-0000-0000-000000000000')::uuid,
       current_setting('test.p')::uuid, 'Act ' || n, 'Desc', now()
from generate_series(1, 7) n;

insert into public.media_files (id, submission_id, kind, original_key, original_mime, original_size_bytes)
select ('a100000' || n || '-0000-0000-0000-000000000000')::uuid,
       ('f100000' || n || '-0000-0000-0000-000000000000')::uuid,
       'video', 'originals/p/' || n || '.mov', 'video/quicktime', 1000
from generate_series(1, 7) n;

-- 1 running, lease expired, 1 attempt      -> requeued
-- 2 running, lease expired, 3 attempts     -> failed
-- 3 running, lease still good              -> left alone
-- 4 queued long ago (lost invocation)      -> re-invoked
-- 5 queued just now                        -> left for the upload function
-- 6 awaiting upload                        -> left alone
-- 7 running, lease expired, 3 attempts, earlier conversion -> failed, file stays ready
insert into public.processing_jobs (id, media_file_id, status, lease_until, attempts, created_at) values
  ('b1000001-0000-0000-0000-000000000000', 'a1000001-0000-0000-0000-000000000000', 'running',  now() - interval '1 minute', 1, now() - interval '1 hour'),
  ('b1000002-0000-0000-0000-000000000000', 'a1000002-0000-0000-0000-000000000000', 'running',  now() - interval '1 minute', 3, now() - interval '1 hour'),
  ('b1000003-0000-0000-0000-000000000000', 'a1000003-0000-0000-0000-000000000000', 'running',  now() + interval '10 minutes', 1, now() - interval '1 hour'),
  ('b1000004-0000-0000-0000-000000000000', 'a1000004-0000-0000-0000-000000000000', 'queued',   null, 0, now() - interval '1 hour'),
  ('b1000005-0000-0000-0000-000000000000', 'a1000005-0000-0000-0000-000000000000', 'queued',   null, 0, now()),
  ('b1000006-0000-0000-0000-000000000000', 'a1000006-0000-0000-0000-000000000000', 'awaiting_upload', null, 0, now() - interval '1 hour'),
  ('b1000007-0000-0000-0000-000000000000', 'a1000007-0000-0000-0000-000000000000', 'running',  now() - interval '1 minute', 3, now() - interval '1 hour');
update public.media_files set converted_key = 'converted/p/7.mp4', processing_status = 'pending'
 where id = 'a1000007-0000-0000-0000-000000000000';

-- ============================================================
-- Who can call them
-- ============================================================
set local role anon;
select throws_ok($$ select * from public.sweep_jobs() $$, '42501', null,
  'anonymous visitors cannot call sweep_jobs');
reset role;
set local role authenticated;
select throws_ok($$ select public.invoke_job_sweep() $$, '42501', null,
  'signed-in users cannot call invoke_job_sweep');
reset role;
set local role service_role;
select throws_ok($$ select public.invoke_job_sweep() $$, '42501', null,
  'the service role cannot call invoke_job_sweep either (only pg_cron does)');

-- ============================================================
-- sweep_jobs
-- ============================================================
-- Only this test's jobs (b1...): the local database may hold other data.
create temp table swept as
  select id from public.sweep_jobs() as id where id::text like 'b100000%';

select set_eq('select id from swept',
  $$ values ('b1000001-0000-0000-0000-000000000000'::uuid), ('b1000004-0000-0000-0000-000000000000'::uuid) $$,
  'the sweep returns the requeued job and the lost queued job');

select is((select status from public.processing_jobs where id = 'b1000001-0000-0000-0000-000000000000'),
  'queued', 'an expired run with attempts left is requeued');
select is((select lease_until from public.processing_jobs where id = 'b1000001-0000-0000-0000-000000000000'),
  null, 'the requeued job has no lease');
select is((select count(*)::int from public.claim_job('b1000001-0000-0000-0000-000000000000')), 1,
  'the requeued job can be claimed again');
select is((select attempts from public.processing_jobs where id = 'b1000001-0000-0000-0000-000000000000'),
  2, 'the new claim counts a second attempt');

select is((select status from public.processing_jobs where id = 'b1000002-0000-0000-0000-000000000000'),
  'failed', 'an expired run out of attempts fails');
select is((select error from public.processing_jobs where id = 'b1000002-0000-0000-0000-000000000000'),
  'Conversion stopped responding (tried 3 times)', 'the failed job says why');
select is((select processing_status from public.media_files where id = 'a1000002-0000-0000-0000-000000000000'),
  'failed', 'its file is marked failed');
select is((select processing_status from public.media_files where id = 'a1000007-0000-0000-0000-000000000000'),
  'ready', 'a file with an earlier conversion stays ready when the retry gives up');

select is((select status from public.processing_jobs where id = 'b1000003-0000-0000-0000-000000000000'),
  'running', 'a run with a good lease is left alone');
select is((select status from public.processing_jobs where id = 'b1000006-0000-0000-0000-000000000000'),
  'awaiting_upload', 'a job still waiting for its upload is left alone');

select is((select count(*)::int from public.sweep_jobs() as id where id::text like 'b100000%'), 1,
  'a second sweep returns only the still-queued lost job');

-- ============================================================
-- Schedule
-- ============================================================
reset role;
select is((select schedule from cron.job where jobname = 'sweep-conversion-jobs'),
  '*/5 * * * *', 'the sweep is scheduled every 5 minutes');
select is(public.invoke_job_sweep(), null,
  'without the Vault secrets the cron job does nothing');

select * from finish();
rollback;
