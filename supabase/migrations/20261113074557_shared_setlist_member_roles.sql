-- Direct and inherited manager grants both authorize arrangement of one setlist.
-- Older workspace-trash snapshots explicitly restore NULL for an absent column.
-- Treat that legacy value as viewer, exactly like a new membership.
alter table public.user_setlist_memberships
  add column role text default 'viewer' check (role in ('viewer', 'manager'));

create function chordmaster_private.can_arrange_shared_setlist(p_setlist_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.user_setlist_memberships
    where setlist_id = p_setlist_id and user_id = auth.uid() and role = 'manager'
  ) or exists (
    select 1 from public.setlists sl
    where sl.id = p_setlist_id and public.has_project_manager_role(sl.project_id)
  );
$$;
revoke all on function chordmaster_private.can_arrange_shared_setlist(text) from public, anon, authenticated;

create function public.set_setlist_member_role(p_setlist_id text, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous_role text;
begin
  if auth.uid() is null or not public.can_manage_share_resource('setlist', p_setlist_id) then
    raise exception 'Access denied';
  end if;
  if p_role is null or p_role not in ('manager', 'viewer') then
    raise exception 'Invalid role';
  end if;

  select coalesce(role, 'viewer') into previous_role from public.user_setlist_memberships
  where setlist_id = p_setlist_id and user_id = p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  if previous_role = p_role then return; end if;

  update public.user_setlist_memberships set role = p_role
  where setlist_id = p_setlist_id and user_id = p_user_id;
  if p_user_id <> auth.uid() then
    insert into public.notifications (recipient_user_id, actor_user_id, type, resource_type, resource_id, resource_name)
    select p_user_id, auth.uid(), case when p_role = 'manager' then 'member_promoted' else 'member_demoted' end,
      'setlist', id, name from public.setlists where id = p_setlist_id;
  end if;
end;
$$;
revoke all on function public.set_setlist_member_role(text, uuid, text) from public, anon;
grant execute on function public.set_setlist_member_role(text, uuid, text) to authenticated;

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
  if not exists (select 1 from public.setlists where id = p_setlist_id) then
    raise exception 'Setlist not found';
  end if;
  if not public.can_manage_share_resource('setlist', p_setlist_id) then
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
          'email', coalesce(profile.email, ''),
          'name', coalesce(profile.display_name, profile.email, ''),
          'picture', profile.avatar_url,
          'inheritsProjectManager', exists (
            select 1 from public.setlists sl
            join public.user_project_memberships pm on pm.project_id = sl.project_id
            where sl.id = usm.setlist_id and pm.user_id = usm.user_id and pm.role = 'manager'
          ),
          'role', coalesce(usm.role, 'viewer'),
          'joinedAt', usm.joined_at
        ) order by usm.joined_at
      ),
      '[]'::jsonb
    )
  into v_participant_count, v_participants
  from public.user_setlist_memberships usm
  left join public.profiles profile on profile.id = usm.user_id
  where usm.setlist_id = p_setlist_id;

  return jsonb_build_object(
    'activeToken', v_active_token,
    'activeCreatedAt', v_active_created_at,
    'participantCount', coalesce(v_participant_count, 0),
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

-- Keep the existing Key RPC compatible with installed clients.
create or replace function public.set_project_setlist_song_key(p_setlist_song_id text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_setlist text;
begin
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
