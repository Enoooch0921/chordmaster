-- Team libraries, email-bound invites, and role-aware setlist permissions.

alter table public.library_members drop constraint if exists library_members_role_check;
alter table public.library_members
  add constraint library_members_role_check
  check (role in ('owner', 'editor', 'setlist_manager', 'viewer'));

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries(id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'setlist_manager', 'viewer')),
  token text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_invites_library_id_idx
  on public.team_invites(library_id);

create index if not exists team_invites_token_idx
  on public.team_invites(token);

create index if not exists team_invites_email_idx
  on public.team_invites((lower(email)));

alter table public.team_invites enable row level security;

create or replace function public.user_library_role(target_library_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lm.role
  from public.library_members lm
  where lm.library_id = target_library_id
    and lm.user_id = auth.uid()
  limit 1
$$;

create or replace function public.can_read_library(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
  )
$$;

create or replace function public.can_edit_library_content(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
      and lm.role in ('owner', 'editor')
  )
$$;

create or replace function public.can_create_setlist(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
      and lm.role in ('owner', 'editor', 'setlist_manager')
  )
$$;

create or replace function public.can_manage_library_members(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.libraries l
    where l.id = target_library_id
      and l.owner_user_id = auth.uid()
  ) or exists (
    select 1
    from public.library_members lm
    where lm.library_id = target_library_id
      and lm.user_id = auth.uid()
      and lm.role = 'owner'
  )
$$;

create or replace function public.can_write_setlist(target_setlist_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.setlists s
    join public.library_members lm on lm.library_id = s.library_id
    where s.id = target_setlist_id
      and lm.user_id = auth.uid()
      and (
        lm.role in ('owner', 'editor')
        or (lm.role = 'setlist_manager' and s.created_by = auth.uid())
      )
  )
$$;

-- Keep the old helper name for existing code/functions, but narrow it to full content editors.
create or replace function public.can_write_library(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_library_content(target_library_id)
$$;

create or replace function public.is_library_owner(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.libraries l
    where l.id = target_library_id
      and l.owner_user_id = auth.uid()
  ) or public.can_manage_library_members(target_library_id)
$$;

drop policy if exists "libraries_member_select" on public.libraries;
create policy "libraries_member_select" on public.libraries
for select using (owner_user_id = auth.uid() or public.can_read_library(id));

drop policy if exists "libraries_owner_write" on public.libraries;
create policy "libraries_owner_write" on public.libraries
for all using (public.can_manage_library_members(id)) with check (owner_user_id = auth.uid());

drop policy if exists "library_members_member_select" on public.library_members;
create policy "library_members_member_select" on public.library_members
for select using (public.can_read_library(library_id));

drop policy if exists "library_members_owner_write" on public.library_members;
create policy "library_members_owner_write" on public.library_members
for all using (public.is_library_owner(library_id)) with check (public.is_library_owner(library_id));

drop policy if exists "songs_member_select" on public.songs;
create policy "songs_member_select" on public.songs
for select using (public.can_read_library(library_id));

drop policy if exists "songs_editor_write" on public.songs;
create policy "songs_editor_write" on public.songs
for all using (public.can_edit_library_content(library_id)) with check (public.can_edit_library_content(library_id));

drop policy if exists "setlists_member_select" on public.setlists;
create policy "setlists_member_select" on public.setlists
for select using (public.can_read_library(library_id));

drop policy if exists "setlists_editor_write" on public.setlists;
drop policy if exists "setlists_insert_by_role" on public.setlists;
create policy "setlists_insert_by_role" on public.setlists
for insert with check (
  public.can_create_setlist(library_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "setlists_update_by_role" on public.setlists;
create policy "setlists_update_by_role" on public.setlists
for update using (public.can_write_setlist(id)) with check (
  exists (
    select 1
    from public.library_members lm
    where lm.library_id = setlists.library_id
      and lm.user_id = auth.uid()
      and (
        lm.role in ('owner', 'editor')
        or (lm.role = 'setlist_manager' and setlists.created_by = auth.uid())
      )
  )
);

drop policy if exists "setlists_delete_by_role" on public.setlists;
create policy "setlists_delete_by_role" on public.setlists
for delete using (public.can_write_setlist(id));

drop policy if exists "setlist_songs_member_select" on public.setlist_songs;
create policy "setlist_songs_member_select" on public.setlist_songs
for select using (
  exists (
    select 1
    from public.setlists s
    where s.id = setlist_id
      and public.can_read_library(s.library_id)
  )
);

drop policy if exists "setlist_songs_editor_write" on public.setlist_songs;
create policy "setlist_songs_editor_write" on public.setlist_songs
for all using (public.can_write_setlist(setlist_id)) with check (public.can_write_setlist(setlist_id));

drop policy if exists "team_invites_owner_select" on public.team_invites;
create policy "team_invites_owner_select" on public.team_invites
for select using (public.can_manage_library_members(library_id));

drop policy if exists "team_invites_owner_write" on public.team_invites;
create policy "team_invites_owner_write" on public.team_invites
for all using (public.can_manage_library_members(library_id)) with check (public.can_manage_library_members(library_id));

create or replace function public.get_user_libraries()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'kind', l.kind,
        'ownerUserId', l.owner_user_id,
        'role', lm.role,
        'createdAt', l.created_at,
        'updatedAt', l.updated_at
      )
      order by case when l.kind = 'personal' then 0 else 1 end, l.created_at asc
    ),
    '[]'::jsonb
  )
  from public.library_members lm
  join public.libraries l on l.id = lm.library_id
  where lm.user_id = auth.uid()
$$;

grant execute on function public.get_user_libraries() to authenticated;

create or replace function public.create_team(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text := gen_random_uuid()::text;
  v_name text := nullif(trim(p_name), '');
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.libraries (id, name, kind, owner_user_id)
  values (v_library_id, coalesce(v_name, 'Team Library'), 'team', auth.uid());

  insert into public.library_members (library_id, user_id, role)
  values (v_library_id, auth.uid(), 'owner');

  return jsonb_build_object(
    'id', v_library_id,
    'name', coalesce(v_name, 'Team Library'),
    'kind', 'team',
    'ownerUserId', auth.uid(),
    'role', 'owner',
    'createdAt', now(),
    'updatedAt', now()
  );
end;
$$;

grant execute on function public.create_team(text) to authenticated;

create or replace function public.create_team_invite(p_library_id text, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_role text := p_role;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_invite public.team_invites;
begin
  if not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid invite email is required';
  end if;

  if v_role not in ('editor', 'setlist_manager', 'viewer') then
    raise exception 'Invalid role';
  end if;

  update public.team_invites
  set revoked_at = now()
  where library_id = p_library_id
    and lower(email) = v_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.team_invites (library_id, email, role, token, invited_by, expires_at)
  values (p_library_id, v_email, v_role, v_token, auth.uid(), now() + interval '30 days')
  returning * into v_invite;

  return jsonb_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'role', v_invite.role,
    'token', v_invite.token,
    'invitedBy', v_invite.invited_by,
    'invitedAt', v_invite.created_at,
    'expiresAt', v_invite.expires_at,
    'acceptedAt', v_invite.accepted_at,
    'revokedAt', v_invite.revoked_at
  );
end;
$$;

grant execute on function public.create_team_invite(text, text, text) to authenticated;

create or replace function public.accept_team_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid();

  select * into v_invite
  from public.team_invites
  where token = p_token
    and accepted_at is null
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_invite.id is null then
    raise exception 'Invalid or expired invite';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'This invite is for %, but you are signed in as %', v_invite.email, v_email;
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (v_invite.library_id, auth.uid(), v_invite.role)
  on conflict (library_id, user_id) do update
  set role = excluded.role;

  update public.team_invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.library_id;
end;
$$;

grant execute on function public.accept_team_invite(text) to authenticated;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
begin
  select library_id into v_library_id
  from public.team_invites
  where id = p_invite_id;

  if v_library_id is null then
    raise exception 'Invite not found';
  end if;

  if not public.can_manage_library_members(v_library_id) then
    raise exception 'Access denied';
  end if;

  update public.team_invites
  set revoked_at = now()
  where id = p_invite_id
    and accepted_at is null
    and revoked_at is null;
end;
$$;

grant execute on function public.revoke_team_invite(uuid) to authenticated;

create or replace function public.update_team_member_role(p_library_id text, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Owners cannot change their own role';
  end if;

  if p_role not in ('editor', 'setlist_manager', 'viewer') then
    raise exception 'Invalid role';
  end if;

  update public.library_members
  set role = p_role
  where library_id = p_library_id
    and user_id = p_user_id
    and role <> 'owner';
end;
$$;

grant execute on function public.update_team_member_role(text, uuid, text) to authenticated;

create or replace function public.remove_team_member(p_library_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Owners cannot remove themselves';
  end if;

  delete from public.library_members
  where library_id = p_library_id
    and user_id = p_user_id
    and role <> 'owner';
end;
$$;

grant execute on function public.remove_team_member(text, uuid) to authenticated;

create or replace function public.get_team_management(p_library_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members jsonb;
  v_invites jsonb;
begin
  if not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', lm.user_id,
        'email', coalesce(p.email, ''),
        'name', coalesce(p.display_name, p.email, ''),
        'picture', p.avatar_url,
        'role', lm.role,
        'joinedAt', lm.created_at
      )
      order by case when lm.role = 'owner' then 0 else 1 end, lm.created_at asc
    ),
    '[]'::jsonb
  )
  into v_members
  from public.library_members lm
  left join public.profiles p on p.id = lm.user_id
  where lm.library_id = p_library_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ti.id,
        'email', ti.email,
        'role', ti.role,
        'token', ti.token,
        'invitedBy', ti.invited_by,
        'invitedAt', ti.created_at,
        'expiresAt', ti.expires_at,
        'acceptedAt', ti.accepted_at,
        'revokedAt', ti.revoked_at
      )
      order by ti.created_at desc
    ),
    '[]'::jsonb
  )
  into v_invites
  from public.team_invites ti
  where ti.library_id = p_library_id
    and ti.accepted_at is null
    and ti.revoked_at is null
    and (ti.expires_at is null or ti.expires_at > now());

  return jsonb_build_object(
    'members', v_members,
    'invites', v_invites
  );
end;
$$;

grant execute on function public.get_team_management(text) to authenticated;

create or replace function public.get_setlist_share_status(p_setlist_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_token text;
  v_active_created_at timestamptz;
  v_participants jsonb;
  v_participant_count integer;
begin
  if not public.can_write_setlist(p_setlist_id) then
    raise exception 'Access denied';
  end if;

  select token, created_at into v_active_token, v_active_created_at
  from public.share_links
  where resource_type = 'setlist'
    and resource_id = p_setlist_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', usm.user_id,
          'email', coalesce(p.email, ''),
          'name', coalesce(p.display_name, p.email, ''),
          'picture', p.avatar_url,
          'joinedAt', usm.joined_at
        )
        order by usm.joined_at asc
      ),
      '[]'::jsonb
    )
  into v_participant_count, v_participants
  from public.user_setlist_memberships usm
  left join public.profiles p on p.id = usm.user_id
  where usm.setlist_id = p_setlist_id;

  return jsonb_build_object(
    'activeToken', v_active_token,
    'activeCreatedAt', v_active_created_at,
    'participantCount', coalesce(v_participant_count, 0),
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

create or replace function public.revoke_setlist_sharing(p_setlist_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_write_setlist(p_setlist_id) then
    raise exception 'Access denied';
  end if;

  update public.share_links
  set revoked_at = now()
  where resource_type = 'setlist'
    and resource_id = p_setlist_id
    and revoked_at is null;

  delete from public.user_setlist_capo_overrides ucco
  using public.setlist_songs ss
  where ucco.setlist_song_id = ss.id
    and ss.setlist_id = p_setlist_id;

  delete from public.user_setlist_memberships
  where setlist_id = p_setlist_id;
end;
$$;
