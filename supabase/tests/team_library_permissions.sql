\set ON_ERROR_STOP on

-- Run against a disposable local Supabase database after all migrations:
--   psql "$LOCAL_DB_URL" -f supabase/tests/team_library_permissions.sql
-- The whole fixture is rolled back. Never run this file against production.

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

create or replace function pg_temp.expect_error(p_sql text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION FAILED (expected error): %', p_message;
end;
$$;

-- Stable UUIDs make failed assertions easy to reproduce.
insert into auth.users (
  id, email, aud, role, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'editor@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'manager@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000005', 'editor2@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000006', 'outsider@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'editor@test.local', 'Editor'),
  ('00000000-0000-0000-0000-000000000003', 'manager@test.local', 'Setlist Editor'),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local', 'Viewer'),
  ('00000000-0000-0000-0000-000000000005', 'editor2@test.local', 'Editor Two'),
  ('00000000-0000-0000-0000-000000000006', 'outsider@test.local', 'Outsider')
on conflict (id) do nothing;

insert into public.libraries (id, name, kind, owner_user_id)
values
  ('test-team-a', 'Team A', 'team', '00000000-0000-0000-0000-000000000001'),
  ('test-team-b', 'Team B', 'team', '00000000-0000-0000-0000-000000000006'),
  ('test-personal-owner', 'Owner Personal', 'personal', '00000000-0000-0000-0000-000000000001'),
  ('test-personal-editor', 'Editor Personal', 'personal', '00000000-0000-0000-0000-000000000002'),
  ('test-personal-outsider', 'Outsider Personal', 'personal', '00000000-0000-0000-0000-000000000006');

insert into public.library_members (library_id, user_id, role)
values
  ('test-team-a', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('test-team-a', '00000000-0000-0000-0000-000000000002', 'editor'),
  ('test-team-a', '00000000-0000-0000-0000-000000000003', 'setlist_manager'),
  ('test-team-a', '00000000-0000-0000-0000-000000000004', 'viewer'),
  ('test-team-a', '00000000-0000-0000-0000-000000000005', 'editor'),
  ('test-team-b', '00000000-0000-0000-0000-000000000006', 'owner'),
  ('test-personal-editor', '00000000-0000-0000-0000-000000000002', 'owner'),
  ('test-personal-outsider', '00000000-0000-0000-0000-000000000006', 'owner');

select pg_temp.expect_error(
  $$insert into public.library_members(library_id,user_id,role)
    values ('test-team-a','00000000-0000-0000-0000-000000000006','owner')$$,
  'a second owner must violate the owner invariant'
);

insert into public.songs (
  id, library_id, title, content_json, created_by, updated_by, archived_at, archived_by
)
values
  ('source-a', 'test-personal-editor', 'Same Name', '{"id":"source-a","title":"Same Name","currentKey":"E","originalKey":"C","version":1,"lyricist":"Source Lyricist","composer":"Source Composer","sections":[{"id":"personal-section-v1","bars":[{"id":"personal-bar-v1"}]}]}', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', null, null),
  ('source-b', 'test-personal-editor', 'Legacy Song', '{"id":"source-b","title":"Legacy Song","sections":[]}', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', null, null),
  ('source-outsider', 'test-personal-outsider', 'Not Mine', '{"id":"source-outsider","title":"Not Mine","sections":[]}', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', null, null),
  ('team-legacy', 'test-team-a', 'Legacy Song', '{"id":"team-legacy","title":"Legacy Song","currentKey":"D","originalKey":"C","version":"Acoustic","lyricist":"Lyric Writer","composer":"Composer Name","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', null, null),
  ('team-archived', 'test-team-a', 'Archived', '{"id":"team-archived","title":"Archived","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-000000000001'),
  ('team-unarchived-delete', 'test-team-a', 'Must Archive First', '{"id":"team-unarchived-delete","title":"Must Archive First","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', null, null),
  ('team-reactivation', 'test-team-a', 'Reactivation Guard', '{"id":"team-reactivation","title":"Reactivation Guard","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-000000000001'),
  ('team-bundle-a', 'test-team-a', 'Bundle A', '{"id":"team-bundle-a","title":"Bundle A","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-000000000001'),
  ('team-bundle-b', 'test-team-a', 'Bundle B', '{"id":"team-bundle-b","title":"Bundle B","sections":[]}', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-000000000001'),
  ('other-team-song', 'test-team-b', 'Other', '{"id":"other-team-song","title":"Other","sections":[]}', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', null, null);

insert into public.projects (id, library_id, name, created_by, updated_by)
values
  ('project-owner', 'test-team-a', 'Owner Project', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('project-editor', 'test-team-a', 'Editor Project', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('project-viewer', 'test-team-a', 'Viewer Historic Project', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),
  ('project-other-team', 'test-team-b', 'Other Team Project', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006');

insert into public.setlists (
  id, library_id, name, display_mode, show_lyrics, project_id, created_by, updated_by
)
values
  ('setlist-owner', 'test-team-a', 'Owner Setlist', 'full', false, 'project-owner', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('setlist-owner-in-editor-project', 'test-team-a', 'Owner Setlist In Editor Project', 'full', false, 'project-editor', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('setlist-editor', 'test-team-a', 'Editor Setlist', 'full', false, 'project-editor', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('setlist-manager', 'test-team-a', 'Manager Setlist', 'full', false, null, '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
  ('setlist-viewer', 'test-team-a', 'Viewer Historic Setlist', 'full', false, null, '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004');

select pg_temp.expect_error(
  $$insert into public.setlist_songs(id,setlist_id,song_id)
    values ('cross-song','setlist-owner','other-team-song')$$,
  'cross-library setlist-song insertion must fail'
);
select pg_temp.expect_error(
  $$update public.setlists set project_id='project-other-team' where id='setlist-owner'$$,
  'cross-library project attachment must fail'
);
select pg_temp.expect_error(
  $$delete from public.libraries where id='test-team-a'$$,
  'even an administrative connection cannot cascade-delete a team library'
);
select pg_temp.assert_true(
  exists (select 1 from public.libraries where id='test-team-a'),
  'blocked administrative team-library deletion leaves the library intact'
);

-- Owner: all setlists/projects, and assignment management.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(public.can_write_setlist('setlist-editor'), 'owner writes every setlist');
select pg_temp.assert_true(public.can_manage_project('project-editor'), 'owner writes every project');
select pg_temp.expect_error(
  $$update public.libraries set kind='personal' where id='test-team-a'$$,
  'team owners cannot mutate library kind through the table API'
);
select pg_temp.expect_error(
  $$delete from public.libraries where id='test-team-a'$$,
  'team owners cannot directly cascade-delete their team library'
);
update public.library_members
set library_id = 'test-personal-owner'
where library_id = 'test-team-a'
  and user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  exists (
    select 1 from public.library_members
    where library_id='test-team-a'
      and user_id='00000000-0000-0000-0000-000000000001'
      and role='owner'
  )
  and not exists (
    select 1 from public.library_members
    where library_id='test-personal-owner'
      and user_id='00000000-0000-0000-0000-000000000001'
  ),
  'team owner membership is not eligible for the personal self-owner update policy'
);
update public.library_members
set role = 'editor'
where library_id = 'test-team-a'
  and user_id = '00000000-0000-0000-0000-000000000004';
select pg_temp.assert_true(
  (select role from public.library_members
   where library_id='test-team-a' and user_id='00000000-0000-0000-0000-000000000004') = 'viewer',
  'team owner cannot bypass membership RPC with a direct update'
);
select pg_temp.expect_error(
  $$insert into public.library_members(library_id,user_id,role)
    values ('test-team-a','00000000-0000-0000-0000-000000000006','editor')$$,
  'team owner cannot bypass membership RPC with a direct insert'
);
select public.set_setlist_editor_assignment('setlist-owner', '00000000-0000-0000-0000-000000000002', true);
select public.set_setlist_editor_assignment('setlist-owner', '00000000-0000-0000-0000-000000000005', true);
select public.set_setlist_editor_assignment('setlist-owner', '00000000-0000-0000-0000-000000000003', true);
select pg_temp.expect_error(
  $$select public.set_setlist_editor_assignment('setlist-owner','00000000-0000-0000-0000-000000000004',true)$$,
  'viewer is not assignable'
);
reset role;

-- Editor: own/assigned setlists and own projects only; imports are allowed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(public.can_write_setlist('setlist-owner'), 'assigned editor writes assigned setlist');
select pg_temp.assert_true(public.can_write_setlist('setlist-editor'), 'editor writes own setlist');
select pg_temp.assert_true(not public.can_write_setlist('setlist-manager'), 'editor cannot write unassigned foreign setlist');
select pg_temp.assert_true(public.can_manage_project('project-editor'), 'editor writes own project');
select pg_temp.assert_true(not public.can_manage_project('project-owner'), 'editor cannot write owner project');
select pg_temp.expect_error(
  $$update public.setlists
    set project_id='project-owner', updated_by='00000000-0000-0000-0000-000000000002'
    where id='setlist-editor'$$,
  'setlist creator cannot attach a setlist to an unowned same-team project'
);
select pg_temp.expect_error(
  $$update public.setlists
    set project_id=null, updated_by='00000000-0000-0000-0000-000000000002'
    where id='setlist-owner'$$,
  'assigned editor cannot remove a setlist from an unowned same-team project'
);
select pg_temp.expect_error(
  $$insert into public.setlists(
      id,library_id,name,display_mode,show_lyrics,project_id,created_by,updated_by
    ) values (
      'setlist-illegal-project','test-team-a','Illegal Project Setlist','full',false,
      'project-owner','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002'
    )$$,
  'non-owner cannot create a setlist inside an unowned same-team project'
);
update public.setlists
set project_id=null, updated_by='00000000-0000-0000-0000-000000000002'
where id='setlist-editor';
update public.setlists
set project_id='project-editor', updated_by='00000000-0000-0000-0000-000000000002'
where id='setlist-editor';
select pg_temp.assert_true(
  (select project_id from public.setlists where id='setlist-editor') = 'project-editor',
  'project creator may detach and reattach their own setlist'
);
select pg_temp.assert_true(
  not public.can_write_setlist('setlist-owner-in-editor-project'),
  'project creator does not inherit edit access to another creator''s setlist'
);
delete from public.projects where id='project-editor';
select pg_temp.assert_true(
  not exists (select 1 from public.projects where id='project-editor')
  and (select project_id is null from public.setlists where id='setlist-editor')
  and (select project_id is null from public.setlists where id='setlist-owner-in-editor-project'),
  'project creator deletion lets FK ON DELETE SET NULL detach every child setlist'
);
select pg_temp.expect_error(
  $$select public.update_team_member_role(
      'test-team-a','00000000-0000-0000-0000-000000000003','viewer'
    )$$,
  'song-library manager cannot change team member roles'
);
select pg_temp.expect_error(
  $$select public.remove_team_member(
      'test-team-a','00000000-0000-0000-0000-000000000003'
    )$$,
  'song-library manager cannot remove team members'
);
select pg_temp.expect_error(
  $$select public.create_team_invite('test-team-a','blocked-editor@test.local','viewer')$$,
  'song-library manager cannot invite team members'
);
update public.library_members
set role='viewer'
where library_id='test-team-a'
  and user_id='00000000-0000-0000-0000-000000000003';
delete from public.library_members
where library_id='test-team-a'
  and user_id='00000000-0000-0000-0000-000000000004';
select pg_temp.assert_true(
  (select role from public.library_members
   where library_id='test-team-a'
     and user_id='00000000-0000-0000-0000-000000000003') = 'setlist_manager'
  and exists (
    select 1 from public.library_members
    where library_id='test-team-a'
      and user_id='00000000-0000-0000-0000-000000000004'
      and role='viewer'
  ),
  'song-library manager raw member UPDATE and DELETE affect zero rows'
);
insert into public.songs(id,library_id,title,content_json,created_by,updated_by)
values (
  'team-editor-direct', 'test-team-a', 'Editor Direct',
  '{"id":"team-editor-direct","title":"Editor Direct","sections":[]}',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002'
);
select pg_temp.expect_error(
  $$update public.songs
    set library_id='test-personal-editor',
        updated_by='00000000-0000-0000-0000-000000000002'
    where id='team-editor-direct'$$,
  'team songs cannot be moved to a personal library before deletion'
);
select pg_temp.assert_true(
  (select library_id from public.songs where id='team-editor-direct')='test-team-a',
  'failed team-song relocation keeps the source library unchanged'
);
insert into public.share_links(resource_type,resource_id,token,created_by)
values ('setlist','setlist-owner','assigned-editor-token','00000000-0000-0000-0000-000000000002');

create temporary table import_results(payload jsonb) on commit drop;
grant all on import_results to authenticated;
insert into import_results
select public.import_personal_songs_to_team(
  'test-team-a',
  '[{"sourceSongId":"source-a","resolution":"create"}]'::jsonb
);
select pg_temp.assert_true(
  (select payload ->> 'createdCount' from import_results limit 1) = '1',
  'first import creates the primary copy'
);
select pg_temp.assert_true(
  (select payload #>> '{songs,0,title}' from import_results limit 1) = 'Same Name',
  'team import must keep the exact source title'
);

insert into import_results
select public.import_personal_songs_to_team(
  'test-team-a',
  '[{"sourceSongId":"source-a","resolution":"duplicate"}]'::jsonb
);
select pg_temp.assert_true(
  (select payload ->> 'duplicateCount' from import_results order by ctid desc limit 1) = '1',
  'duplicate creates an independent same-name copy'
);

select pg_temp.expect_error(
  $$select public.import_personal_songs_to_team(
      'test-team-a',
      '[{"sourceSongId":"source-b","resolution":"create"},{"sourceSongId":"source-outsider","resolution":"create"}]'::jsonb
    )$$,
  'mixed authorized/unauthorized import must fail atomically'
);
reset role;

create temporary table imported_structure_before on commit drop as
select
  tsi.team_song_id,
  song.content_json #>> '{sections,0,id}' as section_id,
  song.content_json #>> '{sections,0,bars,0,id}' as bar_id
from public.team_song_imports tsi
join public.songs song on song.id = tsi.team_song_id
where tsi.team_library_id = 'test-team-a'
  and tsi.source_song_id = 'source-a'
  and tsi.is_primary;

insert into public.setlist_songs(id, setlist_id, song_id, override_json)
select
  'imported-primary-reference',
  'setlist-owner',
  team_song_id,
  jsonb_build_object(
    'overrideKey', 'D',
    'sectionOrder', jsonb_build_array(section_id),
    'songData', jsonb_build_object('title', 'Setlist-specific title')
  )
from imported_structure_before;

update public.songs
set content_json = '{"id":"source-a","title":"Same Name","currentKey":"F","originalKey":"D","version":2,"lyricist":"Source Lyricist","composer":"Source Composer","sections":[{"id":"personal-section-v2","bars":[{"id":"personal-bar-v2"}]}]}'::jsonb,
    updated_by = '00000000-0000-0000-0000-000000000002'
where id = 'source-a';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select public.import_personal_songs_to_team(
  'test-team-a',
  '[{"sourceSongId":"source-a","resolution":"overwrite"}]'::jsonb
);
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from imported_structure_before before_ids
    join public.songs song on song.id = before_ids.team_song_id
    where song.content_json #>> '{sections,0,id}' = before_ids.section_id
      and song.content_json #>> '{sections,0,bars,0,id}' = before_ids.bar_id
      and song.content_json ->> 'version' = '2'
  ),
  'overwrite keeps target section/bar ids by index while replacing content'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.setlist_songs ss
    where ss.id = 'imported-primary-reference'
      and ss.override_json ->> 'overrideKey' = 'D'
      and ss.override_json #>> '{songData,title}' = 'Setlist-specific title'
      and ss.override_json #>> '{sectionOrder,0}' = (
        select section_id from imported_structure_before
      )
  ),
  'overwrite preserves the complete setlist override and sectionOrder pointer'
);

select pg_temp.assert_true(
  not exists (
    select 1 from public.team_song_imports
    where team_library_id='test-team-a' and source_song_id='source-b'
  ),
  'failed batch must not leave a partial source-b import'
);
select pg_temp.assert_true(
  (select count(*) from public.team_song_imports
   where team_library_id='test-team-a' and source_song_id='source-a' and is_primary) = 1,
  'a source has exactly one primary despite duplicates'
);
select pg_temp.assert_true(
  (select count(distinct title) from public.songs
   where id in (select team_song_id from public.team_song_imports where source_song_id='source-a')) = 1,
  'duplicate titles remain unchanged'
);

-- Legacy same-title linking and overwrite keep the target id.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,songId}' = 'team-legacy',
  'inspection exposes an unmapped same-title legacy candidate'
);
select pg_temp.assert_true(
  public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,currentKey}' = 'D'
  and public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,originalKey}' = 'C'
  and public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,version}' = 'Acoustic'
  and public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,lyricist}' = 'Lyric Writer'
  and public.inspect_team_song_import('test-team-a', array['source-b'])
    #>> '{songs,0,possibleMatches,0,composer}' = 'Composer Name',
  'same-title candidates include key, version, lyricist, and composer details'
);
select public.import_personal_songs_to_team(
  'test-team-a',
  '[{"sourceSongId":"source-b","resolution":"overwrite","targetSongId":"team-legacy"}]'::jsonb
);
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.team_song_imports where source_song_id='source-b' and team_song_id='team-legacy' and is_primary),
  'legacy overwrite links the existing team id as primary'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,songId}' = (
      select team_song_id
      from public.team_song_imports
      where team_library_id='test-team-a'
        and source_song_id='source-a'
        and is_primary
    )
  and public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,currentKey}' = 'F'
  and public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,originalKey}' = 'D'
  and public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,version}' = '2'
  and public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,lyricist}' = 'Source Lyricist'
  and public.inspect_team_song_import('test-team-a', array['source-a'])
    #>> '{songs,0,existingSong,composer}' = 'Source Composer',
  'inspection exposes the mapped primary song with the same version detail shape'
);
reset role;

-- Setlist editor: own or assigned; no song-library mutation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true(public.can_write_setlist('setlist-manager'), 'setlist editor writes own setlist');
select pg_temp.assert_true(public.can_write_setlist('setlist-owner'), 'setlist editor writes an explicitly assigned setlist');
select pg_temp.assert_true(
  not public.can_write_setlist('setlist-owner-in-editor-project'),
  'setlist editor cannot write an unassigned foreign setlist'
);
select pg_temp.assert_true(not public.can_edit_library_content('test-team-a'), 'setlist editor cannot edit team songs');
update public.setlists
set name='Manager Own Setlist Updated',
    updated_by='00000000-0000-0000-0000-000000000003'
where id='setlist-manager';
update public.setlists
set name='Owner Setlist Updated By Assignee',
    updated_by='00000000-0000-0000-0000-000000000003'
where id='setlist-owner';
select pg_temp.assert_true(
  (select name from public.setlists where id='setlist-manager')='Manager Own Setlist Updated'
  and (select name from public.setlists where id='setlist-owner')='Owner Setlist Updated By Assignee',
  'setlist editor raw UPDATE succeeds for own and explicitly assigned setlists'
);
select pg_temp.expect_error(
  $$insert into public.songs(id,library_id,title,content_json,created_by,updated_by)
    values (
      'manager-illegal-song','test-team-a','Illegal',
      '{"id":"manager-illegal-song","title":"Illegal","sections":[]}',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000003'
    )$$,
  'setlist editor cannot write team songs through the table API'
);
select pg_temp.expect_error(
  $$select public.archive_team_songs('test-team-a',array['team-legacy'],true)$$,
  'setlist editor cannot archive team songs'
);
select pg_temp.expect_error(
  $$insert into public.share_links(resource_type,resource_id,token,created_by)
    values ('setlist','setlist-manager','manager-illegal-token','00000000-0000-0000-0000-000000000003')$$,
  'setlist_manager cannot share even a setlist they can edit'
);
select pg_temp.expect_error(
  $$select public.get_setlist_share_status('setlist-manager')$$,
  'setlist_manager cannot manage setlist sharing state'
);
reset role;

-- Viewer remains read-only even when historic rows say created_by=viewer.
insert into public.user_project_memberships(user_id, project_id, role)
values ('00000000-0000-0000-0000-000000000004', 'project-owner', 'manager');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true(not public.can_write_setlist('setlist-viewer'), 'viewer creator cannot write setlist');
select pg_temp.assert_true(not public.can_manage_project('project-viewer'), 'viewer creator cannot write project');
update public.songs
set title='Viewer Mutated Song',
    updated_by='00000000-0000-0000-0000-000000000004'
where id='team-editor-direct';
update public.setlists
set name='Viewer Mutated Setlist',
    updated_by='00000000-0000-0000-0000-000000000004'
where id='setlist-viewer';
update public.projects
set name='Viewer Mutated Project',
    updated_by='00000000-0000-0000-0000-000000000004'
where id='project-viewer';
update public.library_members
set role='editor'
where library_id='test-team-a'
  and user_id='00000000-0000-0000-0000-000000000004';
delete from public.library_members
where library_id='test-team-a'
  and user_id='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(
  (select title from public.songs where id='team-editor-direct')='Editor Direct'
  and (select name from public.setlists where id='setlist-viewer')='Viewer Historic Setlist'
  and (select name from public.projects where id='project-viewer')='Viewer Historic Project'
  and (select role from public.library_members
       where library_id='test-team-a'
         and user_id='00000000-0000-0000-0000-000000000004')='viewer'
  and exists (
    select 1 from public.library_members
    where library_id='test-team-a'
      and user_id='00000000-0000-0000-0000-000000000003'
      and role='setlist_manager'
  ),
  'viewer raw song, setlist, project, member UPDATE/DELETE operations affect zero rows'
);
select pg_temp.expect_error(
  $$select public.update_team_member_role(
      'test-team-a','00000000-0000-0000-0000-000000000003','viewer'
    )$$,
  'viewer cannot change team member roles'
);
select pg_temp.expect_error(
  $$select public.remove_team_member(
      'test-team-a','00000000-0000-0000-0000-000000000003'
    )$$,
  'viewer cannot remove team members'
);
select pg_temp.expect_error(
  $$select public.create_team_invite('test-team-a','blocked-viewer@test.local','viewer')$$,
  'viewer cannot invite team members'
);
select pg_temp.expect_error(
  $$insert into public.share_links(resource_type,resource_id,token,created_by)
    values ('setlist','setlist-owner','viewer-illegal-token','00000000-0000-0000-0000-000000000004')$$,
  'viewer cannot mint a share token for a known resource id'
);
insert into public.share_links(resource_type,resource_id,token,created_by)
values ('project','project-owner','joined-project-manager-token','00000000-0000-0000-0000-000000000004');
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.share_links where token='joined-project-manager-token'),
  'joined project manager may create a project share link'
);

-- A role downgrade removes assignment rows immediately and revokes write access.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.update_team_member_role('test-team-a', '00000000-0000-0000-0000-000000000005', 'viewer');
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.setlist_editor_assignments where user_id='00000000-0000-0000-0000-000000000005'),
  'downgrade cleans all assignments'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select pg_temp.assert_true(not public.can_write_setlist('setlist-owner'), 'downgraded viewer loses assignment access');
reset role;

-- Permanent team deletion is RPC-only, requires archive, and rejects references.
select pg_temp.expect_error(
  $$delete from public.songs where id='team-unarchived-delete'$$,
  'even an administrative direct delete requires a team song to be archived first'
);
select pg_temp.assert_true(
  (
    select lower(pg_get_triggerdef(t.oid)) like '%before insert or update on public.share_links%'
      and lower(pg_get_triggerdef(t.oid)) not like '%update of%'
    from pg_trigger t
    where t.tgrelid = 'public.share_links'::regclass
      and t.tgname = 'share_links_resource_exists'
      and not t.tgisinternal
  ),
  'share-link lock trigger runs for state-only updates such as reactivation'
);
select pg_temp.assert_true(
  position(
    'order by item.song_id'
    in lower(pg_get_functiondef('public.lock_share_link_resource()'::regprocedure))
  ) > 0,
  'bundle share activation acquires song locks in deterministic song-id order'
);
select pg_temp.assert_true(
  (
    select count(*)=5
    from pg_trigger t
    where t.tgname in (
      'auth_users_reference_graph_statement_lock',
      'songs_reference_graph_statement_lock',
      'share_links_reference_graph_statement_lock',
      'song_share_bundle_items_reference_graph_statement_lock',
      'setlist_songs_reference_graph_statement_lock'
    )
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%for each statement%'
  )
  and exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'auth_users_reference_graph_statement_lock'
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%before delete on auth.users%'
      and lower(pg_get_triggerdef(t.oid)) like '%for each statement%'
  )
  and not exists (
    select 1
    from pg_trigger t
    where t.tgname in (
      'share_links_reference_graph_statement_lock',
      'song_share_bundle_items_reference_graph_statement_lock',
      'setlist_songs_reference_graph_statement_lock'
    )
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%delete%'
  )
  and not exists (
    select 1
    from pg_trigger t
    where t.tgname in (
      'setlists_share_parent_statement_lock',
      'song_share_bundles_share_parent_statement_lock'
    )
      and not t.tgisinternal
  )
  and position(
    'chordmaster:song-reference-graph:v1'
    in lower(pg_get_functiondef('public.lock_song_reference_graph_statement()'::regprocedure))
  ) > 0,
  'reference additions, song deletes, and auth-user cascade roots use one pre-row lock while reference removal stays outside it'
);

-- Parent and child reference deletion deliberately stay outside the graph
-- gate. Cascades must complete without entering any INSERT/UPDATE-only trigger.
insert into public.setlists (
  id, library_id, name, display_mode, show_lyrics, created_by, updated_by
)
values (
  'setlist-parent-delete-lock', 'test-team-a', 'Delete Lock Setlist',
  'full', false,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
);
insert into public.setlist_songs(id, setlist_id, song_id)
values ('setlist-parent-delete-child', 'setlist-parent-delete-lock', 'team-bundle-a');

insert into public.song_share_bundles(id, library_id, created_by)
values (
  'bundle-parent-delete-lock', 'test-team-a',
  '00000000-0000-0000-0000-000000000001'
);
insert into public.song_share_bundle_items(bundle_id, song_id, order_index)
values ('bundle-parent-delete-lock', 'team-bundle-b', 0);

delete from public.setlists where id='setlist-parent-delete-lock';
delete from public.song_share_bundles where id='bundle-parent-delete-lock';

select pg_temp.assert_true(
  not exists (
    select 1 from public.setlists where id='setlist-parent-delete-lock'
  )
  and not exists (
    select 1 from public.setlist_songs where id='setlist-parent-delete-child'
  )
  and not exists (
    select 1 from public.song_share_bundles where id='bundle-parent-delete-lock'
  )
  and not exists (
    select 1 from public.song_share_bundle_items
    where bundle_id='bundle-parent-delete-lock'
  ),
  'share-parent deletion cascades without taking the reference-addition gate'
);

insert into public.song_share_bundles(id, library_id, created_by)
values ('team-active-bundle', 'test-team-a', '00000000-0000-0000-0000-000000000001');
select pg_temp.expect_error(
  $$insert into public.song_share_bundle_items(bundle_id,song_id,order_index)
    values ('team-active-bundle','other-team-song',99)$$,
  'a shared-song bundle cannot forge a cross-library song relation'
);
insert into public.song_share_bundle_items(bundle_id, song_id, order_index)
values
  ('team-active-bundle', 'team-bundle-b', 0),
  ('team-active-bundle', 'team-bundle-a', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.share_links(resource_type,resource_id,token,created_by)
values ('song_bundle','team-active-bundle','active-bundle-token','00000000-0000-0000-0000-000000000001');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
insert into public.share_links(resource_type,resource_id,token,created_by,revoked_at)
values (
  'song','team-reactivation','reactivation-token',
  '00000000-0000-0000-0000-000000000002',now()
);
update public.share_links
set revoked_at=null, expires_at=now() + interval '1 day'
where token='reactivation-token';
select pg_temp.assert_true(
  exists (
    select 1 from public.share_links
    where token='reactivation-token'
      and revoked_at is null
      and expires_at > now()
  ),
  'a state-only direct-song reactivation passes through the guarded update trigger'
);
select pg_temp.expect_error(
  $$select public.delete_team_songs('test-team-a',array['team-reactivation'])$$,
  'reactivated direct-song share blocks permanent deletion'
);
select pg_temp.expect_error(
  $$select public.delete_team_songs('test-team-a',array['team-bundle-a'])$$,
  'active bundle share blocks permanent deletion'
);
reset role;

update public.share_links
set revoked_at=now()
where token in ('reactivation-token', 'active-bundle-token');

insert into public.setlist_songs(id,setlist_id,song_id)
values ('archived-reference', 'setlist-owner', 'team-archived');
select pg_temp.expect_error(
  $$delete from public.songs where id='team-archived'$$,
  'database trigger prevents an administrative direct delete from cascading through a setlist reference'
);
insert into public.user_setlist_memberships(user_id, setlist_id, token_used)
values ('00000000-0000-0000-0000-000000000004', 'setlist-owner', 'archived-payload-test')
on conflict (user_id, setlist_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true(
  exists (
    select 1
    from jsonb_array_elements(public.get_joined_setlists()) joined_setlist
    cross join lateral jsonb_array_elements(joined_setlist -> 'songs') joined_song
    where joined_song ->> 'songId' = 'team-archived'
      and joined_song ->> 'sourceArchivedAt' is not null
      and joined_song -> 'songData' is not null
  ),
  'joined setlist keeps an archived song and exposes sourceArchivedAt'
);
select pg_temp.assert_true(
  exists (
    select 1
    from jsonb_array_elements(public.get_joined_projects()) joined_project
    cross join lateral jsonb_array_elements(joined_project -> 'setlists') joined_setlist
    cross join lateral jsonb_array_elements(joined_setlist -> 'songs') joined_song
    where joined_project ->> 'id' = 'project-owner'
      and joined_song ->> 'songId' = 'team-archived'
      and joined_song ->> 'sourceArchivedAt' is not null
      and joined_song -> 'songData' is not null
  ),
  'joined project keeps an archived song and exposes sourceArchivedAt'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_error(
  $$select public.delete_team_songs('test-team-a',array['team-archived'])$$,
  'setlist reference blocks permanent deletion'
);
reset role;
delete from public.setlist_songs where id='archived-reference';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.share_links(resource_type,resource_id,token,created_by)
values ('song','team-archived','active-song-token','00000000-0000-0000-0000-000000000001');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_error(
  $$select public.delete_team_songs('test-team-a',array['team-archived'])$$,
  'active share blocks permanent deletion'
);
reset role;
update public.share_links set revoked_at=now() where token='active-song-token';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select public.delete_team_songs('test-team-a', array['team-archived']);
reset role;
select pg_temp.assert_true(not exists(select 1 from public.songs where id='team-archived'), 'safe delete removes unreferenced archived song');

select pg_temp.assert_true(
  (
    select c.relreplident = 'f'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'setlist_editor_assignments'
  ),
  'assignment DELETE events retain library_id through REPLICA IDENTITY FULL'
);

rollback;

\echo 'team_library_permissions.sql: all assertions passed'
