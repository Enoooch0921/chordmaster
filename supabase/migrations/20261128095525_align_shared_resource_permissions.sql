-- A joined setlist remains readable after it is archived. Its shared
-- membership no longer authorizes any changes to the performance arrangement.
create or replace function chordmaster_private.can_arrange_shared_setlist(p_setlist_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.setlists sl
    where sl.id = p_setlist_id and not coalesce(sl.archived, false)
      and (
        public.has_project_manager_role(sl.project_id)
        or exists (
          select 1 from public.user_setlist_memberships sm
          where sm.setlist_id = sl.id and sm.user_id = auth.uid() and sm.role = 'manager'
        )
      )
  );
$$;

create or replace function public.get_joined_setlists()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sl.id,
        'role', coalesce(usm.role, 'viewer'),
        'name', sl.name,
        'archived', coalesce(sl.archived, false),
        'displayMode', sl.display_mode,
        'showLyrics', sl.show_lyrics,
        'createdAt', sl.created_at,
        'updatedAt', sl.updated_at,
        'songs', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ss.id,
              'setlistId', ss.setlist_id,
              'songId', ss.song_id,
              'order', ss.order_index,
              'overrideKey', ss.override_json ->> 'overrideKey',
              'capo',
                case
                  when ucco.capo is not null then ucco.capo
                  when jsonb_typeof(ss.override_json -> 'capo') = 'number'
                    then (ss.override_json ->> 'capo')::integer
                  else null
                end,
              'sectionOrder', coalesce(ss.override_json -> 'sectionOrder', '[]'::jsonb),
              'songData', coalesce(ss.override_json -> 'songData', s.content_json),
              'sourceArchivedAt', s.archived_at
            )
            order by ss.order_index asc
          )
          from public.setlist_songs ss
          left join public.songs s on s.id = ss.song_id
          left join public.user_setlist_capo_overrides ucco
            on ucco.setlist_song_id = ss.id
           and ucco.user_id = auth.uid()
          where ss.setlist_id = sl.id
        ), '[]'::jsonb)
      )
      order by usm.joined_at asc
    ),
    '[]'::jsonb
  )
  from public.user_setlist_memberships usm
  join public.setlists sl on sl.id = usm.setlist_id
  where usm.user_id = auth.uid()
$$;

-- Acquire the entry-update lock before the parent in every shared writer.
create or replace function public.set_project_setlist_song_key(p_setlist_song_id text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_setlist text;
begin
  perform pg_advisory_xact_lock(hashtextextended('chordmaster:song-reference-graph:v1', 0));
  select sl.id into target_setlist
  from public.setlists sl join public.setlist_songs ss on ss.setlist_id = sl.id
  where ss.id = p_setlist_song_id for update of sl, ss;
  if not chordmaster_private.can_arrange_shared_setlist(target_setlist) then
    raise exception 'Access denied';
  end if;
  if p_key is not null and p_key !~ '^[A-G](#|b)?$' then raise exception 'Invalid shared Key'; end if;
  update public.setlist_songs
  set override_json = (coalesce(override_json, '{}'::jsonb) - 'overrideKey')
    || jsonb_strip_nulls(jsonb_build_object('overrideKey', p_key, 'expectedTeamRole', 'setlist_manager'))
  where id = p_setlist_song_id and setlist_id = target_setlist;
  update public.setlists set updated_at = now() where id = target_setlist;
end;
$$;

create or replace function public.reorder_workspace_setlist(p_id text,p_expected jsonb,p_order jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare parent public.setlists; actual jsonb; role text;
begin
  if jsonb_typeof(p_expected) is distinct from 'array' or jsonb_typeof(p_order) is distinct from 'array' then raise exception 'Invalid order'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chordmaster:song-reference-graph:v1', 0));
  select * into parent from public.setlists where id=p_id for update;
  if parent.id is null or auth.uid() is null or not (public.can_write_setlist(p_id) or chordmaster_private.can_arrange_shared_setlist(p_id)) then raise exception 'Access denied'; end if;
  select coalesce(jsonb_agg(id order by order_index,id),'[]'::jsonb) into actual from public.setlist_songs where setlist_id=p_id;
  if actual is distinct from p_expected or jsonb_array_length(p_order)<>jsonb_array_length(actual)
    or (select count(distinct value) from jsonb_array_elements_text(p_order))<>jsonb_array_length(actual)
    or exists(select value from jsonb_array_elements_text(p_order) except select value from jsonb_array_elements_text(actual)) then raise exception 'History conflict: setlist order changed'; end if;
  if public.can_write_setlist(p_id) then
    select lm.role into role from public.library_members lm where library_id=parent.library_id and user_id=auth.uid();
  else
    role := 'setlist_manager';
  end if;
  update public.setlist_songs e set order_index=ordered.idx::integer-1,
    override_json=coalesce(e.override_json,'{}')||jsonb_build_object('expectedTeamRole',role)
    from jsonb_array_elements_text(p_order) with ordinality ordered(id,idx) where e.id=ordered.id and e.setlist_id=p_id;
  update public.setlists set updated_at=now(),updated_by=auth.uid() where id=p_id;
end; $$;

-- Older clients use this project-only RPC. Lock the same active parent
-- before changing its rows so archiving cannot race a shared reorder.
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
  perform pg_advisory_xact_lock(hashtextextended('chordmaster:song-reference-graph:v1', 0));
  select project_id into v_project_id
  from public.setlists
  where id = p_setlist_id and not coalesce(archived, false)
  for update;

  if not found then
    raise exception 'Access denied';
  end if;

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

-- Project invite sharing is distinct from managing the participant list.
-- Match the membership controls, which require project and library write rights.
create function chordmaster_private.can_manage_project_participants(p_project_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.can_write_project(p_project_id) and exists (
    select 1 from public.projects p
    where p.id = p_project_id and public.can_edit_library_content(p.library_id)
  );
$$;
revoke all on function chordmaster_private.can_manage_project_participants(text) from public, anon, authenticated;

create or replace function public.get_project_share_status(p_project_id text)
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
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;
  if not chordmaster_private.can_manage_project_participants(p_project_id) then
    raise exception 'Access denied';
  end if;

  select token, created_at into v_active_token, v_active_created_at
  from public.share_links
  where resource_type = 'project'
    and resource_id = p_project_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', upm.user_id,
          'email', coalesce(profile.email, ''),
          'name', coalesce(profile.display_name, profile.email, ''),
          'picture', profile.avatar_url,
          'role', upm.role,
          'joinedAt', upm.joined_at
        ) order by upm.joined_at
      ),
      '[]'::jsonb
    )
  into v_participant_count, v_participants
  from public.user_project_memberships upm
  left join public.profiles profile on profile.id = upm.user_id
  where upm.project_id = p_project_id;

  return jsonb_build_object(
    'activeToken', v_active_token,
    'activeCreatedAt', v_active_created_at,
    'participantCount', coalesce(v_participant_count, 0),
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_project_member_role(
  p_project_id text,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text;
begin
  if p_role not in ('viewer', 'manager') then
    raise exception 'Invalid role';
  end if;

  select name into v_project_name
  from public.projects
  where id = p_project_id;

  if v_project_name is null then
    raise exception 'Project not found';
  end if;
  if not chordmaster_private.can_manage_project_participants(p_project_id) then
    raise exception 'Access denied';
  end if;

  update public.user_project_memberships
  set role = p_role
  where project_id = p_project_id
    and user_id = p_user_id;

  if found and p_user_id <> auth.uid() then
    insert into public.notifications (
      recipient_user_id,
      actor_user_id,
      type,
      resource_type,
      resource_id,
      resource_name
    ) values (
      p_user_id,
      auth.uid(),
      case when p_role = 'manager' then 'member_promoted' else 'member_demoted' end,
      'project',
      p_project_id,
      coalesce(v_project_name, '')
    );
  end if;
end;
$$;

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
  v_resource_name text;
begin
  if p_resource_type = 'setlist' then
    select name into v_resource_name
    from public.setlists where id = p_resource_id;
    if v_resource_name is null then
      raise exception 'Resource not found';
    end if;
    if not public.can_manage_share_resource('setlist', p_resource_id) then
      raise exception 'Access denied';
    end if;
  elsif p_resource_type = 'project' then
    select name into v_resource_name
    from public.projects where id = p_resource_id;
    if v_resource_name is null then
      raise exception 'Resource not found';
    end if;
    if not chordmaster_private.can_manage_project_participants(p_resource_id) then
      raise exception 'Access denied';
    end if;
  else
    raise exception 'Invalid resource type';
  end if;

  if p_resource_type = 'setlist' then
    delete from public.user_setlist_memberships
    where setlist_id = p_resource_id
      and user_id = p_user_id;
  else
    delete from public.user_project_memberships
    where project_id = p_resource_id
      and user_id = p_user_id;
  end if;

  if found and p_user_id <> auth.uid() then
    insert into public.notifications (
      recipient_user_id,
      actor_user_id,
      type,
      resource_type,
      resource_id,
      resource_name
    ) values (
      p_user_id,
      auth.uid(),
      'access_removed',
      p_resource_type,
      p_resource_id,
      coalesce(v_resource_name, '')
    );
  end if;
end;
$$;

-- Replacing a function keeps its previous grants. Some self-hosted installs
-- retained anonymous grants from before the RPC hardening migration.
revoke execute on function public.get_joined_setlists(),
  public.set_project_setlist_song_key(text, text),
  public.reorder_workspace_setlist(text, jsonb, jsonb),
  public.reorder_project_setlist(text, jsonb),
  public.get_project_share_status(text),
  public.set_project_member_role(text, uuid, text),
  public.remove_shared_member(text, text, uuid)
from public, anon;

grant execute on function public.get_joined_setlists(),
  public.set_project_setlist_song_key(text, text),
  public.reorder_workspace_setlist(text, jsonb, jsonb),
  public.reorder_project_setlist(text, jsonb),
  public.get_project_share_status(text),
  public.set_project_member_role(text, uuid, text),
  public.remove_shared_member(text, text, uuid)
to authenticated;
