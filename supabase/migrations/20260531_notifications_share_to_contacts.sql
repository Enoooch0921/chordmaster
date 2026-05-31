-- In-app notifications + direct sharing to previously-shared contacts.
--
-- Lets an owner/editor grant a known contact (someone who has joined any of the
-- libraries the owner can write) instant access to a setlist or project, and
-- drops an in-app notification into that recipient's inbox. The recipient does
-- not need to open a share link first -- the membership row is created server
-- side, so existing RLS (has_setlist_membership / has_project_membership) grants
-- read access immediately.

-- 1) Notifications inbox. Insert happens only via the SECURITY DEFINER RPC
--    below; recipients can read / mark-read / delete their own rows.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('resource_shared')),
  resource_type text not null check (resource_type in ('setlist', 'project')),
  resource_id text not null,
  resource_name text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_self_select" on public.notifications;
create policy "notifications_self_select" on public.notifications
  for select using (recipient_user_id = auth.uid());

drop policy if exists "notifications_self_update" on public.notifications;
create policy "notifications_self_update" on public.notifications
  for update using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

drop policy if exists "notifications_self_delete" on public.notifications;
create policy "notifications_self_delete" on public.notifications
  for delete using (recipient_user_id = auth.uid());

-- 2) Contacts = distinct users who have joined any setlist or project living in
--    a library the caller can write. This is the "people I've shared with
--    before" list, excluding the caller.
create or replace function public.get_share_contacts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with setlist_contacts as (
    select distinct usm.user_id
    from public.user_setlist_memberships usm
    join public.setlists sl on sl.id = usm.setlist_id
    where public.can_write_library(sl.library_id)
      and usm.user_id <> auth.uid()
  ),
  project_contacts as (
    select distinct upm.user_id
    from public.user_project_memberships upm
    join public.projects p on p.id = upm.project_id
    where public.can_write_library(p.library_id)
      and upm.user_id <> auth.uid()
  ),
  contacts as (
    select user_id from setlist_contacts
    union
    select user_id from project_contacts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', c.user_id,
        'email', coalesce(pr.email, ''),
        'name', coalesce(pr.display_name, pr.email, ''),
        'picture', pr.avatar_url
      )
      order by coalesce(pr.display_name, pr.email, '')
    ),
    '[]'::jsonb
  )
  from contacts c
  left join public.profiles pr on pr.id = c.user_id;
$$;

grant execute on function public.get_share_contacts() to authenticated;

-- 3) Grant the given users access to a setlist/project and notify them.
--    Returns the number of users notified. A notification is inserted on every
--    call (even if the membership already existed) so re-sharing re-pings them.
create or replace function public.share_to_contacts(
  p_resource_type text,
  p_resource_id text,
  p_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_resource_name text;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_user uuid;
begin
  if p_resource_type = 'setlist' then
    select library_id, name into v_library_id, v_resource_name
    from public.setlists where id = p_resource_id;
  elsif p_resource_type = 'project' then
    select library_id, name into v_library_id, v_resource_name
    from public.projects where id = p_resource_id;
  else
    raise exception 'Invalid resource type';
  end if;

  if v_library_id is null then
    raise exception 'Resource not found';
  end if;

  if not public.can_write_library(v_library_id) then
    raise exception 'Access denied';
  end if;

  foreach v_user in array coalesce(p_user_ids, '{}'::uuid[]) loop
    if v_user is null or v_user = v_actor then
      continue;
    end if;

    if p_resource_type = 'setlist' then
      insert into public.user_setlist_memberships (user_id, setlist_id, token_used)
      values (v_user, p_resource_id, null)
      on conflict (user_id, setlist_id) do nothing;
    else
      insert into public.user_project_memberships (user_id, project_id, token_used)
      values (v_user, p_resource_id, null)
      on conflict (user_id, project_id) do nothing;
    end if;

    insert into public.notifications (
      recipient_user_id, actor_user_id, type, resource_type, resource_id, resource_name
    )
    values (
      v_user, v_actor, 'resource_shared', p_resource_type, p_resource_id, coalesce(v_resource_name, '')
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.share_to_contacts(text, text, uuid[]) to authenticated;

-- 4) Enriched inbox read for the current user (joins actor profile).
create or replace function public.get_notifications()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'type', n.type,
        'resourceType', n.resource_type,
        'resourceId', n.resource_id,
        'resourceName', n.resource_name,
        'actorName', coalesce(pr.display_name, pr.email, ''),
        'actorEmail', coalesce(pr.email, ''),
        'actorPicture', pr.avatar_url,
        'createdAt', n.created_at,
        'readAt', n.read_at
      )
      order by n.created_at desc
    ),
    '[]'::jsonb
  )
  from public.notifications n
  left join public.profiles pr on pr.id = n.actor_user_id
  where n.recipient_user_id = auth.uid();
$$;

grant execute on function public.get_notifications() to authenticated;

-- 5) Mark a set of the caller's notifications as read.
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where recipient_user_id = auth.uid()
    and read_at is null
    and id = any(coalesce(p_ids, '{}'::uuid[]));
$$;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
