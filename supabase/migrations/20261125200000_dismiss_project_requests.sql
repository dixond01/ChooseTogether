-- Requesters can remove a denied request from their Projects page.
-- The row is kept (site admins still see it in their history); it's only
-- hidden from the requester. See Documents/spec/roles-and-auth.md.

alter table project_requests add column dismissed_at timestamptz;

-- Only the requester, only their own denied request. Pending requests can't be
-- hidden (they'd still block a new request), and approved ones become projects.
-- security definer: requesters have no update rights on project_requests.
create function public.dismiss_project_request(p_request_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.project_requests
     set dismissed_at = now()
   where id = p_request_id
     and user_id = auth.uid()
     and status = 'denied'
     and dismissed_at is null;
  if not found then
    raise exception 'Only your own denied requests can be removed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.dismiss_project_request(uuid) from public, anon;
grant execute on function public.dismiss_project_request(uuid) to authenticated;
