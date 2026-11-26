-- Saving a public form submission (see Documents/spec/submission-form.md and
-- files-and-conversion.md). The submit Edge Function checks Turnstile, then
-- calls create_submission(), which checks every form rule and inserts the
-- submission, participants, emails, answers, file row and first job in one
-- transaction: either all of it is saved or none of it is.
--
-- Rule failures raise errcode 22023 with a message the form can show as is.

-- R2 limits a single upload (one PUT) to about 5 GB.
alter table media_files
  add constraint media_files_max_size check (original_size_bytes <= 5000000000);

create function public.create_submission(
  p_project_id   uuid,
  p_title        text,
  p_description  text,
  p_agreed       boolean,
  -- [{ "name": "...", "email": "..." | null }, ...] in form order
  p_participants jsonb,
  -- [{ "field_id": "...", "value_text" | "value_number" | "value_bool" | "value_date": ... }, ...]
  p_answers      jsonb,
  -- null, or { "kind", "mime", "size_bytes", "duration_seconds", "ext" }
  p_file         jsonb
)
returns table (submission_id uuid, media_file_id uuid, job_id uuid, original_key text)
language plpgsql
-- security definer + no grants to anon/authenticated: only the service role
-- (the Edge Function) can call it.
security definer
set search_path = ''
as $$
declare
  v_project    public.projects;
  v_submission uuid;
  v_media      uuid;
  v_job        uuid;
  v_key        text;
  v_p          jsonb;
  v_a          jsonb;
  v_pid        uuid;
  v_pos        int := 0;
  v_email      text;
  v_has_email  boolean := false;
  v_kind       public.media_kind;
  v_ext        text;
  v_missing    text;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'This form doesn''t exist.' using errcode = '22023';
  end if;
  if now() >= v_project.submissions_close_at then
    raise exception 'Submissions are closed.' using errcode = '22023';
  end if;

  -- ---------- core fields ----------
  if coalesce(length(trim(p_title)), 0) = 0 or length(p_title) > 200 then
    raise exception 'Enter a title (up to 200 characters).' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_description)), 0) = 0 or length(p_description) > 5000 then
    raise exception 'Enter a description (up to 5000 characters).' using errcode = '22023';
  end if;
  if v_project.agreement_text is not null and p_agreed is not true then
    raise exception 'You need to agree before submitting.' using errcode = '22023';
  end if;

  -- ---------- participants ----------
  if jsonb_typeof(p_participants) is distinct from 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'Add at least one %.', lower(v_project.participant_label) using errcode = '22023';
  end if;
  -- 100: a sanity cap for projects with no limit.
  if jsonb_array_length(p_participants) > coalesce(v_project.max_participants, 100) then
    raise exception 'Up to % %.', coalesce(v_project.max_participants, 100),
      lower(v_project.participants_label) using errcode = '22023';
  end if;
  for v_p in select * from jsonb_array_elements(p_participants) loop
    v_email := nullif(trim(v_p ->> 'email'), '');
    if coalesce(length(trim(v_p ->> 'name')), 0) = 0 or length(v_p ->> 'name') > 200 then
      raise exception 'Enter a name for every %.', lower(v_project.participant_label) using errcode = '22023';
    end if;
    if v_email is not null then
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
        raise exception 'Check the email address %.', v_email using errcode = '22023';
      end if;
      v_has_email := true;
    end if;
  end loop;
  if not v_has_email then
    raise exception 'At least one % needs an email address.', lower(v_project.participant_label)
      using errcode = '22023';
  end if;

  -- ---------- file ----------
  if p_file is null or jsonb_typeof(p_file) = 'null' then
    if v_project.file_requirement = 'required' then
      raise exception 'Choose a file.' using errcode = '22023';
    end if;
  else
    if v_project.file_requirement = 'none' then
      raise exception 'This form doesn''t take a file.' using errcode = '22023';
    end if;
    v_kind := (p_file ->> 'kind')::public.media_kind;
    if v_kind is null or not (v_kind = any (v_project.accepted_kinds)) then
      raise exception 'This kind of file isn''t accepted.' using errcode = '22023';
    end if;
    if (p_file ->> 'size_bytes')::bigint is null or (p_file ->> 'size_bytes')::bigint <= 0 then
      raise exception 'The file is empty.' using errcode = '22023';
    end if;
    if (p_file ->> 'size_bytes')::bigint > 5000000000 then
      raise exception 'Files can be up to 5 GB.' using errcode = '22023';
    end if;
    -- The browser reads the duration before upload; the worker records the real one.
    if v_kind in ('video', 'audio') and v_project.max_duration_seconds is not null
       and (p_file ->> 'duration_seconds')::int > v_project.max_duration_seconds then
      raise exception 'This file is longer than the limit.' using errcode = '22023';
    end if;
    v_ext := lower(p_file ->> 'ext');
    if v_ext is not null and v_ext !~ '^[a-z0-9]{1,10}$' then
      v_ext := null;
    end if;
  end if;

  -- ---------- answers: only this project's visible fields, at most once each ----------
  if p_answers is null or jsonb_typeof(p_answers) = 'null' then
    p_answers := '[]';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a list.' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_array_elements(p_answers) a
       where not exists (select 1 from public.project_fields f
                         where f.id::text = a ->> 'field_id'
                           and f.project_id = p_project_id
                           and f.archived_at is null))
     or (select count(*) from jsonb_array_elements(p_answers))
        <> (select count(distinct a ->> 'field_id') from jsonb_array_elements(p_answers) a) then
    raise exception 'This form changed while you were filling it in. Reload the page and try again.'
      using errcode = '22023';
  end if;

  -- Required fields: answered, and a required checkbox is ticked.
  select f.label into v_missing
  from public.project_fields f
  where f.project_id = p_project_id and f.archived_at is null and f.required
    and not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where a ->> 'field_id' = f.id::text
        and (f.type <> 'checkbox' or (a ->> 'value_bool')::boolean is true))
  order by f.position
  limit 1;
  if v_missing is not null then
    raise exception 'Fill in "%".', v_missing using errcode = '22023';
  end if;

  -- ---------- insert ----------
  insert into public.submissions (project_id, act_title, description, agreed_at)
  values (p_project_id, trim(p_title), trim(p_description), now())
  returning id into v_submission;

  for v_p in select * from jsonb_array_elements(p_participants) loop
    v_pos := v_pos + 1;
    insert into public.participants (submission_id, position, name)
    values (v_submission, v_pos, trim(v_p ->> 'name'))
    returning id into v_pid;
    v_email := nullif(trim(v_p ->> 'email'), '');
    if v_email is not null then
      insert into public.participant_emails (participant_id, email) values (v_pid, v_email);
    end if;
  end loop;

  -- Type and choice checks are done by the submission_answers trigger.
  for v_a in select * from jsonb_array_elements(p_answers) loop
    insert into public.submission_answers
      (submission_id, field_id, value_text, value_number, value_bool, value_date)
    values (v_submission, (v_a ->> 'field_id')::uuid,
            nullif(trim(v_a ->> 'value_text'), ''),
            (v_a ->> 'value_number')::numeric,
            (v_a ->> 'value_bool')::boolean,
            (v_a ->> 'value_date')::date);
  end loop;

  if v_kind is not null then
    v_media := gen_random_uuid();
    v_key := 'originals/' || p_project_id || '/' || v_media || coalesce('.' || v_ext, '');
    insert into public.media_files
      (id, submission_id, kind, original_key, original_mime, original_size_bytes, duration_seconds)
    values (v_media, v_submission, v_kind, v_key,
            coalesce(nullif(p_file ->> 'mime', ''), 'application/octet-stream'),
            (p_file ->> 'size_bytes')::bigint,
            (p_file ->> 'duration_seconds')::int);
    -- Waits for the browser to finish uploading (the upload Edge Function's "complete").
    insert into public.processing_jobs (media_file_id) values (v_media)
    returning id into v_job;
  end if;

  return query select v_submission, v_media, v_job, v_key;
end;
$$;

revoke execute on function public.create_submission(uuid, text, text, boolean, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_submission(uuid, text, text, boolean, jsonb, jsonb, jsonb)
  to service_role;
