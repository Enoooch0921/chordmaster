-- Project sharing: lets owners share a whole project (event) by a single link
-- that grants joined users read access to the project, all its setlists, and
-- the songs embedded in those setlists. Mirrors the existing setlist share
-- infrastructure (user_setlist_memberships, join_shared_setlist, etc.).

-- 1) Extend share_links.resource_type to accept 'project'.
alter table public.share_links
  drop constraint if exists share_links_resource_type_check;
alter table public.share_links
  add constraint share_links_resource_type_check
  check (resource_type in ('song', 'setlist', 'project'));

-- 2) Track which users have joined which shared projects.
create table if not exists public.user_project_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  token_used text,
  joined_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists user_project_memberships_user_idx
  on public.user_project_memberships(user_id);

-- 3) Helper used by RLS policies: does the current user hold a membership
--    for a given project?
create or replace function public.has_project_membership(target_project_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_project_memberships
    where project_id = target_project_id
      and user_id = auth.uid()
  )
$$;

-- 4) RPC: join a shared project via its token. Verifies the token is active
--    and upserts the membership row.
create or replace function public.join_shared_project(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
begin
  select resource_id into v_project_id
  from public.share_links
  where token = p_token
    and resource_type = 'project'
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_project_id is null then
    raise exception 'Invalid or expired share link';
  end if;

  insert into public.user_project_memberships (user_id, project_id, token_used)
  values (auth.uid(), v_project_id, p_token)
  on conflict (user_id, project_id) do nothing;

  return v_project_id;
end;
$$;

grant execute on function public.join_shared_project(text) to authenticated;

-- 5) RLS on the membership table itself: users only see/manage their own rows.
alter table public.user_project_memberships enable row level security;

drop policy if exists "upm_self_select" on public.user_project_memberships;
create policy "upm_self_select" on public.user_project_memberships
  for select using (user_id = auth.uid());

drop policy if exists "upm_self_delete" on public.user_project_memberships;
create policy "upm_self_delete" on public.user_project_memberships
  for delete using (user_id = auth.uid());

-- 6) Read access for joined members on the project itself and on every
--    setlist / setlist_song / song reachable through that project.
drop policy if exists "projects_joined_member_select" on public.projects;
create policy "projects_joined_member_select" on public.projects
  for select using (public.has_project_membership(id));

drop policy if exists "setlists_via_joined_project" on public.setlists;
create policy "setlists_via_joined_project" on public.setlists
  for select using (
    project_id is not null
    and public.has_project_membership(project_id)
  );

drop policy if exists "setlist_songs_via_joined_project" on public.setlist_songs;
create policy "setlist_songs_via_joined_project" on public.setlist_songs
  for select using (
    exists (
      select 1
      from public.setlists sl
      where sl.id = setlist_id
        and sl.project_id is not null
        and public.has_project_membership(sl.project_id)
    )
  );

drop policy if exists "songs_via_joined_project" on public.songs;
create policy "songs_via_joined_project" on public.songs
  for select using (
    exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      join public.user_project_memberships upm
        on upm.project_id = sl.project_id
       and upm.user_id = auth.uid()
      where ss.song_id = songs.id
    )
  );

-- 7) RPC: return all joined projects (with embedded setlists + songs) for the
--    current user. Mirrors get_joined_setlists for one-shot client loading.
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

-- 8) RPC: project share status for owners (active token + participant list).
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

-- 9) RPC: revoke all current sharing on a project.
create or replace function public.revoke_project_sharing(p_project_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
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

  update public.share_links
  set revoked_at = now()
  where resource_type = 'project'
    and resource_id = p_project_id
    and revoked_at is null;

  delete from public.user_project_memberships
  where project_id = p_project_id;
end;
$$;

grant execute on function public.revoke_project_sharing(text) to authenticated;
