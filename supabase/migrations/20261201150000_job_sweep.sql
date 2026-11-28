-- Sweep for stuck conversion jobs (files-and-conversion.md).
--
-- Every 5 minutes pg_cron runs invoke_job_sweep(), which uses pg_net to call
-- the sweep-jobs Edge Function. That function calls sweep_jobs() below and
-- invokes the Lambda for every job it returns. (Postgres can't sign AWS
-- requests, so the Lambda call has to happen in the Edge Function.)
--
-- A job is stuck when:
--   running, past its lease   the Lambda was killed mid-run. Requeued, or
--                             failed once it has used up its attempts.
--   queued                    the invocation after upload failed or was lost.
--                             Re-invoking is safe: claim_job lets only one
--                             run have the job, and any others just exit.
--
-- Setup (once per database, in the SQL editor; values are not in git):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'job_sweep_secret');
-- and the same string as the function's secret:
--   npx supabase secrets set --remote JOB_SWEEP_SECRET=<random string>
-- Until both Vault secrets exist the cron job does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Returns the IDs of jobs to (re)invoke. Running jobs whose lease ran out
-- are moved back to queued first, or failed after p_max_attempts runs.
create function public.sweep_jobs(p_max_attempts int default 3,
                                  p_queued_grace interval default interval '2 minutes',
                                  p_limit int default 100)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs;
begin
  for v_job in
    select * from public.processing_jobs
     where status = 'running' and lease_until < now()
     order by lease_until
     limit p_limit
       for update skip locked
  loop
    if v_job.attempts >= p_max_attempts then
      perform public.finish_job(v_job.id, false, null, null,
        format('Conversion stopped responding (tried %s times)', v_job.attempts));
    else
      update public.processing_jobs
         set status = 'queued',
             lease_until = null,
             error = 'Conversion stopped responding; retrying'
       where id = v_job.id;
    end if;
  end loop;

  -- Includes the jobs just requeued above. created_at is only a rough guard
  -- against re-invoking a job the upload function is starting right now;
  -- a duplicate invocation is harmless anyway.
  return query
    select id from public.processing_jobs
     where status = 'queued'
       and (created_at < now() - p_queued_grace or error is not null)
     order by created_at
     limit p_limit;
end;
$$;

-- What pg_cron runs. Fires the HTTP call and returns right away (pg_net sends
-- it in the background). Returns the pg_net request ID, or null when the
-- Vault secrets aren't set up.
create function public.invoke_job_sweep()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'job_sweep_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/sweep-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.sweep_jobs(int, interval, int) from public, anon, authenticated;
-- Only pg_cron (as postgres) runs it.
revoke execute on function public.invoke_job_sweep() from public, anon, authenticated, service_role;
grant execute on function public.sweep_jobs(int, interval, int) to service_role;

select cron.schedule('sweep-conversion-jobs', '*/5 * * * *', 'select public.invoke_job_sweep()');
