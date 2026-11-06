-- Personal browse state only. No source song, setlist or library content is changed.
create table public.song_library_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id text not null references public.libraries(id) on delete cascade,
  song_id text not null references public.songs(id) on delete cascade,
  favorite boolean not null default false,
  favorite_at bigint not null default 0 check (favorite_at >= 0),
  last_used_at bigint not null default 0 check (last_used_at >= 0),
  primary key (user_id, library_id, song_id)
);
create index song_library_preferences_song_idx on public.song_library_preferences(song_id);
create index song_library_preferences_recent_idx on public.song_library_preferences(user_id, library_id, last_used_at desc);
alter table public.song_library_preferences enable row level security;
revoke all on public.song_library_preferences from public, anon, authenticated;
grant select, insert, update on public.song_library_preferences to authenticated;
grant all on public.song_library_preferences to service_role;
create policy song_library_preferences_self on public.song_library_preferences
for all to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.songs s where s.id = song_id and s.library_id = song_library_preferences.library_id
))
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.songs s where s.id = song_id and s.library_id = song_library_preferences.library_id
));

-- Merge each field separately: opening a song cannot reset a favorite, and an
-- older offline operation cannot replace a more recent favorite decision.
-- INVOKER preserves song visibility and own-row RLS for reads AND writes.
create function public.sync_song_library_preferences(p_user_id uuid, p_library_id text, p_changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  change jsonb;
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_favorite_at bigint;
  v_used_at bigint;
  result jsonb;
  applied jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Account changed or unauthenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 100 then
    raise exception 'Expected at most 100 changes' using errcode = '22023';
  end if;
  for change in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    -- Do not acknowledge absent songs: a new local song may not have uploaded yet.
    if not exists (select 1 from public.songs s where s.id = change->>'id' and s.library_id = p_library_id) then continue; end if;
    if (change ? 'favorite' and (jsonb_typeof(change->'favorite') <> 'boolean' or coalesce(change->>'favoriteAt','') !~ '^[0-9]{1,16}$'))
      or (change ? 'usedAt' and coalesce(change->>'usedAt','') !~ '^[0-9]{1,16}$') then
      raise exception 'Invalid preference change' using errcode = '22023';
    end if;
    v_favorite_at := case when change ? 'favorite' then least((change->>'favoriteAt')::bigint, v_now + 60000) else 0 end;
    v_used_at := case when change ? 'usedAt' then least((change->>'usedAt')::bigint, v_now + 60000) else 0 end;
    insert into public.song_library_preferences as current (user_id, library_id, song_id, favorite, favorite_at, last_used_at)
    values (p_user_id, p_library_id, change->>'id', coalesce((change->>'favorite')::boolean,false), v_favorite_at, v_used_at)
    on conflict (user_id, library_id, song_id) do update set
      favorite = case when excluded.favorite_at > current.favorite_at then excluded.favorite else current.favorite end,
      favorite_at = greatest(current.favorite_at, excluded.favorite_at),
      last_used_at = greatest(current.last_used_at, excluded.last_used_at);
    applied := applied || jsonb_build_array(change->>'id');
  end loop;
  select jsonb_build_object(
    'applied', applied,
    'clock', greatest(v_now, coalesce((select max(greatest(favorite_at,last_used_at)) from public.song_library_preferences where user_id = p_user_id and library_id = p_library_id),0)),
    'favoriteStates', coalesce((select jsonb_agg(jsonb_build_array(song_id,favorite,favorite_at) order by song_id) from public.song_library_preferences where user_id = p_user_id and library_id = p_library_id),'[]'::jsonb),
    'favorites', coalesce((select jsonb_agg(song_id order by song_id) from public.song_library_preferences where user_id = p_user_id and library_id = p_library_id and favorite), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', song_id, 'at', last_used_at) order by last_used_at desc, song_id) from (
      select song_id, last_used_at from public.song_library_preferences where user_id = p_user_id and library_id = p_library_id and last_used_at > 0 order by last_used_at desc, song_id limit 100
    ) recent), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.sync_song_library_preferences(uuid,text,jsonb) from public, anon;
grant execute on function public.sync_song_library_preferences(uuid,text,jsonb) to authenticated;
