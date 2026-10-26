-- Team administrators manage content and ordinary members without owning the library.
-- Existing owners and owner_user_id remain unchanged. Grant admin separately after deployment.
alter table public.library_members drop constraint if exists library_members_role_check;
alter table public.library_members add constraint library_members_role_check
  check (role in ('owner', 'admin', 'editor', 'setlist_manager', 'viewer'));

-- Ownership must stay distinct from delegated administration (including library RLS).


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
    join public.library_members lm
      on lm.library_id = l.id
     and lm.user_id = l.owner_user_id
     and lm.role = 'owner'
    where l.id = target_library_id
      and l.owner_user_id = auth.uid()
  )
$$;

create or replace function public.can_manage_library_members(target_library_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_library_owner(target_library_id) or exists (
    select 1 from public.library_members lm
    join public.libraries l on l.id = lm.library_id and l.kind = 'team'
    where lm.library_id = target_library_id and lm.user_id = auth.uid() and lm.role = 'admin'
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
      and lm.role in ('owner', 'admin', 'editor')
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
      and lm.role in ('owner', 'admin', 'editor', 'setlist_manager')
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
    from public.setlists sl
    join public.library_members lm
      on lm.library_id = sl.library_id
     and lm.user_id = auth.uid()
    where sl.id = target_setlist_id
      and (
        lm.role in ('owner', 'admin')
        or (
          lm.role in ('editor', 'setlist_manager')
          and (
            sl.created_by = auth.uid()
            or exists (
              select 1
              from public.setlist_editor_assignments sea
              where sea.setlist_id = sl.id
                and sea.library_id = sl.library_id
                and sea.user_id = auth.uid()
            )
          )
        )
      )
  )
$$;

create or replace function public.can_manage_setlist_assignments(target_setlist_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.setlists sl
    join public.libraries l
      on l.id = sl.library_id
     and l.kind = 'team'
    join public.library_members lm
      on lm.library_id = sl.library_id
     and lm.user_id = auth.uid()
    where sl.id = target_setlist_id
      and (
        lm.role in ('owner', 'admin')
        or (
          sl.created_by = auth.uid()
          and lm.role in ('editor', 'setlist_manager')
        )
      )
  )
$$;

create or replace function public.can_write_project(target_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.library_members lm
      on lm.library_id = p.library_id
     and lm.user_id = auth.uid()
    where p.id = target_project_id
      and (
        lm.role in ('owner', 'admin')
        or (
          lm.role in ('editor', 'setlist_manager')
          and p.created_by = auth.uid()
        )
      )
  )
$$;

create or replace function public.enforce_setlist_project_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_library_role text;
  v_project_library_id text;
begin
  if tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id then
    return new;
  end if;

  if new.project_id is not null then
    select library_id into v_project_library_id
    from public.projects
    where id = new.project_id;

    if v_project_library_id is null or v_project_library_id <> new.library_id then
      raise exception 'A setlist and its project must belong to the same library';
    end if;
  end if;

  -- PostgreSQL migrations and the trusted service role do not carry an end-user
  -- auth.uid(); ordinary REST/RPC requests always do.
  if v_user_id is null then
    return new;
  end if;

  select role into v_library_role
  from public.library_members
  where library_id = new.library_id
    and user_id = v_user_id;

  if v_library_role in ('owner', 'admin') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.project_id is not null
     and exists (select 1 from public.projects where id = old.project_id)
     and not public.can_write_project(old.project_id) then
    raise exception 'Changing this setlist requires write access to its current project';
  end if;

  if new.project_id is not null
     and not public.can_write_project(new.project_id) then
    raise exception 'Changing this setlist requires write access to its new project';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_library_member_owner_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_kind text;
begin
  select owner_user_id, kind into v_owner_user_id, v_kind
  from public.libraries
  where id = new.library_id;

  if v_owner_user_id is null then
    raise exception 'Library not found';
  end if;

  if new.role = 'owner' and new.user_id <> v_owner_user_id then
    raise exception 'Only libraries.owner_user_id may hold the owner role';
  end if;

  if new.user_id = v_owner_user_id and new.role <> 'owner' then
    raise exception 'The library owner membership must keep the owner role';
  end if;

  if new.role = 'admin' and v_kind <> 'team' then
    raise exception 'Administrators are only valid in team libraries';
  end if;

  return new;
end;
$$;

-- Serialize member administration with the library lock. Only the immutable
-- owner can grant or change admin membership; admins can manage lower roles.
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
  if (v_target_role = 'admin' or p_role = 'admin') and not public.is_library_owner(p_library_id) then
    raise exception 'Only the owner can manage administrators';
  end if;
  update public.library_members set role = p_role
  where library_id = p_library_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_team_member(p_library_id text, p_user_id uuid)
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
  if p_user_id = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  select role into v_target_role from public.library_members
  where library_id = p_library_id and user_id = p_user_id for update;
  if v_target_role is null then raise exception 'Team member not found'; end if;
  if v_target_role = 'owner' then raise exception 'The owner cannot be removed'; end if;
  if v_target_role = 'admin' and not public.is_library_owner(p_library_id) then
    raise exception 'Only the owner can manage administrators';
  end if;
  delete from public.library_members where library_id = p_library_id and user_id = p_user_id;
end;
$$;

-- The UI has always used invite RPCs. Remove the older direct table write
-- policy, which would otherwise bypass recipient and role checks.
drop policy if exists "team_invites_owner_write" on public.team_invites;
revoke insert, update, delete on public.team_invites from authenticated, anon;

-- An invitation without an explicit role follows the UI's view-only default.
create or replace function public.create_team_invite(p_library_id text, p_email text)
returns jsonb language sql security definer set search_path = public
as $$ select public.create_team_invite(p_library_id, p_email, 'viewer') $$;

-- An old invitation must never overwrite a role granted after it was issued.
create or replace function public.accept_team_invite(p_token text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.team_invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_invite from public.team_invites
  where token = p_token and accepted_at is null and revoked_at is null
    and (expires_at is null or expires_at > now()) for update;
  if v_invite.id is null then raise exception 'Invalid or expired invite'; end if;
  if v_email is null or lower(v_invite.email) is distinct from v_email then
    raise exception 'This invitation belongs to a different account';
  end if;
  insert into public.library_members (library_id, user_id, role)
  values (v_invite.library_id, auth.uid(), v_invite.role)
  on conflict (library_id, user_id) do nothing;
  update public.team_invites set accepted_at = now() where id = v_invite.id;
  delete from public.notifications
  where recipient_user_id = auth.uid() and type = 'team_invite'
    and resource_type = 'team' and resource_id = v_invite.id::text;
  return v_invite.library_id;
end;
$$;

-- A setlist manager arranges the program and shared Key, never the underlying
-- score or section order. Preserve the stored score on UPDATE: ordinary clients
-- send normalized songData on upsert, so comparing client JSON to the raw stored
-- snapshot would wrongly reject legitimate Key/order saves.
create or replace function public.enforce_setlist_manager_arrangement()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_library_id text;
  v_kind text;
  v_role text;
  v_song public.songs;
  v_existing public.setlist_songs;
  v_copy public.setlist_songs;
  v_protected jsonb;
  v_key jsonb;
  v_sections jsonb;
  v_existing_insert boolean := false;
begin
  if auth.uid() is null then
    new.override_json := new.override_json - 'sourceSetlistSongId' - 'expectedTeamRole';
    return new;
  end if;
  select sl.library_id, l.kind, lm.role into v_library_id, v_kind, v_role
  from public.setlists sl
  join public.libraries l on l.id = sl.library_id
  join public.library_members lm on lm.library_id = sl.library_id and lm.user_id = auth.uid()
  where sl.id = case when tg_op = 'UPDATE' then old.setlist_id else new.setlist_id end;
  if v_kind is distinct from 'team' or v_role is distinct from 'setlist_manager' then
    new.override_json := new.override_json - 'sourceSetlistSongId' - 'expectedTeamRole';
    return new;
  end if;
  if new.override_json ->> 'expectedTeamRole' is distinct from 'setlist_manager' then
    raise exception 'Your team role changed. Reload permissions before saving; your changes remain in the local draft.';
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
      or new.setlist_id is distinct from old.setlist_id or new.song_id is distinct from old.song_id) then
    raise exception 'Setlist managers cannot change an existing entry identity';
  end if;
  v_key := new.override_json -> 'overrideKey';
  if v_key is not null and v_key <> 'null'::jsonb and
      (jsonb_typeof(v_key) <> 'string' or (new.override_json ->> 'overrideKey') !~ '^[A-G](#|b)?$') then
    raise exception 'Invalid shared Key';
  end if;
  if tg_op = 'UPDATE' then
    v_protected := old.override_json;
  else
    -- PostgreSQL runs BEFORE INSERT before ON CONFLICT UPDATE. A repeated save
    -- of a copied row must work even after its original source entry is removed.
    select * into v_existing from public.setlist_songs where id = new.id for update;
    if found then
      v_existing_insert := true;
      if v_existing.setlist_id <> new.setlist_id or v_existing.song_id <> new.song_id then
        raise exception 'Setlist managers cannot reuse another entry identity';
      end if;
      v_protected := v_existing.override_json;
    elsif new.override_json ? 'sourceSetlistSongId' then
      select ss.* into v_copy from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = new.override_json ->> 'sourceSetlistSongId'
        and sl.library_id = v_library_id and ss.song_id = new.song_id;
      if not found then raise exception 'Invalid setlist copy source'; end if;
      v_protected := v_copy.override_json;
    else
      select * into v_song from public.songs
      where id = new.song_id and library_id = v_library_id and archived_at is null;
      if not found then raise exception 'An active song from this team is required'; end if;
      select coalesce(jsonb_agg(section -> 'id' order by position), '[]'::jsonb) into v_sections
      from jsonb_array_elements(coalesce(v_song.content_json -> 'sections', '[]'::jsonb))
        with ordinality as sections(section, position)
      where jsonb_typeof(section -> 'id') = 'string';
      v_protected := jsonb_build_object('songData', v_song.content_json, 'sectionOrder', v_sections);
    end if;
  end if;
  new.override_json := coalesce(v_protected, '{}'::jsonb) - 'overrideKey' - 'sourceSetlistSongId' - 'expectedTeamRole';
  if v_key is not null and v_key <> 'null'::jsonb then
    new.override_json := new.override_json || jsonb_build_object('overrideKey', v_key);
  end if;
  -- BEFORE INSERT also runs for UPSERT. Keep the assertion in EXCLUDED until
  -- BEFORE UPDATE consumes it. The locked existing row cannot disappear and
  -- turn this path into a fresh INSERT that would persist the transient marker.
  if v_existing_insert then
    new.override_json := new.override_json || jsonb_build_object('expectedTeamRole', 'setlist_manager');
  end if;
  return new;
end;
$$;

drop trigger if exists setlist_songs_manager_arrangement on public.setlist_songs;
create trigger setlist_songs_manager_arrangement
before insert or update on public.setlist_songs
for each row execute function public.enforce_setlist_manager_arrangement();

-- Keep the established authenticated API surface; the new routine is trigger-only.
revoke all on function public.enforce_setlist_manager_arrangement() from public, anon, authenticated;
revoke all on function public.enforce_library_member_owner_invariant() from public, anon, authenticated;
revoke all on function public.enforce_setlist_project_scope() from public, anon, authenticated;
revoke all on function public.is_library_owner(text) from public, anon;
revoke all on function public.can_manage_library_members(text) from public, anon;
revoke all on function public.can_edit_library_content(text) from public, anon;
revoke all on function public.can_create_setlist(text) from public, anon;
revoke all on function public.can_write_setlist(text) from public, anon;
revoke all on function public.can_manage_setlist_assignments(text) from public, anon;
revoke all on function public.can_write_project(text) from public, anon;
revoke all on function public.update_team_member_role(text, uuid, text) from public, anon;
revoke all on function public.remove_team_member(text, uuid) from public, anon;
revoke all on function public.accept_team_invite(text) from public, anon;
revoke all on function public.create_team_invite(text, text) from public, anon;
grant execute on function public.is_library_owner(text) to authenticated;
grant execute on function public.can_manage_library_members(text) to authenticated;
grant execute on function public.can_edit_library_content(text) to authenticated;
grant execute on function public.can_create_setlist(text) to authenticated;
grant execute on function public.can_write_setlist(text) to authenticated;
grant execute on function public.can_manage_setlist_assignments(text) to authenticated;
grant execute on function public.can_write_project(text) to authenticated;
grant execute on function public.update_team_member_role(text, uuid, text) to authenticated;
grant execute on function public.remove_team_member(text, uuid) to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;
grant execute on function public.create_team_invite(text, text) to authenticated;

-- These checked RPCs only accept a Key or entry order. They supply the
-- arrangement assertion themselves, including users who also belong to the team.

create or replace function public.set_project_setlist_song_key(p_setlist_song_id text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
  v_setlist_id text;
begin
  select sl.project_id, sl.id into v_project_id, v_setlist_id
  from public.setlist_songs ss
  join public.setlists sl on sl.id = ss.setlist_id
  where ss.id = p_setlist_song_id;

  if v_project_id is null then
    raise exception 'Setlist song is not part of a project';
  end if;

  if not public.has_project_manager_role(v_project_id) then
    raise exception 'Access denied';
  end if;

  if p_key is null then
    update public.setlist_songs
    set override_json = (coalesce(override_json, '{}'::jsonb) - 'overrideKey')
      || jsonb_build_object('expectedTeamRole', 'setlist_manager')
    where id = p_setlist_song_id;
  else
    update public.setlist_songs
    set override_json = jsonb_set(coalesce(override_json, '{}'::jsonb), '{overrideKey}', to_jsonb(p_key), true)
      || jsonb_build_object('expectedTeamRole', 'setlist_manager')
    where id = p_setlist_song_id;
  end if;

  update public.setlists set updated_at = now() where id = v_setlist_id;
end;
$$;

create or replace function public.reorder_project_setlist(p_setlist_id text, p_song_ids jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
  v_id text;
  v_idx integer := 0;
begin
  select project_id into v_project_id
  from public.setlists
  where id = p_setlist_id;

  if v_project_id is null then
    raise exception 'Setlist is not part of a project';
  end if;

  if not public.has_project_manager_role(v_project_id) then
    raise exception 'Access denied';
  end if;

  for v_id in select jsonb_array_elements_text(p_song_ids)
  loop
    update public.setlist_songs
    set order_index = v_idx,
        override_json = coalesce(override_json, '{}'::jsonb)
          || jsonb_build_object('expectedTeamRole', 'setlist_manager')
    where id = v_id and setlist_id = p_setlist_id;
    v_idx := v_idx + 1;
  end loop;

  update public.setlists set updated_at = now() where id = p_setlist_id;
end;
$$;

revoke all on function public.set_project_setlist_song_key(text, text) from public, anon;
revoke all on function public.reorder_project_setlist(text, jsonb) from public, anon;
grant execute on function public.set_project_setlist_song_key(text, text) to authenticated;
grant execute on function public.reorder_project_setlist(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
