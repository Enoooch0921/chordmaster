\set ON_ERROR_STOP on

-- Run on a disposable database after 20260801090000 and before
-- 20260801100000. This seeds legacy suffixes before applying hardening so the
-- one-time cleanup and its rollback evidence are tested in the right order.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

insert into auth.users (
  id, email, aud, role, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  'cleanup-owner@test.local',
  'authenticated',
  'authenticated',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles(id, email, display_name)
values (
  '20000000-0000-0000-0000-000000000001',
  'cleanup-owner@test.local',
  'Cleanup Owner'
)
on conflict (id) do nothing;

insert into public.libraries(id, name, kind, owner_user_id)
values (
  'cleanup-team',
  'Cleanup Team',
  'team',
  '20000000-0000-0000-0000-000000000001'
);

insert into public.library_members(library_id, user_id, role)
values (
  'cleanup-team',
  '20000000-0000-0000-0000-000000000001',
  'owner'
);

insert into public.songs(
  id, library_id, title, content_json, created_by, updated_by
)
values
  (
    'cleanup-song-zh',
    'cleanup-team',
    '原歌名 (個人匯入) 2',
    '{"id":"cleanup-song-zh","title":"原歌名 (個人匯入) 2","sections":[]}'::jsonb,
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    'cleanup-song-en',
    'cleanup-team',
    'Original Name (Personal import 3)',
    '{"id":"cleanup-song-en","title":"Original Name (Personal import 3)","sections":[]}'::jsonb,
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001'
  );

insert into public.setlists(
  id, library_id, name, display_mode, show_lyrics, created_by, updated_by
)
values (
  'cleanup-setlist',
  'cleanup-team',
  'Cleanup Setlist',
  'full',
  false,
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
);

insert into public.setlist_songs(id, setlist_id, song_id, override_json)
values (
  'cleanup-setlist-song',
  'cleanup-setlist',
  'cleanup-song-zh',
  '{"overrideKey":"D","songData":{"id":"cleanup-song-zh","title":"原歌名 (個人匯入) 2","sections":[]}}'::jsonb
);

\ir ../migrations/20260801100000_team_library_hardening.sql

select pg_temp.assert_true(
  (select title from public.songs where id='cleanup-song-zh') = '原歌名'
  and (select content_json ->> 'title' from public.songs where id='cleanup-song-zh') = '原歌名',
  'Chinese legacy suffix and trailing number are removed from row and content JSON'
);

select pg_temp.assert_true(
  (select title from public.songs where id='cleanup-song-en') = 'Original Name'
  and (select content_json ->> 'title' from public.songs where id='cleanup-song-en') = 'Original Name',
  'English legacy suffix and embedded number are removed from row and content JSON'
);

select pg_temp.assert_true(
  (
    select override_json #>> '{songData,title}'
    from public.setlist_songs
    where id='cleanup-setlist-song'
  ) = '原歌名',
  'setlist-specific songData title is cleaned without replacing the override'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.team_song_legacy_title_cleanup_log log
    where log.migration_key='20260801100000_team_library_hardening'
      and log.song_id='cleanup-song-zh'
      and log.old_title='原歌名 (個人匯入) 2'
      and log.new_title='原歌名'
      and log.old_content_json ->> 'title'='原歌名 (個人匯入) 2'
      and log.new_content_json ->> 'title'='原歌名'
      and log.setlist_overrides #>> '{0,oldOverrideJson,songData,title}'='原歌名 (個人匯入) 2'
      and log.setlist_overrides #>> '{0,newOverrideJson,songData,title}'='原歌名'
  ),
  'cleanup log preserves deterministic song and setlist before/after values'
);

select pg_temp.assert_true(
  (
    select count(*)
    from public.team_song_legacy_title_cleanup_log
    where migration_key='20260801100000_team_library_hardening'
      and library_id='cleanup-team'
  ) = 2,
  'every cleaned team song receives exactly one rollback log row'
);

rollback;

\echo 'team_library_cleanup_migration.sql: all assertions passed'
