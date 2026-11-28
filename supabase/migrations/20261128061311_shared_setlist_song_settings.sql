-- Shared managers can change the performance copy through a field-scoped RPC.
-- Keep the underlying library song, chart sections and entry order untouched.
create function chordmaster_private.apply_shared_setlist_song_settings(p_song jsonb, p_settings jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  field text;
  value jsonb;
  step jsonb;
  merged jsonb := p_song;
begin
  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'Invalid song settings' using errcode = '22023';
  end if;

  for field, value in select * from jsonb_each(p_settings) loop
    case field
      when 'title', 'timeSignature' then
        if jsonb_typeof(value) <> 'string' then
          raise exception 'Invalid song settings' using errcode = '22023';
        end if;
      when 'lyricist', 'composer', 'translator', 'groove' then
        if jsonb_typeof(value) not in ('string', 'null') then
          raise exception 'Invalid song settings' using errcode = '22023';
        end if;
      when 'originalKeyUnspecified', 'timeSignatureUnspecified', 'shuffle', 'showSongMap' then
        if jsonb_typeof(value) not in ('boolean', 'null') then
          raise exception 'Invalid song settings' using errcode = '22023';
        end if;
      when 'tempo' then
        if value <> 'null'::jsonb and (
          jsonb_typeof(value) <> 'number' or value < '20'::jsonb or value > '400'::jsonb
        ) then
          raise exception 'Invalid tempo' using errcode = '22023';
        end if;
      when 'setlistSongMap' then
        if value <> 'null'::jsonb then
          if jsonb_typeof(value) <> 'array' or value = '[]'::jsonb then
            raise exception 'Invalid song map' using errcode = '22023';
          end if;
          for step in select jsonb_array_elements(value) loop
            if jsonb_typeof(step) is distinct from 'object'
              or jsonb_typeof(step->'label') is distinct from 'string'
              or btrim(step->>'label') = ''
              or jsonb_typeof(step->'repeats') is distinct from 'number'
              or not (step->>'repeats' ~ '^[1-9][0-9]*$')
              or step->'repeats' > '9007199254740991'::jsonb then
              raise exception 'Invalid song map' using errcode = '22023';
            end if;
          end loop;
        end if;
      else raise exception 'Invalid song settings field' using errcode = '22023';
    end case;

    if value = 'null'::jsonb then
      merged := merged - field;
    else
      merged := jsonb_set(merged, array[field], value);
    end if;
  end loop;
  return merged;
end;
$$;
revoke all on function chordmaster_private.apply_shared_setlist_song_settings(jsonb, jsonb)
  from public, anon, authenticated;

create function public.save_shared_setlist_song_settings(p_setlist_id text, p_entry_id text, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  parent public.setlists;
  entry public.setlist_songs;
  previous_score jsonb;
  next_score jsonb;
begin
  if auth.uid() is null or not chordmaster_private.can_arrange_shared_setlist(p_setlist_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chordmaster:song-reference-graph:v1', 0));
  select * into parent from public.setlists
  where id = p_setlist_id and not coalesce(archived, false) for update;
  if not found or not chordmaster_private.can_arrange_shared_setlist(p_setlist_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into entry from public.setlist_songs
  where id = p_entry_id and setlist_id = p_setlist_id for update;
  if not found then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  previous_score := entry.override_json->'songData';
  if jsonb_typeof(previous_score) is distinct from 'object' then
    select content_json into previous_score from public.songs where id = entry.song_id;
  end if;
  if jsonb_typeof(previous_score) is distinct from 'object' then
    raise exception 'Song is unavailable';
  end if;

  next_score := chordmaster_private.apply_shared_setlist_song_settings(previous_score, p_settings);
  if next_score = previous_score then
    return previous_score;
  end if;

  update public.setlist_songs
  set override_json = coalesce(entry.override_json, '{}'::jsonb) || jsonb_build_object(
    'songData', next_score, 'sharedSongSettings', p_settings, 'expectedTeamRole', 'setlist_manager'
  )
  where id = entry.id and setlist_id = parent.id
  returning override_json->'songData' into next_score;
  update public.setlists set updated_at = now(), updated_by = auth.uid() where id = parent.id;
  return next_score;
end;
$$;
revoke all on function public.save_shared_setlist_song_settings(text, text, jsonb) from public, anon;
grant execute on function public.save_shared_setlist_song_settings(text, text, jsonb) to authenticated;

-- An account can hold both a team arrangement role and a direct or inherited
-- sharing grant. Honor the latter for the validated patch on this entry.
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
  v_settings jsonb := new.override_json->'sharedSongSettings';
  v_score jsonb;
  v_sections jsonb;
  v_existing_insert boolean := false;
begin
  new.override_json := new.override_json - 'sharedSongSettings';
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
    if v_settings is not null and chordmaster_private.can_arrange_shared_setlist(old.setlist_id) then
      v_score := old.override_json->'songData';
      if jsonb_typeof(v_score) is distinct from 'object' then
        select content_json into v_score from public.songs where id = old.song_id;
      end if;
      if jsonb_typeof(v_score) is distinct from 'object' then
        raise exception 'Song is unavailable';
      end if;
      v_protected := coalesce(v_protected, '{}'::jsonb) || jsonb_build_object(
        'songData', chordmaster_private.apply_shared_setlist_song_settings(v_score, v_settings)
      );
    end if;
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
