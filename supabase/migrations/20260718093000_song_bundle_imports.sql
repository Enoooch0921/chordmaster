-- Importable single-song and multi-song share links.

alter table public.share_links
  drop constraint if exists share_links_resource_type_check;
alter table public.share_links
  add constraint share_links_resource_type_check
  check (resource_type in ('song', 'song_bundle', 'setlist', 'project'));

create table if not exists public.song_share_bundles (
  id text primary key,
  library_id text not null references public.libraries(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.song_share_bundle_items (
  bundle_id text not null references public.song_share_bundles(id) on delete cascade,
  song_id text not null references public.songs(id) on delete cascade,
  order_index integer not null,
  primary key (bundle_id, song_id),
  unique (bundle_id, order_index)
);

create table if not exists public.song_share_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_song_id text not null,
  imported_song_id text not null references public.songs(id) on delete cascade,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, source_song_id),
  unique (imported_song_id)
);

create index if not exists song_share_bundle_items_bundle_idx
  on public.song_share_bundle_items(bundle_id, order_index);
create index if not exists song_share_imports_user_idx
  on public.song_share_imports(user_id);

alter table public.song_share_bundles enable row level security;
alter table public.song_share_bundle_items enable row level security;
alter table public.song_share_imports enable row level security;

drop policy if exists "song_share_bundles_creator_select" on public.song_share_bundles;
create policy "song_share_bundles_creator_select" on public.song_share_bundles
for select using (created_by = auth.uid());

drop policy if exists "song_share_bundle_items_creator_select" on public.song_share_bundle_items;
create policy "song_share_bundle_items_creator_select" on public.song_share_bundle_items
for select using (
  exists (
    select 1
    from public.song_share_bundles bundle
    where bundle.id = bundle_id
      and bundle.created_by = auth.uid()
  )
);

drop policy if exists "song_share_imports_self_select" on public.song_share_imports;
create policy "song_share_imports_self_select" on public.song_share_imports
for select using (user_id = auth.uid());

create or replace function public.clone_shared_song_content(p_content jsonb)
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

create or replace function public.inspect_shared_song_import(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_resource_type text;
  v_resource_id text;
  v_personal_library_id text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  select resource_type, resource_id
    into v_resource_type, v_resource_id
  from public.share_links
  where token = p_token
    and resource_type in ('song', 'song_bundle')
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_resource_id is null then
    raise exception 'Invalid or expired song share link';
  end if;

  select id into v_personal_library_id
  from public.libraries
  where owner_user_id = v_user_id and kind = 'personal'
  order by created_at asc
  limit 1;

  with source_ids as (
    select v_resource_id as song_id, 0 as order_index
    where v_resource_type = 'song'
    union all
    select item.song_id, item.order_index
    from public.song_share_bundle_items item
    where v_resource_type = 'song_bundle'
      and item.bundle_id = v_resource_id
  ), source_rows as (
    select source_ids.order_index, song.id, song.title, song.library_id
    from source_ids
    join public.songs song on song.id = source_ids.song_id
  ), inspected as (
    select
      source_rows.order_index,
      source_rows.id as source_song_id,
      source_rows.title,
      coalesce(
        case when source_rows.library_id = v_personal_library_id then source_rows.id end,
        imported.id
      ) as existing_song_id,
      coalesce(
        case when source_rows.library_id = v_personal_library_id then source_rows.title end,
        imported.title
      ) as existing_title
    from source_rows
    left join public.song_share_imports import_map
      on import_map.user_id = v_user_id
      and import_map.source_song_id = source_rows.id
    left join public.songs imported
      on imported.id = import_map.imported_song_id
      and imported.library_id = v_personal_library_id
  )
  select jsonb_build_object(
    'songs', coalesce(jsonb_agg(jsonb_build_object(
      'sourceSongId', source_song_id,
      'title', title,
      'existingSongId', existing_song_id,
      'existingTitle', existing_title
    ) order by order_index), '[]'::jsonb),
    'conflictCount', count(*) filter (where existing_song_id is not null)
  ) into v_result
  from inspected;

  if jsonb_array_length(v_result -> 'songs') = 0 then
    raise exception 'The shared songs are no longer available';
  end if;

  return v_result;
end;
$$;

create or replace function public.import_shared_songs(
  p_token text,
  p_default_resolution text default 'duplicate',
  p_resolutions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_resource_type text;
  v_resource_id text;
  v_personal_library_id text;
  v_library_name text;
  v_source record;
  v_resolution text;
  v_target_song_id text;
  v_content jsonb;
  v_existing_created_at jsonb;
  v_now_ms bigint;
  v_created_count integer := 0;
  v_duplicated_count integer := 0;
  v_overwritten_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;
  if p_default_resolution not in ('duplicate', 'overwrite') then
    raise exception 'Invalid import resolution';
  end if;
  if jsonb_typeof(coalesce(p_resolutions, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid per-song resolutions';
  end if;

  select resource_type, resource_id
    into v_resource_type, v_resource_id
  from public.share_links
  where token = p_token
    and resource_type in ('song', 'song_bundle')
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_resource_id is null then
    raise exception 'Invalid or expired song share link';
  end if;

  select id into v_personal_library_id
  from public.libraries
  where owner_user_id = v_user_id and kind = 'personal'
  order by created_at asc
  limit 1;

  if v_personal_library_id is null then
    v_personal_library_id := gen_random_uuid()::text;
    select coalesce(nullif(display_name, ''), nullif(email, ''), 'Personal') || '''s Library'
      into v_library_name
    from public.profiles
    where id = v_user_id;
    v_library_name := coalesce(
      v_library_name,
      coalesce(nullif(auth.jwt() ->> 'email', ''), 'Personal') || '''s Library'
    );
    insert into public.libraries (id, name, kind, owner_user_id)
    values (v_personal_library_id, v_library_name, 'personal', v_user_id);
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (v_personal_library_id, v_user_id, 'owner')
  on conflict (library_id, user_id) do update set role = 'owner';

  for v_source in
    with source_ids as (
      select v_resource_id as song_id, 0 as order_index
      where v_resource_type = 'song'
      union all
      select item.song_id, item.order_index
      from public.song_share_bundle_items item
      where v_resource_type = 'song_bundle'
        and item.bundle_id = v_resource_id
    )
    select
      source_ids.order_index,
      source_song.id as source_song_id,
      source_song.title,
      source_song.content_json,
      source_song.library_id,
      coalesce(
        case when source_song.library_id = v_personal_library_id then source_song.id end,
        imported.id
      ) as existing_song_id
    from source_ids
    join public.songs source_song on source_song.id = source_ids.song_id
    left join public.song_share_imports import_map
      on import_map.user_id = v_user_id
      and import_map.source_song_id = source_song.id
    left join public.songs imported
      on imported.id = import_map.imported_song_id
      and imported.library_id = v_personal_library_id
    order by source_ids.order_index
  loop
    v_resolution := coalesce(p_resolutions ->> v_source.source_song_id, p_default_resolution);
    if v_resolution not in ('duplicate', 'overwrite') then
      raise exception 'Invalid import resolution for song %', v_source.source_song_id;
    end if;
    v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    v_content := public.clone_shared_song_content(v_source.content_json) - 'teamSource';
    v_content := jsonb_set(v_content, '{title}', to_jsonb(v_source.title), true);

    if v_source.existing_song_id is not null and v_resolution = 'overwrite' then
      v_target_song_id := v_source.existing_song_id;
      if v_target_song_id = v_source.source_song_id then
        v_overwritten_count := v_overwritten_count + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'sourceSongId', v_source.source_song_id,
          'songId', v_target_song_id,
          'action', 'overwritten'
        ));
        continue;
      end if;

      select coalesce(
        content_json -> 'createdAt',
        to_jsonb(floor(extract(epoch from created_at) * 1000)::bigint)
      )
        into v_existing_created_at
      from public.songs
      where id = v_target_song_id
        and library_id = v_personal_library_id
      for update;

      if found then
        v_content := jsonb_set(v_content, '{id}', to_jsonb(v_target_song_id), true);
        v_content := jsonb_set(v_content, '{updatedAt}', to_jsonb(v_now_ms), true);
        v_content := jsonb_set(v_content, '{createdAt}', v_existing_created_at, true);
        update public.songs
        set title = v_source.title,
            content_json = v_content,
            updated_by = v_user_id,
            updated_at = now()
        where id = v_target_song_id
          and library_id = v_personal_library_id;

        v_overwritten_count := v_overwritten_count + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'sourceSongId', v_source.source_song_id,
          'songId', v_target_song_id,
          'action', 'overwritten'
        ));
        continue;
      end if;

      -- The receiver may have deleted the mapped copy while this import was
      -- starting. Treat that race exactly like a first import and recreate the
      -- canonical mapping below.
      v_source.existing_song_id := null;
    end if;

    v_target_song_id := gen_random_uuid()::text;
    v_content := jsonb_set(v_content, '{id}', to_jsonb(v_target_song_id), true);
    v_content := jsonb_set(v_content, '{createdAt}', to_jsonb(v_now_ms), true);
    v_content := jsonb_set(v_content, '{updatedAt}', to_jsonb(v_now_ms), true);
    insert into public.songs (
      id, library_id, title, content_json, created_by, updated_by, created_at, updated_at
    ) values (
      v_target_song_id,
      v_personal_library_id,
      v_source.title,
      v_content,
      v_user_id,
      v_user_id,
      now(),
      now()
    );

    if v_source.existing_song_id is null then
      insert into public.song_share_imports (
        user_id, source_song_id, imported_song_id, imported_at, updated_at
      ) values (
        v_user_id, v_source.source_song_id, v_target_song_id, now(), now()
      )
      on conflict (user_id, source_song_id) do update
        set imported_song_id = excluded.imported_song_id,
            imported_at = excluded.imported_at,
            updated_at = excluded.updated_at;
      v_created_count := v_created_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'sourceSongId', v_source.source_song_id,
        'songId', v_target_song_id,
        'action', 'created'
      ));
    else
      v_duplicated_count := v_duplicated_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'sourceSongId', v_source.source_song_id,
        'songId', v_target_song_id,
        'action', 'duplicated'
      ));
    end if;
  end loop;

  if jsonb_array_length(v_results) = 0 then
    raise exception 'The shared songs are no longer available';
  end if;

  return jsonb_build_object(
    'createdCount', v_created_count,
    'duplicatedCount', v_duplicated_count,
    'overwrittenCount', v_overwritten_count,
    'songs', v_results
  );
end;
$$;

revoke all on function public.clone_shared_song_content(jsonb) from public;
revoke all on function public.inspect_shared_song_import(text) from public;
revoke all on function public.import_shared_songs(text, text, jsonb) from public;
grant execute on function public.inspect_shared_song_import(text) to authenticated;
grant execute on function public.import_shared_songs(text, text, jsonb) to authenticated;
