\set ON_ERROR_STOP on
-- Disposable database only, after all migrations. Every fixture rolls back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if; end;
$$;
create function pg_temp.expect_error(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'ASSERTION FAILED (expected rejection): %', message;
end;
$$;

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('10000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
  'admin-test-' || i || '@example.invalid', 'authenticated', 'authenticated', '', now(), '{}', '{}', now(), now()
from generate_series(1,7) i;
insert into public.profiles(id,email,display_name)
select id,email,email from auth.users where email like 'admin-test-%@example.invalid';
insert into public.libraries(id,name,kind,owner_user_id) values
 ('admin-test-team','Admin Test','team','10000000-0000-0000-0000-000000000001'),
 ('admin-test-other','Other Team','team','10000000-0000-0000-0000-000000000007'),
 ('admin-test-personal','Personal','personal','10000000-0000-0000-0000-000000000001');
insert into public.library_members(library_id,user_id,role) values
 ('admin-test-team','10000000-0000-0000-0000-000000000001','owner'),
 ('admin-test-team','10000000-0000-0000-0000-000000000002','editor'),
 ('admin-test-team','10000000-0000-0000-0000-000000000003','admin'),
 ('admin-test-team','10000000-0000-0000-0000-000000000004','setlist_manager'),
 ('admin-test-team','10000000-0000-0000-0000-000000000005','viewer'),
 ('admin-test-team','10000000-0000-0000-0000-000000000006','editor'),
 ('admin-test-other','10000000-0000-0000-0000-000000000007','owner');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('admin-test-song','admin-test-team','Canonical','{"title":"Canonical","currentKey":"C","sections":[{"id":"verse"},{"id":"chorus"}]}','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('admin-test-legacy-song','admin-test-team','Legacy','{"title":"Legacy","currentKey":"C","sections":[{"title":"Verse"},{"title":"Chorus"}]}','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('admin-test-other-song','admin-test-other','Other','{"title":"Other","sections":[]}','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000007');
insert into public.projects(id,library_id,name,created_by,updated_by) values
 ('admin-test-project','admin-test-team','Owner Project','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,project_id,created_by,updated_by) values
 ('admin-test-owner-list','admin-test-team','Owner List','chord-fixed-key','admin-test-project','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('admin-test-manager-list','admin-test-team','Manager List','chord-fixed-key',null,'10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004'),
 ('admin-test-other-list','admin-test-other','Other List','chord-fixed-key',null,'10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000007');
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values
 ('admin-test-original','admin-test-owner-list','admin-test-song','{"overrideKey":"D","songData":{"title":"Approved arrangement","sections":[{"id":"chorus"}]},"sectionOrder":["chorus"]}'),
 ('admin-test-other-entry','admin-test-other-list','admin-test-other-song','{}');
-- An invitation issued before an owner promoted its recipient must not demote them.
insert into public.team_invites(library_id,email,role,token,invited_by) values
 ('admin-test-team','admin-test-2@example.invalid','viewer','admin-test-stale-token','10000000-0000-0000-0000-000000000001');


update public.songs set content_json='{"title":"Song","originalKey":"C","currentKey":"C","capo":2,"timeSignature":"4/4","sections":[{"id":"verse","title":"Verse","bars":[{"id":"bar","chords":["C"]}]}]}' where id='admin-test-song';
update public.setlist_songs set override_json=jsonb_build_object('songData',(select content_json from public.songs where id='admin-test-song'),'sectionOrder','["verse","verse"]'::jsonb,'overrideKey','E') where id='admin-test-original';
insert into public.setlist_songs(id,setlist_id,song_id,override_json) select 'baseline-copy-b','admin-test-owner-list','admin-test-song',override_json from public.setlist_songs where id='admin-test-original';
create function pg_temp.apply_sync(entry_id text,direction text,resolve_conflict boolean default false) returns jsonb language plpgsql as $$
declare p jsonb; begin
 p:=public.preview_setlist_source_sync('admin-test-team',entry_id);
 return public.reconcile_setlist_source('admin-test-team',entry_id,(p#>>'{source,updated_at}')::timestamptz,
   p#>'{entry,override_json}',p#>'{source,content_json}',p#>'{entry,source_baseline}',direction,resolve_conflict);
end $$;
create function pg_temp.status(entry_id text) returns text language sql as $$ select public.preview_setlist_source_sync('admin-test-team',entry_id)->>'syncStatus' $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select source_baseline is not null from public.setlist_songs where id='admin-test-original'),'equal score establishes baseline');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["G"]') where id='admin-test-original';
select pg_temp.assert_true(pg_temp.status('admin-test-original')='setlist-changed','only A edited');
select pg_temp.apply_sync('admin-test-original','to-library');
select pg_temp.assert_true(pg_temp.status('admin-test-original')='aligned','A baseline advances after upload');
select pg_temp.assert_true(pg_temp.status('baseline-copy-b')='source-newer','unchanged B is a stale source copy, not a new correction');
select pg_temp.expect_error($q$select pg_temp.apply_sync('baseline-copy-b','to-library',true)$q$,'even forced stale-copy upload is refused');
update public.setlist_songs set override_json=jsonb_set(jsonb_set(override_json,'{songData,currentKey}','"D"'),'{songData,capo}','7') where id='baseline-copy-b';
select pg_temp.assert_true(pg_temp.status('baseline-copy-b')='source-newer','Key and Capo do not count as local score edits');
select pg_temp.apply_sync('baseline-copy-b','to-setlist');
select pg_temp.assert_true(pg_temp.status('baseline-copy-b')='aligned','B accepts latest library and advances only its own baseline');
select pg_temp.assert_true((select override_json->>'overrideKey'='E' and override_json->'sectionOrder'='["verse","verse"]'::jsonb and override_json#>>'{songData,currentKey}'='D' and override_json#>>'{songData,capo}'='7' from public.setlist_songs where id='baseline-copy-b'),'refresh preserves Key, Capo and repeated performance order');
select pg_temp.assert_true((select before_setlist_json#>>'{override_json,songData,sections,0,bars,0,chords,0}'='C' from public.setlist_source_sync_history where direction='to-setlist' order by id desc limit 1),'refresh backs up complete old entry');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["Am"]') where id='admin-test-original';
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["F"]') where id='baseline-copy-b';
select pg_temp.apply_sync('admin-test-original','to-library');
select pg_temp.assert_true(pg_temp.status('baseline-copy-b')='conflict','both independent changes are a conflict');
select pg_temp.expect_error($q$select pg_temp.apply_sync('baseline-copy-b','to-library')$q$,'cannot blindly push conflict');
select pg_temp.expect_error($q$select pg_temp.apply_sync('baseline-copy-b','to-setlist')$q$,'cannot blindly discard local conflict');
select pg_temp.apply_sync('baseline-copy-b','to-setlist',true);
select pg_temp.assert_true(pg_temp.status('baseline-copy-b')='aligned','explicitly keeping library resolves conflict');
insert into public.setlist_songs(id,setlist_id,song_id,override_json,source_baseline)
 values('baseline-unknown','admin-test-owner-list','admin-test-song','{"songData":{"title":"Legacy","sections":[]}}','{"forged":true}');
select pg_temp.assert_true(pg_temp.status('baseline-unknown')='unknown','divergent legacy snapshot is not assigned a guessed baseline');
update public.setlist_songs set source_baseline=(select source_baseline from public.setlist_songs where id='admin-test-original') where id='baseline-unknown';
select pg_temp.assert_true((select source_baseline is null from public.setlist_songs where id='baseline-unknown'),'caller cannot forge provenance');
select pg_temp.expect_error($q$select pg_temp.apply_sync('baseline-unknown','to-library')$q$,'unknown baseline requires explicit review');
select pg_temp.apply_sync('baseline-unknown','to-setlist',true);
select pg_temp.assert_true(pg_temp.status('baseline-unknown')='aligned','reviewed legacy snapshot accepts an agreed baseline');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["G7"]') where id='baseline-copy-b';
insert into public.setlist_songs(id,setlist_id,song_id,override_json)
 select 'baseline-copy-d','admin-test-owner-list','admin-test-song',override_json||'{"sourceSetlistSongId":"baseline-copy-b"}' from public.setlist_songs where id='baseline-copy-b';
select pg_temp.assert_true((select source_baseline=(select source_baseline from public.setlist_songs where id='baseline-copy-b') from public.setlist_songs where id='baseline-copy-d'),'duplicating an arrangement inherits its real baseline');
create temp table before_legacy as select public.preview_setlist_source_sync('admin-test-team','admin-test-original') p;
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','baseline-copy-d',(p#>>'{source,updated_at}')::timestamptz,p#>'{entry,override_json}',p#>'{source,content_json}') from before_legacy$q$,'legacy update cannot reuse another entry preview');
-- Make the source change, while the duplicate retains its old baseline/edit.
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["Dm"]') where id='admin-test-original';
select pg_temp.apply_sync('admin-test-original','to-library');
select pg_temp.assert_true(pg_temp.status('baseline-copy-d')='conflict','copied edited arrangement detects a later source change');
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','baseline-copy-d',s.updated_at,e.override_json,s.content_json) from public.songs s,public.setlist_songs e where s.id='admin-test-song' and e.id='baseline-copy-d'$q$,'old client cannot bypass conflict detection');
select pg_temp.apply_sync('baseline-copy-d','to-library',true);
select pg_temp.assert_true((select content_json#>>'{sections,0,bars,0,chords,0}'='G7' from public.songs where id='admin-test-song'),'explicitly keeping setlist resolves conflict');
select pg_temp.assert_true(pg_temp.status('admin-test-original')='source-newer','another unchanged copy becomes source-newer after resolution');
-- References without private songData keep following the library until edited.
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values('baseline-live','admin-test-owner-list','admin-test-song','{"overrideKey":"D"}');
update public.songs set content_json=jsonb_set(content_json,'{sections,0,bars,0,chords}','["Bm"]'),updated_by=auth.uid() where id='admin-test-song';
update public.setlist_songs e set override_json=e.override_json||jsonb_build_object('sourceEditBase',s.content_json,'songData',jsonb_set(s.content_json,'{sections,0,bars,0,chords}','["C"]'))
 from public.songs s where e.id='baseline-live' and s.id=e.song_id;
select pg_temp.assert_true(pg_temp.status('baseline-live')='setlist-changed','first private edit uses the latest displayed source, not an obsolete live-reference baseline');
select pg_temp.assert_true((select not(override_json ? 'sourceEditBase') from public.setlist_songs where id='baseline-live'),'origin proof is never retained in songData or overrides');
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values('baseline-live-race','admin-test-owner-list','admin-test-song','{}');
create temp table live_origin as select content_json from public.songs where id='admin-test-song';
update public.songs set content_json=jsonb_set(content_json,'{sections,0,bars,0,chords}','["Dm9"]'),updated_by=auth.uid() where id='admin-test-song';
update public.setlist_songs set override_json=jsonb_build_object('sourceEditBase',(select content_json from live_origin),'songData',jsonb_set((select content_json from live_origin),'{sections,0,bars,0,chords}','["Fsus4"]')) where id='baseline-live-race';
select pg_temp.assert_true(pg_temp.status('baseline-live-race')='unknown','a concurrent source edit makes the first private edit provenance unknown');
select pg_temp.expect_error($q$select pg_temp.apply_sync('baseline-live-race','to-library')$q$,'cannot upload a first edit based on an outdated origin without comparison');
insert into public.setlist_songs(id,setlist_id,song_id,override_json)
 select 'baseline-new-first-edit','admin-test-owner-list','admin-test-song',jsonb_build_object('sourceEditBase',content_json,'songData',jsonb_set(content_json,'{sections,0,bars,0,chords}','["Csus4"]')) from public.songs where id='admin-test-song';
select pg_temp.assert_true(pg_temp.status('baseline-new-first-edit')='setlist-changed','an unsaved new entry can prove the source of its first edit');

reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.reconcile_setlist_source(text,text,timestamptz,jsonb,jsonb,jsonb,text,boolean)','execute'),'anonymous reconciliation is forbidden');
rollback;
