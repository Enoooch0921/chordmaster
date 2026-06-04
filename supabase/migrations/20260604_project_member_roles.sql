-- Project member roles: let a project owner promote joined members to "manager".
-- A manager may edit the shared key (overrideKey) and song order of the project's
-- setlists; everyone else stays read-only. All manager writes funnel through
-- SECURITY DEFINER RPCs that check the role server-side, so we do NOT open broad
-- RLS write access to joined members (and never touch setlists.library_id).

-- 1) Per-membership role. Existing rows default to 'viewer'.
alter table public.user_project_memberships
  add column if not exists role text not null default 'viewer';

alter table public.user_project_memberships
  drop constraint if exists user_project_memberships_role_check;
alter table public.user_project_memberships
  add constraint user_project_memberships_role_check check (role in ('viewer', 'manager'));

-- 2) Helper: does the current user hold a *manager* membership for a project?
create or replace function public.has_project_manager_role(target_project_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_project_memberships
    where project_id = target_project_id
      and user_id = auth.uid()
      and role = 'manager'
  )
$$;

-- 3) Owner/editor of the project's library promotes/demotes a member.
create or replace function public.set_project_member_role(p_project_id text, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
begin
  if p_role not in ('viewer', 'manager') then
    raise exception 'Invalid role';
  end if;

  select library_id into v_library_id
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
end;
$$;

grant execute on function public.set_project_member_role(text, uuid, text) to authenticated;

-- 4) Manager edits the shared key of one setlist song (override_json.overrideKey).
--    Passing null clears the override (falls back to the song's own key).
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
    set override_json = coalesce(override_json, '{}'::jsonb) - 'overrideKey'
    where id = p_setlist_song_id;
  else
    update public.setlist_songs
    set override_json = jsonb_set(coalesce(override_json, '{}'::jsonb), '{overrideKey}', to_jsonb(p_key), true)
    where id = p_setlist_song_id;
  end if;

  update public.setlists set updated_at = now() where id = v_setlist_id;
end;
$$;

grant execute on function public.set_project_setlist_song_key(text, text) to authenticated;

-- 5) Manager reorders the songs of one project setlist. p_song_ids is the ordered
--    array of setlist_song ids.
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
    set order_index = v_idx
    where id = v_id and setlist_id = p_setlist_id;
    v_idx := v_idx + 1;
  end loop;

  update public.setlists set updated_at = now() where id = p_setlist_id;
end;
$$;

grant execute on function public.reorder_project_setlist(text, jsonb) to authenticated;

-- 6) Re-create get_joined_projects to also return the current user's role per
--    project (so the client knows whether to expose manager editing). Body is
--    identical to 20260530_project_sharing.sql aside from the added 'role' field.
create or replace function public.get_joined_projects()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'archived', p.archived,
        'role', upm.role,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at,
        'setlists', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', sl.id,
              'name', sl.name,
              'displayMode', sl.display_mode,
              'showLyrics', sl.show_lyrics,
              'archived', sl.archived,
              'projectId', sl.project_id,
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
                        when jsonb_typeof(ss.override_json -> 'capo') = 'number' then (ss.override_json ->> 'capo')::integer
                        else null
                      end,
                    'sectionOrder', coalesce(ss.override_json -> 'sectionOrder', '[]'::jsonb),
                    'songData', coalesce(s.content_json, ss.override_json -> 'songData')
                  )
                  order by ss.order_index asc
                )
                from public.setlist_songs ss
                left join public.songs s on s.id = ss.song_id
                where ss.setlist_id = sl.id
              ), '[]'::jsonb)
            )
            order by sl.created_at asc
          )
          from public.setlists sl
          where sl.project_id = p.id
        ), '[]'::jsonb)
      )
      order by upm.joined_at asc
    ),
    '[]'::jsonb
  )
  from public.user_project_memberships upm
  join public.projects p on p.id = upm.project_id
  where upm.user_id = auth.uid()
$$;

grant execute on function public.get_joined_projects() to authenticated;

-- 7) Re-create get_project_share_status so the owner sees each participant's role
--    (to drive the promote/demote UI). Body matches 20260530_project_sharing.sql
--    aside from the added 'role' field on each participant.
create or replace function public.get_project_share_status(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_active_token text;
  v_active_created_at timestamptz;
  v_participants jsonb;
  v_participant_count integer;
begin
  select library_id into v_library_id
  from public.projects
  where id = p_project_id;

  if v_library_id is null then
    raise exception 'Project not found';
  end if;

  if not public.can_write_library(v_library_id) then
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
          'email', coalesce(p.email, ''),
          'name', coalesce(p.display_name, p.email, ''),
          'picture', p.avatar_url,
          'role', upm.role,
          'joinedAt', upm.joined_at
        )
        order by upm.joined_at asc
      ),
      '[]'::jsonb
    )
  into v_participant_count, v_participants
  from public.user_project_memberships upm
  left join public.profiles p on p.id = upm.user_id
  where upm.project_id = p_project_id;

  return jsonb_build_object(
    'activeToken', v_active_token,
    'activeCreatedAt', v_active_created_at,
    'participantCount', coalesce(v_participant_count, 0),
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_project_share_status(text) to authenticated;
