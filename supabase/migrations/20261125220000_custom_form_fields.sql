-- Flexible submission forms (see Documents/spec/submission-form.md).
-- Every project keeps the fixed core fields (title, description, participants,
-- file), with its own labels and accepted file kinds. Anything else is a
-- project-defined custom field, and answers are typed rows in
-- submission_answers, so the data stays relational and checkable.

-- ============================================================
-- Core field settings on projects
-- ============================================================

create type file_requirement as enum ('required', 'optional', 'none');

alter table projects
  add column title_label        text not null default 'Title'
    check (length(trim(title_label)) between 1 and 60),
  add column description_label  text not null default 'Description'
    check (length(trim(description_label)) between 1 and 60),
  add column participant_label  text not null default 'Participant'
    check (length(trim(participant_label)) between 1 and 60),
  add column participants_label text not null default 'Participants'
    check (length(trim(participants_label)) between 1 and 60),
  add column file_label         text not null default 'File'
    check (length(trim(file_label)) between 1 and 60),
  add column file_requirement   file_requirement not null default 'required',
  -- Which kinds of file the form accepts. Ignored when file_requirement = 'none'.
  add column accepted_kinds     media_kind[] not null default '{video,audio,image,text}'
    check (cardinality(accepted_kinds) >= 1);

-- "Stage & equipment needs" was specific to the talent show. It's now a
-- custom field. No submissions existed yet, so nothing is lost.
alter table submissions drop column stage_needs;

-- ============================================================
-- Custom fields
-- ============================================================

create type field_type as enum ('short_text', 'long_text', 'number', 'choice', 'checkbox', 'date');

create table project_fields (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  label       text not null check (length(trim(label)) between 1 and 120),
  type        field_type not null,
  required    boolean not null default false,
  position    int not null check (position >= 1),                   -- form order
  placeholder text check (length(placeholder) <= 200),
  -- choice only: the options, in order (at least 2, no blanks or repeats).
  options     text[],
  archived_at timestamptz,                                          -- not null = hidden from the form
  created_at  timestamptz not null default now(),
  -- deferrable: reorder_project_fields() swaps positions in one transaction.
  unique (project_id, position) deferrable initially immediate,
  check (case when type = 'choice'
              then options is not null and cardinality(options) >= 2
                   and array_position(options, null) is null
              else options is null end),
  check (placeholder is null or type in ('short_text', 'long_text', 'number'))
);

-- Blank or repeated options. Kept out of the table check because it needs a subquery.
create function public.check_field_options() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.options is not null and (
       exists (select 1 from unnest(new.options) o where length(trim(o)) = 0)
       or (select count(distinct o) from unnest(new.options) o) <> cardinality(new.options)
     ) then
    raise exception 'Options must be non-blank and different from each other'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_fields_check_options
  before insert or update of options on project_fields
  for each row execute function public.check_field_options();

-- ============================================================
-- Answers
-- ============================================================

-- One row per submission and field. Exactly one value column is filled: the
-- one matching the field's type (checked by the trigger below).
-- field_id has no cascade: a field with answers can't be deleted (23503),
-- only hidden. NO ACTION (checked at the end of the statement) still lets a
-- project delete cascade through both paths.
create table submission_answers (
  submission_id uuid not null references submissions(id) on delete cascade,
  field_id      uuid not null references project_fields(id),
  value_text    text check (length(trim(value_text)) > 0),
  value_number  numeric,
  value_bool    boolean,
  value_date    date,
  primary key (submission_id, field_id),
  check (num_nonnulls(value_text, value_number, value_bool, value_date) = 1)
);

-- The primary key covers submission_id; this covers the FK to project_fields
-- (used by "does this field have answers?").
create index submission_answers_field_id_idx on submission_answers (field_id);

-- The value matches the field's type, the field belongs to the submission's
-- project, and a choice answer is one of the options. This also guards the
-- submit Edge Function, which uses the service role and skips RLS.
create function public.check_submission_answer() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_field public.project_fields;
begin
  select * into v_field from public.project_fields where id = new.field_id;

  if v_field.project_id is distinct from
     (select s.project_id from public.submissions s where s.id = new.submission_id) then
    raise exception 'This field belongs to a different project' using errcode = '23514';
  end if;

  -- coalesce: a null comparison (e.g. a choice answer with no text) counts as a mismatch.
  if not coalesce(case v_field.type
           when 'short_text' then new.value_text is not null
           when 'long_text'  then new.value_text is not null
           when 'choice'     then new.value_text = any (v_field.options)
           when 'number'     then new.value_number is not null
           when 'checkbox'   then new.value_bool is not null
           when 'date'       then new.value_date is not null
         end, false) then
    raise exception 'Answer does not match the field type (%)', v_field.type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger submission_answers_check
  before insert on submission_answers
  for each row execute function public.check_submission_answer();

-- Answers are final like the rest of a submission. Deletes stay allowed so
-- deleting a project cascades.
create trigger submission_answers_final
  before update on submission_answers
  for each row execute function public.prevent_participant_edits();

-- ============================================================
-- Field changes that would break submitted answers
-- ============================================================

-- * The type never changes (add a new field instead).
-- * Once a field has answers, options can only be added to the end, so every
--   stored answer is still a valid option.
-- * project_id never changes (also blocked by the column grants below).
create function public.protect_field_definition() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'A field cannot move to another project';
  end if;

  if new.type <> old.type then
    raise exception 'A field''s type cannot change. Add a new field instead.'
      using errcode = '23514';
  end if;

  if new.options is distinct from old.options
     and exists (select 1 from public.submission_answers a where a.field_id = old.id)
     and (new.options is null
          or new.options[1:cardinality(old.options)] is distinct from old.options) then
    raise exception 'This field has answers, so options can only be added to the end'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger project_fields_protect
  before update on project_fields
  for each row execute function public.protect_field_definition();

-- Reorders a project's fields in one transaction: p_ids in the new order.
-- Must list every field of the project exactly once.
-- security invoker (default): RLS and column grants apply, so only managers
-- can do it.
create function public.reorder_project_fields(p_project_id uuid, p_ids uuid[]) returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.project_fields where project_id = p_project_id)
       <> cardinality(p_ids)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'List every field of the project exactly once';
  end if;

  set constraints public.project_fields_project_id_position_key deferred;

  update public.project_fields f
     set position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where f.id = o.id and f.project_id = p_project_id;

  if not found then
    raise exception 'Only managers can reorder fields';
  end if;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table project_fields     enable row level security;
alter table submission_answers enable row level security;

-- Field definitions hold no personal data: the whole team reads them, and the
-- public form gets them through get_public_form_fields().
create policy "members read fields" on project_fields
  for select to authenticated using (public.is_member(project_id));

create policy "managers add fields" on project_fields
  for insert to authenticated with check (public.is_manager(project_id));

create policy "managers update fields" on project_fields
  for update to authenticated
  using (public.is_manager(project_id)) with check (public.is_manager(project_id));

-- A field with answers can't be deleted (foreign key), only hidden.
create policy "managers delete fields" on project_fields
  for delete to authenticated using (public.is_manager(project_id));

-- type and project_id are never updatable from the app.
revoke update on project_fields from anon, authenticated;
grant update (label, required, position, placeholder, options, archived_at)
  on project_fields to authenticated;

-- Answers: read only. The submit Edge Function writes them.
create policy "members read answers" on submission_answers
  for select to authenticated
  using (exists (
    select 1 from public.submissions s
    where s.id = submission_answers.submission_id and public.is_member(s.project_id)
  ));

revoke insert, update, delete on submission_answers from anon, authenticated;

-- ============================================================
-- Public form
-- ============================================================

-- The return type changes, so the old function is dropped first.
drop function public.get_public_form(text);

create function public.get_public_form(p_slug text)
returns table (project_id           uuid,
               name                 text,
               agreement_text       text,
               max_participants     int,
               max_duration_seconds int,
               submissions_close_at timestamptz,
               is_open              boolean,
               organizer_email      text,
               title_label          text,
               description_label    text,
               participant_label    text,
               participants_label   text,
               file_label           text,
               file_requirement     public.file_requirement,
               accepted_kinds       public.media_kind[])
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.name, pr.agreement_text,
         pr.max_participants, pr.max_duration_seconds,
         pr.submissions_close_at, now() < pr.submissions_close_at,
         m.email::text,
         pr.title_label, pr.description_label,
         pr.participant_label, pr.participants_label,
         pr.file_label, pr.file_requirement, pr.accepted_kinds
  from public.projects pr
  left join public.project_members m
    on m.project_id = pr.id and m.role = 'owner'
  where pr.slug = p_slug;
$$;

-- The visible custom fields of a public form, in order.
create function public.get_public_form_fields(p_slug text)
returns table (id          uuid,
               label       text,
               type        public.field_type,
               required    boolean,
               placeholder text,
               options     text[])
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.label, f.type, f.required, f.placeholder, f.options
  from public.project_fields f
  join public.projects pr on pr.id = f.project_id
  where pr.slug = p_slug and f.archived_at is null
  order by f.position;
$$;
