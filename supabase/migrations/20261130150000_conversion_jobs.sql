-- Conversion jobs: the database side of the ffmpeg Lambda (worker/).
--
--   complete_upload(job)   upload Edge Function: the original is in R2. Files
--                          browsers already show are finished right here;
--                          the rest are queued for the Lambda.
--   claim_job(job)         Lambda: queued -> running, with a lease. Only one
--                          caller wins, so a duplicate invocation just exits.
--   finish_job(job, ...)   Lambda: running -> done | failed, and updates the file.
--
-- All three are service_role only (the Edge Function and the Lambda use the
-- service-role key; nobody in the browser can call them).

-- Does this file need ffmpeg? Videos and audio always do (any codec can show
-- up). Images only for HEIC/HEIF, which most browsers can't show. Text never.
create function public.needs_conversion(p_kind public.media_kind, p_mime text, p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'video' then true
    when 'audio' then true
    when 'image' then lower(coalesce(p_mime, '')) in ('image/heic', 'image/heif')
                      or lower(p_key) ~ '\.(heic|heif)$'
    else false
  end;
$$;

-- Returns 'queued' (invoke the Lambda) or 'done' (nothing to convert).
-- Only moves a job out of awaiting_upload; anything else returns its status
-- unchanged, so a repeated "complete" is harmless.
create function public.complete_upload(p_job_id uuid)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job  public.processing_jobs;
  v_file public.media_files;
begin
  select * into v_job from public.processing_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'awaiting_upload' then
    return v_job.status;
  end if;

  select * into v_file from public.media_files where id = v_job.media_file_id for update;

  if public.needs_conversion(v_file.kind, v_file.original_mime, v_file.original_key) then
    update public.processing_jobs set status = 'queued' where id = p_job_id;
    return 'queued';
  end if;

  -- Already viewable: the original doubles as the converted file.
  update public.processing_jobs
     set status = 'done', finished_at = now()
   where id = p_job_id;
  update public.media_files
     set converted_key = original_key, processing_status = 'ready'
   where id = v_file.id;
  return 'done';
end;
$$;

-- Claims a queued job for one Lambda run. Returns no rows if someone else
-- already has it (or it isn't queued), and the caller should stop.
create function public.claim_job(p_job_id uuid, p_lease_seconds int default 1200)
returns table (job_id              uuid,
               mode                public.job_mode,
               attempts            int,
               media_file_id       uuid,
               kind                public.media_kind,
               original_key        text,
               original_mime       text,
               original_size_bytes bigint,
               original_deleted    boolean,
               needs_conversion    boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.processing_jobs j
       set status = 'running',
           lease_until = now() + make_interval(secs => p_lease_seconds),
           attempts = j.attempts + 1,
           error = null
     where j.id = p_job_id and j.status = 'queued'
     returning j.id, j.mode, j.attempts, j.media_file_id
  )
  select c.id, c.mode, c.attempts, f.id, f.kind, f.original_key, f.original_mime,
         f.original_size_bytes, f.original_deleted_at is not null,
         public.needs_conversion(f.kind, f.original_mime, f.original_key)
  from claimed c
  join public.media_files f on f.id = c.media_file_id;
$$;

-- Records the result of a claimed job. Returns false if the job is no longer
-- running (e.g. the sweep already gave up on it), and nothing is changed.
--   success: converted_key is set; duration_seconds replaces the browser's
--            estimate when given.
--   failure: p_error says why. If an earlier conversion still exists (a
--            failed Reprocess), the file stays 'ready' with that version.
create function public.finish_job(p_job_id uuid,
                                  p_ok boolean,
                                  p_converted_key text default null,
                                  p_duration_seconds int default null,
                                  p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file_id uuid;
begin
  if p_ok and p_converted_key is null then
    raise exception 'a finished job needs converted_key' using errcode = '22023';
  end if;

  update public.processing_jobs
     set status = case when p_ok then 'done'::public.job_status else 'failed' end,
         finished_at = now(),
         lease_until = null,
         error = case when p_ok then null else left(coalesce(p_error, 'unknown error'), 2000) end
   where id = p_job_id and status = 'running'
  returning media_file_id into v_file_id;
  if v_file_id is null then
    return false;
  end if;

  if p_ok then
    update public.media_files
       set converted_key = p_converted_key,
           duration_seconds = coalesce(p_duration_seconds, duration_seconds),
           processing_status = 'ready'
     where id = v_file_id;
  else
    update public.media_files
       set processing_status = case when converted_key is null
                                    then 'failed'::public.processing_status
                                    else 'ready' end
     where id = v_file_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.needs_conversion(public.media_kind, text, text) from public, anon, authenticated;
revoke execute on function public.complete_upload(uuid) from public, anon, authenticated;
revoke execute on function public.claim_job(uuid, int) from public, anon, authenticated;
revoke execute on function public.finish_job(uuid, boolean, text, int, text) from public, anon, authenticated;
grant execute on function public.needs_conversion(public.media_kind, text, text) to service_role;
grant execute on function public.complete_upload(uuid) to service_role;
grant execute on function public.claim_job(uuid, int) to service_role;
grant execute on function public.finish_job(uuid, boolean, text, int, text) to service_role;
