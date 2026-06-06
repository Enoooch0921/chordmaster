-- Notify members when an owner/editor changes their role or removes them from a
-- shared project/setlist. Notifications are inserted inside the existing
-- SECURITY DEFINER RPCs (which already verify can_write_library), and survive
-- the membership deletion because the notifications table is keyed only by
-- recipient (RLS lets the recipient read their own rows regardless of access).

-- 1) Allow the new notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('resource_shared', 'member_promoted', 'member_demoted', 'access_removed'));

-- 2) Role change now notifies the affected member (project-only).
create or replace function public.set_project_member_role(p_project_id text, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_project_name text;
begin
  if p_role not in ('viewer', 'manager') then
    raise exception 'Invalid role';
  end if;

  select library_id, name into v_library_id, v_project_name
  from public.projects
  where id = p_project_id;

  if v_library_id is null then
    raise exception 'Project not found';
  end if;

  if not public.can_write_library(v_library_id) then
    raise exception 'Access denied';
  end if;

  update public.user_project_memberships
  set role = p_role
  where project_id = p_project_id
    and user_id = p_user_id;

  -- Only notify when an actual membership row changed, and never self-notify.
  if found and p_user_id <> auth.uid() then
    insert into public.notifications (
      recipient_user_id, actor_user_id, type, resource_type, resource_id, resource_name
    )
    values (
      p_user_id, auth.uid(),
      case when p_role = 'manager' then 'member_promoted' else 'member_demoted' end,
      'project', p_project_id, coalesce(v_project_name, '')
    );
  end if;
end;
$$;

grant execute on function public.set_project_member_role(text, uuid, text) to authenticated;

-- 3) Removal now notifies the removed member (setlist or project).
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
  v_resource_name text;
begin
  if p_resource_type = 'setlist' then
    select library_id, name into v_library_id, v_resource_name from public.setlists where id = p_resource_id;
  elsif p_resource_type = 'project' then
    select library_id, name into v_library_id, v_resource_name from public.projects where id = p_resource_id;
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

  -- Only notify when a membership row was actually removed, and never self-notify.
  if found and p_user_id <> auth.uid() then
    insert into public.notifications (
      recipient_user_id, actor_user_id, type, resource_type, resource_id, resource_name
    )
    values (
      p_user_id, auth.uid(), 'access_removed', p_resource_type, p_resource_id, coalesce(v_resource_name, '')
    );
  end if;
end;
$$;

grant execute on function public.remove_shared_member(text, text, uuid) to authenticated;
