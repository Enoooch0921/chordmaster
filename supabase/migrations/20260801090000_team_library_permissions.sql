-- Additive compatibility layer for team-library permissions.
-- Deploy this migration first. It adds data structures and RPCs required by
-- both the existing client and the new team-library frontend. Existing editor
-- access remains broad; the one compatibility policy below only teaches the
-- old setlist UPDATE check about explicit assignments. Apply 20260801100000
-- only after the compatible frontend is live.

alter table public.songs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.songs
  drop constraint if exists songs_archived_by_requires_archived_at;
alter table public.songs
  add constraint songs_archived_by_requires_archived_at
  check (archived_by is null or archived_at is not null);

create index if not exists songs_library_active_idx
  on public.songs(library_id, updated_at desc)
  where archived_at is null;

-- The extra library_id makes the membership and setlist relationship
-- enforceable with ordinary composite foreign keys, not only application code.
alter table public.setlists
  drop constraint if exists setlists_id_library_id_key;
alter table public.setlists
  add constraint setlists_id_library_id_key unique (id, library_id);

create table if not exists public.setlist_editor_assignments (
  setlist_id text not null,
  library_id text not null,
  user_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (setlist_id, user_id),
  constraint setlist_editor_assignments_setlist_library_fkey
    foreign key (setlist_id, library_id)
    references public.setlists(id, library_id)
    on update cascade
    on delete cascade,
  constraint setlist_editor_assignments_member_fkey
    foreign key (library_id, user_id)
    references public.library_members(library_id, user_id)
    on update cascade
    on delete cascade
);

create index if not exists setlist_editor_assignments_user_idx
  on public.setlist_editor_assignments(user_id, library_id, setlist_id);

-- A source may have several independent team copies, but at most one copy is
-- the canonical overwrite target for a team/source pair.
create table if not exists public.team_song_imports (
  team_library_id text not null references public.libraries(id) on delete cascade,
  source_library_id text not null,
  source_song_id text not null,
  team_song_id text not null references public.songs(id) on delete cascade,
  is_primary boolean not null default false,
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_library_id, source_song_id, team_song_id),
  unique (team_song_id)
);

create unique index if not exists team_song_imports_one_primary_idx
  on public.team_song_imports(team_library_id, source_song_id)
  where is_primary;

create index if not exists team_song_imports_source_idx
  on public.team_song_imports(source_song_id, team_library_id);

-- Library identity and kind drive every downstream RLS decision. Keep those
-- fields immutable through direct table APIs; future ownership transfer or
-- kind conversion must be an explicit transactional RPC.
create or replace function public.enforce_library_row_integrity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'team' then
      raise exception 'Team libraries cannot be deleted directly';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.kind is distinct from old.kind
     or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Library id, kind, and owner are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists libraries_row_integrity on public.libraries;
create trigger libraries_row_integrity
before update or delete on public.libraries
for each row execute function public.enforce_library_row_integrity();

-- These identity fields were mutable through the legacy broad editor policies.
-- Install the final row invariants in the compatibility phase so a team song
-- cannot be moved to a personal library and then cascade-deleted before the
-- hardening migration lands.
create or replace function public.enforce_song_row_integrity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.library_id is distinct from old.library_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Song id, library, and creator are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists songs_row_integrity on public.songs;
create trigger songs_row_integrity
before update on public.songs
for each row execute function public.enforce_song_row_integrity();

create or replace function public.enforce_setlist_row_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_library_id text;
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.library_id is distinct from old.library_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Setlist id, library, and creator are immutable';
  end if;

  if new.project_id is not null then
    select library_id into v_project_library_id
    from public.projects
    where id = new.project_id;

    if v_project_library_id is null or v_project_library_id <> new.library_id then
      raise exception 'A setlist and its project must belong to the same library';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists setlists_row_integrity on public.setlists;
create trigger setlists_row_integrity
before insert or update on public.setlists
for each row execute function public.enforce_setlist_row_integrity();

create or replace function public.enforce_project_row_integrity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.library_id is distinct from old.library_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Project id, library, and creator are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_row_integrity on public.projects;
create trigger projects_row_integrity
before update on public.projects
for each row execute function public.enforce_project_row_integrity();

create or replace function public.enforce_setlist_song_library()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setlist_library_id text;
  v_song_library_id text;
begin
  select library_id into v_setlist_library_id
  from public.setlists
  where id = new.setlist_id;

  select library_id into v_song_library_id
  from public.songs
  where id = new.song_id;

  if v_setlist_library_id is null or v_song_library_id is null
     or v_setlist_library_id <> v_song_library_id then
    raise exception 'A setlist song must use a song from the same library';
  end if;
  return new;
end;
$$;

drop trigger if exists setlist_songs_same_library on public.setlist_songs;
create trigger setlist_songs_same_library
before insert or update of setlist_id, song_id on public.setlist_songs
for each row execute function public.enforce_setlist_song_library();

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
        lm.role = 'owner'
        or (
          sl.created_by = auth.uid()
          and lm.role in ('editor', 'setlist_manager')
        )
      )
  )
$$;

-- Compatibility stage: legacy editors keep their previous library-wide setlist
-- write access until the hardening migration narrows them to creator/assignment.
-- New setlist managers may write only setlists they created or were assigned.
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
        lm.role in ('owner', 'editor')
        or (
          lm.role = 'setlist_manager'
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
        lm.role = 'owner'
        or (
          lm.role in ('editor', 'setlist_manager')
          and p.created_by = auth.uid()
        )
      )
  )
$$;

-- Public alias for Edge Functions. Project ids are text in the existing schema.
create or replace function public.can_manage_project(target_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_project(target_project_id)
$$;

-- A setlist editor may keep editing an assigned setlist inside another
-- person's project, but changing project membership itself is project
-- management. Owners may always move setlists; other roles must manage both
-- the previous and the new project. A missing old project is allowed only for
-- the FK's ON DELETE SET NULL cascade.
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

  if v_library_role = 'owner' then
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

drop trigger if exists setlists_project_scope on public.setlists;
create trigger setlists_project_scope
before insert or update of project_id on public.setlists
for each row execute function public.enforce_setlist_project_scope();

-- The pre-existing UPDATE policy repeated the old role expression in WITH
-- CHECK, so a newly assigned setlist_manager passed USING but still failed on
-- save. Keep legacy editors library-wide in this phase while enabling explicit
-- assignments end to end.
drop policy if exists "setlists_update_by_role" on public.setlists;
create policy "setlists_update_by_role" on public.setlists
for update using (public.can_write_setlist(id))
with check (public.can_write_setlist(id));

alter table public.setlist_editor_assignments enable row level security;
alter table public.team_song_imports enable row level security;

revoke all on table public.setlist_editor_assignments from anon, authenticated;
grant select on table public.setlist_editor_assignments to authenticated;
revoke all on table public.team_song_imports from anon, authenticated;

drop policy if exists "setlist_editor_assignments_select" on public.setlist_editor_assignments;
create policy "setlist_editor_assignments_select" on public.setlist_editor_assignments
for select using (
  user_id = auth.uid()
  or public.can_manage_setlist_assignments(setlist_id)
);

create or replace function public.enforce_assignment_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_role text;
begin
  select l.kind into v_kind
  from public.libraries l
  where l.id = new.library_id;

  if v_kind <> 'team' then
    raise exception 'Setlist editor assignments are only valid in team libraries';
  end if;

  select lm.role into v_role
  from public.library_members lm
  where lm.library_id = new.library_id
    and lm.user_id = new.user_id;

  if v_role is null or v_role not in ('editor', 'setlist_manager') then
    raise exception 'The assignee must be an active team song-library manager or setlist editor';
  end if;

  return new;
end;
$$;

drop trigger if exists setlist_editor_assignments_member_role on public.setlist_editor_assignments;
create trigger setlist_editor_assignments_member_role
before insert or update on public.setlist_editor_assignments
for each row execute function public.enforce_assignment_member_role();

create or replace function public.cleanup_invalid_setlist_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.setlist_editor_assignments
    where library_id = old.library_id
      and user_id = old.user_id;
    return old;
  end if;

  if new.role not in ('editor', 'setlist_manager')
     or new.library_id <> old.library_id
     or new.user_id <> old.user_id then
    delete from public.setlist_editor_assignments
    where library_id = old.library_id
      and user_id = old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists library_members_cleanup_setlist_assignments on public.library_members;
create trigger library_members_cleanup_setlist_assignments
after delete or update of library_id, user_id, role on public.library_members
for each row execute function public.cleanup_invalid_setlist_assignments();

create or replace function public.enforce_team_song_import_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_kind text;
  v_team_song_library_id text;
  v_source_song_library_id text;
  v_source_kind text;
begin
  select kind into v_team_kind
  from public.libraries
  where id = new.team_library_id;

  select library_id into v_team_song_library_id
  from public.songs
  where id = new.team_song_id;

  select s.library_id, l.kind
    into v_source_song_library_id, v_source_kind
  from public.songs s
  join public.libraries l on l.id = s.library_id
  where s.id = new.source_song_id;

  if v_team_kind <> 'team' or v_team_song_library_id <> new.team_library_id then
    raise exception 'The imported song must belong to the target team library';
  end if;

  if v_source_kind <> 'personal' or v_source_song_library_id <> new.source_library_id then
    raise exception 'The import source must be an existing personal-library song';
  end if;
  return new;
end;
$$;

drop trigger if exists team_song_imports_integrity on public.team_song_imports;
create trigger team_song_imports_integrity
before insert or update on public.team_song_imports
for each row execute function public.enforce_team_song_import_integrity();

-- Existing editors previously had write access to every setlist. Preserve that
-- access for already-existing rows, while future access becomes explicit.
insert into public.setlist_editor_assignments (
  setlist_id, library_id, user_id, assigned_by, assigned_at
)
select sl.id, sl.library_id, lm.user_id, l.owner_user_id, now()
from public.setlists sl
join public.libraries l
  on l.id = sl.library_id
 and l.kind = 'team'
join public.library_members lm
  on lm.library_id = sl.library_id
 and lm.role = 'editor'
on conflict (setlist_id, user_id) do nothing;

create or replace function public.get_setlist_editor_assignments(p_setlist_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_assignable_members jsonb;
  v_assignments jsonb;
begin
  select library_id into v_library_id
  from public.setlists
  where id = p_setlist_id;

  if v_library_id is null then
    raise exception 'Setlist not found';
  end if;

  if not public.can_manage_setlist_assignments(p_setlist_id) then
    raise exception 'Access denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', lm.user_id,
        'email', coalesce(p.email, ''),
        'name', coalesce(p.display_name, p.email, ''),
        'picture', p.avatar_url,
        'role', lm.role
      )
      order by coalesce(p.display_name, p.email, ''), lm.created_at
    ),
    '[]'::jsonb
  ) into v_assignable_members
  from public.library_members lm
  left join public.profiles p on p.id = lm.user_id
  where lm.library_id = v_library_id
    and lm.role in ('editor', 'setlist_manager');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', sea.user_id,
        'assignedBy', sea.assigned_by,
        'assignedAt', sea.assigned_at
      )
      order by sea.assigned_at, sea.user_id
    ),
    '[]'::jsonb
  ) into v_assignments
  from public.setlist_editor_assignments sea
  where sea.setlist_id = p_setlist_id;

  return jsonb_build_object(
    'setlistId', p_setlist_id,
    'assignableMembers', v_assignable_members,
    'assignments', v_assignments
  );
end;
$$;

create or replace function public.set_setlist_editor_assignment(
  p_setlist_id text,
  p_user_id uuid,
  p_assigned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select library_id into v_library_id
  from public.setlists
  where id = p_setlist_id
  for update;

  if v_library_id is null then
    raise exception 'Setlist not found';
  end if;

  if not public.can_manage_setlist_assignments(p_setlist_id) then
    raise exception 'Access denied';
  end if;

  if coalesce(p_assigned, false) then
    select role into v_role
    from public.library_members
    where library_id = v_library_id
      and user_id = p_user_id;

    if v_role is null or v_role not in ('editor', 'setlist_manager') then
      raise exception 'The assignee must be an active team song-library manager or setlist editor';
    end if;

    insert into public.setlist_editor_assignments (
      setlist_id, library_id, user_id, assigned_by, assigned_at
    ) values (
      p_setlist_id, v_library_id, p_user_id, auth.uid(), now()
    )
    on conflict (setlist_id, user_id) do update
      set assigned_by = excluded.assigned_by,
          assigned_at = excluded.assigned_at;
  else
    delete from public.setlist_editor_assignments
    where setlist_id = p_setlist_id
      and user_id = p_user_id;
  end if;

  return public.get_setlist_editor_assignments(p_setlist_id);
end;
$$;

-- Two-argument calls intentionally default new invitations to setlist editor.
create or replace function public.create_team_invite(p_library_id text, p_email text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_team_invite(p_library_id, p_email, 'setlist_manager')
$$;

create or replace function public.clone_team_import_song_content(p_content jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_section jsonb;
  v_bar jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_bars jsonb;
begin
  if jsonb_typeof(p_content -> 'sections') <> 'array' then
    return p_content;
  end if;

  for v_section in select value from jsonb_array_elements(p_content -> 'sections')
  loop
    v_bars := '[]'::jsonb;
    if jsonb_typeof(v_section -> 'bars') = 'array' then
      for v_bar in select value from jsonb_array_elements(v_section -> 'bars')
      loop
        v_bars := v_bars || jsonb_build_array(
          jsonb_set(v_bar, '{id}', to_jsonb(gen_random_uuid()::text), true)
        );
      end loop;
    end if;

    v_section := jsonb_set(
      v_section,
      '{id}',
      to_jsonb('section-' || gen_random_uuid()::text),
      true
    );
    v_section := jsonb_set(v_section, '{bars}', v_bars, true);
    v_sections := v_sections || jsonb_build_array(v_section);
  end loop;

  return jsonb_set(p_content, '{sections}', v_sections, true);
end;
$$;

create or replace function public.reuse_team_song_structure_ids(
  p_source_content jsonb,
  p_target_content jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_source_section jsonb;
  v_target_section jsonb;
  v_source_bar jsonb;
  v_target_bar jsonb;
  v_sections jsonb := '[]'::jsonb;
  v_bars jsonb;
  v_section_index integer;
  v_bar_index integer;
  v_id text;
begin
  if jsonb_typeof(p_source_content -> 'sections') <> 'array' then
    return p_source_content;
  end if;

  for v_source_section, v_section_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_source_content -> 'sections') with ordinality
  loop
    v_target_section := case
      when jsonb_typeof(p_target_content -> 'sections') = 'array'
        then p_target_content -> 'sections' -> v_section_index
      else null
    end;
    v_id := nullif(v_target_section ->> 'id', '');
    v_source_section := jsonb_set(
      v_source_section,
      '{id}',
      to_jsonb(coalesce(v_id, 'section-' || gen_random_uuid()::text)),
      true
    );

    v_bars := '[]'::jsonb;
    if jsonb_typeof(v_source_section -> 'bars') = 'array' then
      for v_source_bar, v_bar_index in
        select value, ordinality::integer - 1
        from jsonb_array_elements(v_source_section -> 'bars') with ordinality
      loop
        v_target_bar := case
          when jsonb_typeof(v_target_section -> 'bars') = 'array'
            then v_target_section -> 'bars' -> v_bar_index
          else null
        end;
        v_id := nullif(v_target_bar ->> 'id', '');
        v_bars := v_bars || jsonb_build_array(
          jsonb_set(
            v_source_bar,
            '{id}',
            to_jsonb(coalesce(v_id, gen_random_uuid()::text)),
            true
          )
        );
      end loop;
      v_source_section := jsonb_set(v_source_section, '{bars}', v_bars, true);
    end if;

    v_sections := v_sections || jsonb_build_array(v_source_section);
  end loop;

  return jsonb_set(p_source_content, '{sections}', v_sections, true);
end;
$$;

create or replace function public.inspect_team_song_import(
  p_team_library_id text,
  p_source_song_ids text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_kind text;
  v_requested_count integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  v_requested_count := cardinality(coalesce(p_source_song_ids, '{}'::text[]));
  if v_requested_count = 0 then
    return jsonb_build_object('songs', '[]'::jsonb);
  end if;
  if v_requested_count > 500 then
    raise exception 'At most 500 songs may be inspected at once';
  end if;
  if exists (
    select 1
    from unnest(p_source_song_ids) source_id
    where source_id is null or btrim(source_id) = ''
  ) then
    raise exception 'Every sourceSongId must be a non-empty string';
  end if;
  if (select count(distinct source_id) from unnest(p_source_song_ids) source_id) <> v_requested_count then
    raise exception 'Duplicate sourceSongId values are not allowed';
  end if;

  select kind into v_team_kind
  from public.libraries
  where id = p_team_library_id;

  if v_team_kind <> 'team' or not public.can_edit_library_content(p_team_library_id) then
    raise exception 'Access denied';
  end if;

  if (
    select count(*)
    from public.songs source_song
    join public.libraries source_library
      on source_library.id = source_song.library_id
    where source_song.id = any(p_source_song_ids)
      and source_library.kind = 'personal'
      and source_library.owner_user_id = v_user_id
  ) <> v_requested_count then
    raise exception 'One or more personal source songs were not found or are not owned by the caller';
  end if;

  with requested as (
    select source_id, ordinality
    from unnest(p_source_song_ids) with ordinality as input(source_id, ordinality)
  ), inspected as (
    select
      requested.ordinality,
      source_song.id as source_song_id,
      source_song.title,
      primary_song.id as existing_song_id,
      primary_song.title as existing_title,
      case
        when primary_song.id is null then null
        else jsonb_build_object(
          'songId', primary_song.id,
          'title', primary_song.title,
          'currentKey', primary_song.content_json ->> 'currentKey',
          'originalKey', primary_song.content_json ->> 'originalKey',
          'version', primary_song.content_json ->> 'version',
          'lyricist', primary_song.content_json ->> 'lyricist',
          'composer', primary_song.content_json ->> 'composer'
        )
      end as existing_song,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'songId', candidate.id,
            'title', candidate.title,
            'currentKey', candidate.content_json ->> 'currentKey',
            'originalKey', candidate.content_json ->> 'originalKey',
            'version', candidate.content_json ->> 'version',
            'lyricist', candidate.content_json ->> 'lyricist',
            'composer', candidate.content_json ->> 'composer'
          )
          order by candidate.updated_at desc, candidate.id
        )
        from public.songs candidate
        where candidate.library_id = p_team_library_id
          and candidate.archived_at is null
          and lower(btrim(candidate.title)) = lower(btrim(source_song.title))
          and not exists (
            select 1
            from public.team_song_imports mapped_candidate
            where mapped_candidate.team_song_id = candidate.id
          )
      ), '[]'::jsonb) as possible_matches
    from requested
    join public.songs source_song on source_song.id = requested.source_id
    left join public.team_song_imports primary_import
      on primary_import.team_library_id = p_team_library_id
     and primary_import.source_song_id = source_song.id
     and primary_import.is_primary
    left join public.songs primary_song
      on primary_song.id = primary_import.team_song_id
     and primary_song.library_id = p_team_library_id
  )
  select jsonb_build_object(
    'songs', coalesce(jsonb_agg(
      jsonb_build_object(
        'sourceSongId', source_song_id,
        'title', title,
        'existingSongId', existing_song_id,
        'existingTitle', existing_title,
        'existingSong', existing_song,
        'possibleMatches', possible_matches
      )
      order by ordinality
    ), '[]'::jsonb)
  ) into v_result
  from inspected;

  return v_result;
end;
$$;

create or replace function public.import_personal_songs_to_team(
  p_team_library_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_kind text;
  v_item jsonb;
  v_source record;
  v_target record;
  v_source_song_id text;
  v_resolution text;
  v_requested_target_song_id text;
  v_primary_song_id text;
  v_target_song_id text;
  v_content jsonb;
  v_existing_created_at jsonb;
  v_now_ms bigint;
  v_is_primary boolean;
  v_created_count integer := 0;
  v_overwritten_count integer := 0;
  v_duplicate_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  v_item_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_item_count = 0 then
    return jsonb_build_object(
      'createdCount', 0,
      'overwrittenCount', 0,
      'duplicateCount', 0,
      'songs', '[]'::jsonb
    );
  end if;
  if v_item_count > 500 then
    raise exception 'At most 500 songs may be imported at once';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(item ->> 'sourceSongId'), '') is null
      or item ->> 'resolution' not in ('create', 'overwrite', 'duplicate')
  ) then
    raise exception 'Every import item requires sourceSongId and a valid resolution';
  end if;
  if (
    select count(distinct item ->> 'sourceSongId')
    from jsonb_array_elements(p_items) item
  ) <> v_item_count then
    raise exception 'Duplicate sourceSongId values are not allowed';
  end if;

  -- Serializing imports per team makes the partial unique primary index a final
  -- guard rather than the normal race-resolution mechanism.
  select kind into v_team_kind
  from public.libraries
  where id = p_team_library_id
  for update;

  if v_team_kind <> 'team' or not public.can_edit_library_content(p_team_library_id) then
    raise exception 'Access denied';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_source_song_id := btrim(v_item ->> 'sourceSongId');
    v_resolution := v_item ->> 'resolution';
    v_requested_target_song_id := nullif(btrim(v_item ->> 'targetSongId'), '');
    v_primary_song_id := null;
    v_target_song_id := null;

    select
      source_song.id,
      source_song.library_id,
      source_song.title,
      source_song.content_json
    into v_source
    from public.songs source_song
    join public.libraries source_library
      on source_library.id = source_song.library_id
    where source_song.id = v_source_song_id
      and source_library.kind = 'personal'
      and source_library.owner_user_id = v_user_id
    for share of source_song;

    if not found then
      raise exception 'Personal source song % was not found or is not owned by the caller', v_source_song_id;
    end if;

    select team_song_id into v_primary_song_id
    from public.team_song_imports
    where team_library_id = p_team_library_id
      and source_song_id = v_source_song_id
      and is_primary
    for update;

    if v_resolution = 'create' and v_primary_song_id is not null then
      raise exception 'Song % already has a primary team import; choose overwrite or duplicate', v_source_song_id;
    end if;
    if v_resolution = 'create' and v_requested_target_song_id is not null then
      raise exception 'create does not accept targetSongId';
    end if;
    if v_resolution = 'duplicate' and v_requested_target_song_id is not null then
      raise exception 'duplicate does not accept targetSongId';
    end if;

    v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    v_content := public.clone_team_import_song_content(v_source.content_json)
      - 'teamSource'
      - 'archivedAt'
      - 'archivedBy'
      - 'createdBy'
      - 'updatedBy';

    if v_resolution = 'overwrite' then
      v_target_song_id := coalesce(v_requested_target_song_id, v_primary_song_id);
      if v_target_song_id is null then
        raise exception 'overwrite requires an existing primary song or targetSongId';
      end if;
      if v_primary_song_id is not null and v_target_song_id <> v_primary_song_id then
        raise exception 'targetSongId must match the existing primary team song';
      end if;

      select
        target_song.id,
        target_song.title,
        target_song.content_json,
        target_song.created_at,
        target_map.source_song_id as mapped_source_song_id,
        target_map.is_primary as mapped_is_primary
      into v_target
      from public.songs target_song
      left join public.team_song_imports target_map
        on target_map.team_song_id = target_song.id
      where target_song.id = v_target_song_id
        and target_song.library_id = p_team_library_id
      for update of target_song;

      if not found then
        raise exception 'The overwrite target is not a song in the target team library';
      end if;
      if v_target.mapped_source_song_id is not null
         and v_target.mapped_source_song_id <> v_source_song_id then
        raise exception 'The overwrite target is already linked to a different source song';
      end if;
      if v_primary_song_id is null
         and lower(btrim(v_target.title)) <> lower(btrim(v_source.title)) then
        raise exception 'A legacy overwrite target must have the same title as the source song';
      end if;

      -- Keep target section/bar ids by index so existing setlist sectionOrder
      -- pointers remain valid whenever the corresponding structure remains.
      v_content := public.reuse_team_song_structure_ids(
        v_source.content_json,
        v_target.content_json
      )
        - 'teamSource'
        - 'archivedAt'
        - 'archivedBy'
        - 'createdBy'
        - 'updatedBy';

      v_existing_created_at := coalesce(
        v_target.content_json -> 'createdAt',
        to_jsonb(floor(extract(epoch from v_target.created_at) * 1000)::bigint)
      );
      v_content := jsonb_set(v_content, '{id}', to_jsonb(v_target_song_id), true);
      v_content := jsonb_set(v_content, '{title}', to_jsonb(v_source.title), true);
      v_content := jsonb_set(v_content, '{createdAt}', v_existing_created_at, true);
      v_content := jsonb_set(v_content, '{updatedAt}', to_jsonb(v_now_ms), true);

      update public.songs
      set title = v_source.title,
          content_json = v_content,
          updated_by = v_user_id,
          updated_at = now()
      where id = v_target_song_id
        and library_id = p_team_library_id;

      if v_target.mapped_source_song_id = v_source_song_id then
        update public.team_song_imports
        set is_primary = true,
            imported_by = v_user_id,
            updated_at = now()
        where team_song_id = v_target_song_id;
      else
        insert into public.team_song_imports (
          team_library_id,
          source_library_id,
          source_song_id,
          team_song_id,
          is_primary,
          imported_by,
          imported_at,
          updated_at
        ) values (
          p_team_library_id,
          v_source.library_id,
          v_source_song_id,
          v_target_song_id,
          true,
          v_user_id,
          now(),
          now()
        );
      end if;

      v_overwritten_count := v_overwritten_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'sourceSongId', v_source_song_id,
        'songId', v_target_song_id,
        'title', v_source.title,
        'resolution', 'overwrite',
        'isPrimary', true
      ));
      continue;
    end if;

    v_target_song_id := gen_random_uuid()::text;
    v_is_primary := v_primary_song_id is null;
    v_content := jsonb_set(v_content, '{id}', to_jsonb(v_target_song_id), true);
    v_content := jsonb_set(v_content, '{title}', to_jsonb(v_source.title), true);
    v_content := jsonb_set(v_content, '{createdAt}', to_jsonb(v_now_ms), true);
    v_content := jsonb_set(v_content, '{updatedAt}', to_jsonb(v_now_ms), true);

    insert into public.songs (
      id,
      library_id,
      title,
      content_json,
      client_legacy_id,
      created_by,
      updated_by,
      archived_at,
      archived_by,
      created_at,
      updated_at
    ) values (
      v_target_song_id,
      p_team_library_id,
      v_source.title,
      v_content,
      v_source_song_id,
      v_user_id,
      v_user_id,
      null,
      null,
      now(),
      now()
    );

    insert into public.team_song_imports (
      team_library_id,
      source_library_id,
      source_song_id,
      team_song_id,
      is_primary,
      imported_by,
      imported_at,
      updated_at
    ) values (
      p_team_library_id,
      v_source.library_id,
      v_source_song_id,
      v_target_song_id,
      v_is_primary,
      v_user_id,
      now(),
      now()
    );

    if v_resolution = 'create' then
      v_created_count := v_created_count + 1;
    else
      v_duplicate_count := v_duplicate_count + 1;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'sourceSongId', v_source_song_id,
      'songId', v_target_song_id,
      'title', v_source.title,
      'resolution', v_resolution,
      'isPrimary', v_is_primary
    ));
  end loop;

  return jsonb_build_object(
    'createdCount', v_created_count,
    'overwrittenCount', v_overwritten_count,
    'duplicateCount', v_duplicate_count,
    'songs', v_results
  );
end;
$$;

-- Install the reference-protection layer in the additive phase so old clients
-- and raw REST writes cannot cascade-delete team songs during the rolling
-- frontend deployment window.
--
-- Every statement that can add/change a song reference, plus every song
-- deletion, takes the same global transaction lock before PostgreSQL locks any
-- affected row. Reference removal stays outside the gate: it cannot create a
-- dangling song, and excluding it avoids parent-delete cascade lock inversion.
-- Setlist/bundle parent deletion and their child cascades also stay outside the
-- gate. Share activation therefore follows G -> parent, while deletion never
-- waits for G after locking a parent. auth.users deletion is the one ancestor
-- exception: it takes G before locking the user because its cascades can delete
-- songs, while a gated share insertion later key-locks the same created_by row.
create or replace function public.lock_song_reference_graph_statement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );
  return null;
end;
$$;

drop trigger if exists auth_users_reference_graph_statement_lock on auth.users;
create trigger auth_users_reference_graph_statement_lock
before delete on auth.users
for each statement execute function public.lock_song_reference_graph_statement();

drop trigger if exists songs_reference_graph_statement_lock on public.songs;
create trigger songs_reference_graph_statement_lock
before delete on public.songs
for each statement execute function public.lock_song_reference_graph_statement();

drop trigger if exists share_links_reference_graph_statement_lock on public.share_links;
create trigger share_links_reference_graph_statement_lock
before insert or update on public.share_links
for each statement execute function public.lock_song_reference_graph_statement();

drop trigger if exists song_share_bundle_items_reference_graph_statement_lock
  on public.song_share_bundle_items;
create trigger song_share_bundle_items_reference_graph_statement_lock
before insert or update on public.song_share_bundle_items
for each statement execute function public.lock_song_reference_graph_statement();

drop trigger if exists setlist_songs_reference_graph_statement_lock on public.setlist_songs;
create trigger setlist_songs_reference_graph_statement_lock
before insert or update on public.setlist_songs
for each statement execute function public.lock_song_reference_graph_statement();

create or replace function public.lock_share_link_resource()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_song_id text;
  v_bundle_song_count integer := 0;
  v_will_be_active boolean := new.revoked_at is null
    and (new.expires_at is null or new.expires_at > now());
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );

  if new.resource_type = 'song' then
    if v_will_be_active then
      perform pg_advisory_xact_lock(hashtextextended('song:' || new.resource_id, 0));
    end if;
    perform 1 from public.songs where id = new.resource_id for key share;
    if not found then
      raise exception 'Shared song not found';
    end if;
  elsif new.resource_type = 'song_bundle' then
    perform 1
    from public.song_share_bundles
    where id = new.resource_id
    for key share;
    if not found then
      raise exception 'Shared song bundle not found';
    end if;

    if v_will_be_active then
      for v_song_id in
        select item.song_id
        from public.song_share_bundle_items item
        where item.bundle_id = new.resource_id
        order by item.song_id
        for key share of item
      loop
        v_bundle_song_count := v_bundle_song_count + 1;
        perform pg_advisory_xact_lock(hashtextextended('song:' || v_song_id, 0));
        perform 1 from public.songs where id = v_song_id for key share;
        if not found then
          raise exception 'Bundle song % not found', v_song_id;
        end if;
      end loop;

      if v_bundle_song_count = 0 then
        raise exception 'An active shared song bundle must contain at least one song';
      end if;
    end if;
  elsif new.resource_type = 'setlist' then
    perform 1 from public.setlists where id = new.resource_id for key share;
    if not found then
      raise exception 'Shared setlist not found';
    end if;
  elsif new.resource_type = 'project' then
    perform 1 from public.projects where id = new.resource_id for key share;
    if not found then
      raise exception 'Shared project not found';
    end if;
  else
    raise exception 'Invalid share resource type';
  end if;
  return new;
end;
$$;

drop trigger if exists share_links_resource_exists on public.share_links;
create trigger share_links_resource_exists
before insert or update on public.share_links
for each row execute function public.lock_share_link_resource();

create or replace function public.lock_bundle_item_song()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle_library_id text;
  v_song_library_id text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended('song:' || new.song_id, 0));

  select library_id into v_bundle_library_id
  from public.song_share_bundles
  where id = new.bundle_id
  for key share;

  select library_id into v_song_library_id
  from public.songs
  where id = new.song_id
  for key share;

  if v_song_library_id is null then
    raise exception 'Bundle song not found';
  end if;
  if v_bundle_library_id is null or v_bundle_library_id <> v_song_library_id then
    raise exception 'A shared song bundle may only contain songs from its library';
  end if;
  return new;
end;
$$;

drop trigger if exists song_share_bundle_items_lock_song on public.song_share_bundle_items;
create trigger song_share_bundle_items_lock_song
before insert or update of bundle_id, song_id on public.song_share_bundle_items
for each row execute function public.lock_bundle_item_song();

create or replace function public.lock_setlist_song_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended('song:' || new.song_id, 0));
  perform 1 from public.songs where id = new.song_id for key share;
  if not found then
    raise exception 'Setlist song source not found';
  end if;
  return new;
end;
$$;

drop trigger if exists setlist_songs_lock_song on public.setlist_songs;
create trigger setlist_songs_lock_song
before insert or update of song_id on public.setlist_songs
for each row execute function public.lock_setlist_song_reference();

create or replace function public.protect_team_song_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  select kind into v_kind
  from public.libraries
  where id = old.library_id;

  if v_kind is distinct from 'team' then
    return old;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended('song:' || old.id, 0));

  if old.archived_at is null then
    raise exception 'Team song % must be archived before permanent deletion', old.id;
  end if;

  if exists (
    select 1 from public.setlist_songs ss where ss.song_id = old.id
  ) then
    raise exception 'Team song % is still referenced by a setlist', old.id;
  end if;

  if exists (
    select 1
    from public.share_links link
    where link.resource_type = 'song'
      and link.resource_id = old.id
      and link.revoked_at is null
      and (link.expires_at is null or link.expires_at > now())
  ) then
    raise exception 'Team song % still has an active share link', old.id;
  end if;

  if exists (
    select 1
    from public.song_share_bundle_items item
    join public.share_links link
      on link.resource_type = 'song_bundle'
     and link.resource_id = item.bundle_id
     and link.revoked_at is null
     and (link.expires_at is null or link.expires_at > now())
    where item.song_id = old.id
  ) then
    raise exception 'Team song % is still referenced by an active shared bundle', old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists songs_protect_team_references on public.songs;
create trigger songs_protect_team_references
before delete on public.songs
for each row execute function public.protect_team_song_references();

create or replace function public.archive_team_songs(
  p_team_library_id text,
  p_song_ids text[],
  p_archived boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_kind text;
  v_song_ids text[];
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_archived is null then
    raise exception 'p_archived is required';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_song_ids, '{}'::text[])) song_id
    where song_id is null or btrim(song_id) = ''
  ) then
    raise exception 'Every song id must be non-empty';
  end if;

  select coalesce(array_agg(song_id order by first_ordinality), '{}'::text[])
  into v_song_ids
  from (
    select song_id, min(ordinality) as first_ordinality
    from unnest(coalesce(p_song_ids, '{}'::text[])) with ordinality input(song_id, ordinality)
    group by song_id
  ) deduplicated;

  if cardinality(v_song_ids) > 500 then
    raise exception 'At most 500 songs may be archived at once';
  end if;
  if cardinality(v_song_ids) = 0 then
    return jsonb_build_object(
      'archivedCount', 0,
      'changedCount', 0,
      'songIds', '[]'::jsonb,
      'archived', p_archived
    );
  end if;

  select kind into v_team_kind
  from public.libraries
  where id = p_team_library_id
  for update;

  if v_team_kind <> 'team' or not public.can_edit_library_content(p_team_library_id) then
    raise exception 'Access denied';
  end if;

  if (
    select count(*)
    from public.songs
    where library_id = p_team_library_id
      and id = any(v_song_ids)
  ) <> cardinality(v_song_ids) then
    raise exception 'One or more songs do not belong to the target team library';
  end if;

  update public.songs
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      archived_by = case when p_archived then v_user_id else null end,
      updated_by = v_user_id,
      updated_at = now()
  where library_id = p_team_library_id
    and id = any(v_song_ids);
  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'archivedCount', v_count,
    'changedCount', v_count,
    'songIds', to_jsonb(v_song_ids),
    'archived', p_archived
  );
end;
$$;

create or replace function public.delete_team_songs(
  p_team_library_id text,
  p_song_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_kind text;
  v_song_ids text[];
  v_song_id text;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_song_ids, '{}'::text[])) song_id
    where song_id is null or btrim(song_id) = ''
  ) then
    raise exception 'Every song id must be non-empty';
  end if;

  -- All callers acquire advisory locks in the same order to avoid deadlocks
  -- with bundle/share-link transactions.
  select coalesce(array_agg(song_id order by song_id), '{}'::text[])
  into v_song_ids
  from (
    select distinct song_id
    from unnest(coalesce(p_song_ids, '{}'::text[])) with ordinality input(song_id, ordinality)
  ) deduplicated;

  if cardinality(v_song_ids) > 500 then
    raise exception 'At most 500 songs may be deleted at once';
  end if;
  if cardinality(v_song_ids) = 0 then
    return jsonb_build_object('deletedCount', 0, 'songIds', '[]'::jsonb);
  end if;

  -- Acquire the graph gate before library, song, share-link, or reference-row
  -- locks. Statement-level triggers use the same gate for raw multi-row DML.
  perform pg_advisory_xact_lock(
    hashtextextended('chordmaster:song-reference-graph:v1', 0)
  );

  select kind into v_team_kind
  from public.libraries
  where id = p_team_library_id
  for update;

  if v_team_kind <> 'team' or not public.can_edit_library_content(p_team_library_id) then
    raise exception 'Access denied';
  end if;

  if (
    select count(*)
    from public.songs
    where library_id = p_team_library_id
      and id = any(v_song_ids)
      and archived_at is not null
  ) <> cardinality(v_song_ids) then
    raise exception 'Every permanently deleted team song must already be archived';
  end if;

  -- Match the locks taken by direct song-share and bundle-item inserts. The
  -- reference checks below then observe a fully serialized state.
  foreach v_song_id in array v_song_ids
  loop
    perform pg_advisory_xact_lock(hashtextextended('song:' || v_song_id, 0));
  end loop;

  if exists (
    select 1
    from public.setlist_songs ss
    where ss.song_id = any(v_song_ids)
  ) then
    raise exception 'One or more songs are still referenced by a setlist';
  end if;

  if exists (
    select 1
    from public.share_links link
    where link.resource_type = 'song'
      and link.resource_id = any(v_song_ids)
      and link.revoked_at is null
      and (link.expires_at is null or link.expires_at > now())
  ) then
    raise exception 'One or more songs still have an active share link';
  end if;

  if exists (
    select 1
    from public.song_share_bundle_items item
    join public.share_links link
      on link.resource_type = 'song_bundle'
     and link.resource_id = item.bundle_id
     and link.revoked_at is null
     and (link.expires_at is null or link.expires_at > now())
    where item.song_id = any(v_song_ids)
  ) then
    raise exception 'One or more songs are still referenced by an active shared bundle';
  end if;

  -- Expired/revoked direct links are no longer useful and otherwise become
  -- dangling resource ids because share_links intentionally has no polymorphic FK.
  delete from public.share_links
  where resource_type = 'song'
    and resource_id = any(v_song_ids)
    and (
      revoked_at is not null
      or (expires_at is not null and expires_at <= now())
    );

  delete from public.songs
  where library_id = p_team_library_id
    and id = any(v_song_ids);
  get diagnostics v_count = row_count;

  if v_count <> cardinality(v_song_ids) then
    raise exception 'The team-song delete did not remove the complete requested batch';
  end if;

  return jsonb_build_object(
    'deletedCount', v_count,
    'songIds', to_jsonb(v_song_ids)
  );
end;
$$;

revoke all on function public.enforce_library_row_integrity() from public;
revoke all on function public.enforce_song_row_integrity() from public;
revoke all on function public.enforce_setlist_row_integrity() from public;
revoke all on function public.enforce_project_row_integrity() from public;
revoke all on function public.enforce_setlist_song_library() from public;
revoke all on function public.enforce_setlist_project_scope() from public;
revoke all on function public.enforce_assignment_member_role() from public;
revoke all on function public.cleanup_invalid_setlist_assignments() from public;
revoke all on function public.enforce_team_song_import_integrity() from public;
revoke all on function public.lock_song_reference_graph_statement() from public;
revoke all on function public.lock_share_link_resource() from public;
revoke all on function public.lock_bundle_item_song() from public;
revoke all on function public.lock_setlist_song_reference() from public;
revoke all on function public.protect_team_song_references() from public;
revoke all on function public.clone_team_import_song_content(jsonb) from public;
revoke all on function public.reuse_team_song_structure_ids(jsonb, jsonb) from public;
revoke all on function public.can_manage_setlist_assignments(text) from public;
revoke all on function public.can_write_setlist(text) from public;

revoke all on function public.can_write_project(text) from public;
revoke all on function public.can_manage_project(text) from public;
grant execute on function public.can_write_project(text) to authenticated;
grant execute on function public.can_manage_project(text) to authenticated;
grant execute on function public.can_manage_setlist_assignments(text) to authenticated;
grant execute on function public.can_write_setlist(text) to authenticated;

revoke all on function public.get_setlist_editor_assignments(text) from public;
revoke all on function public.set_setlist_editor_assignment(text, uuid, boolean) from public;
revoke all on function public.inspect_team_song_import(text, text[]) from public;
revoke all on function public.import_personal_songs_to_team(text, jsonb) from public;
revoke all on function public.archive_team_songs(text, text[], boolean) from public;
revoke all on function public.delete_team_songs(text, text[]) from public;
revoke all on function public.create_team_invite(text, text) from public;

grant execute on function public.get_setlist_editor_assignments(text) to authenticated;
grant execute on function public.set_setlist_editor_assignment(text, uuid, boolean) to authenticated;
grant execute on function public.inspect_team_song_import(text, text[]) to authenticated;
grant execute on function public.import_personal_songs_to_team(text, jsonb) to authenticated;
grant execute on function public.archive_team_songs(text, text[], boolean) to authenticated;
grant execute on function public.delete_team_songs(text, text[]) to authenticated;
grant execute on function public.create_team_invite(text, text) to authenticated;

-- The compatible frontend subscribes before final hardening is deployed.
alter table public.library_members replica identity full;
alter table public.setlist_editor_assignments replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'songs'
    ) then
      execute 'alter publication supabase_realtime add table public.songs';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'library_members'
    ) then
      execute 'alter publication supabase_realtime add table public.library_members';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'setlist_editor_assignments'
    ) then
      execute 'alter publication supabase_realtime add table public.setlist_editor_assignments';
    end if;
  end if;
end;
$$;
