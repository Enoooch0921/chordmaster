-- Owners and team admins may promote existing regular members to admin.
-- Existing admins remain owner-managed; ownership, self-role and invitation
-- protections are unchanged. This migration changes no member roles.
create or replace function public.update_team_member_role(p_library_id text, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_kind text;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select kind into v_kind from public.libraries where id = p_library_id for update;
  if v_kind is distinct from 'team' or not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role is null or p_role not in ('admin', 'editor', 'setlist_manager', 'viewer') then
    raise exception 'Invalid role';
  end if;
  select role into v_target_role from public.library_members
  where library_id = p_library_id and user_id = p_user_id for update;
  if v_target_role is null then raise exception 'Team member not found'; end if;
  if v_target_role = 'owner' then raise exception 'The owner role cannot be changed'; end if;
  if v_target_role = 'admin' and not public.is_library_owner(p_library_id) then
    raise exception 'Only the owner can manage administrators';
  end if;
  update public.library_members set role = p_role
  where library_id = p_library_id and user_id = p_user_id;
end;
$$;

revoke all on function public.update_team_member_role(text,uuid,text) from public, anon;
grant execute on function public.update_team_member_role(text,uuid,text) to authenticated;
