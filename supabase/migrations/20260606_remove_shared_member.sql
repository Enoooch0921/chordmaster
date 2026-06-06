-- Allow a project/setlist owner (or library editor) to remove a specific
-- member from a shared resource. RLS on the membership tables only permits a
-- user to delete their OWN row, so removing someone else requires a
-- security-definer RPC that re-checks the caller's write access via
-- can_write_library() before deleting the target user's membership row.

create or replace function public.remove_shared_member(
  p_resource_type text,
  p_resource_id text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
begin
  if p_resource_type = 'setlist' then
    select library_id into v_library_id from public.setlists where id = p_resource_id;
  elsif p_resource_type = 'project' then
    select library_id into v_library_id from public.projects where id = p_resource_id;
  else
    raise exception 'Invalid resource type';
  end if;

  if v_library_id is null then
    raise exception 'Resource not found';
  end if;

  if not public.can_write_library(v_library_id) then
    raise exception 'Access denied';
  end if;

  if p_resource_type = 'setlist' then
    delete from public.user_setlist_memberships
    where setlist_id = p_resource_id and user_id = p_user_id;
  else
    delete from public.user_project_memberships
    where project_id = p_resource_id and user_id = p_user_id;
  end if;
end;
$$;

grant execute on function public.remove_shared_member(text, text, uuid) to authenticated;
