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


update public.songs set content_json='{"title":"Song","originalKey":"C","currentKey":"C","capo":2,"showNashvilleNumbers":true,"sections":[{"id":"verse","title":"Verse","bars":[{"id":"bar","chords":["C"],"riff":"1"}]}]}' where id='admin-test-song';
update public.setlist_songs set override_json=jsonb_build_object('songData',(select content_json from public.songs where id='admin-test-song')) where id='admin-test-original';
update public.setlist_songs set override_json='{"overrideKey":"D","sectionOrder":["verse","verse"],"songData":{"title":"Song","originalKey":"C","currentKey":"D","capo":7,"showNashvilleNumbers":false,"sections":[{"id":"verse","title":"Verse","bars":[{"id":"bar","chords":["G"],"riff":"2"}]}]}}' where id='admin-test-original';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true((select content_json#>>'{sections,0,bars,0,chords,0}'='C' from public.songs where id='admin-test-song'),'normal setlist save does not update source');
create temp table sync_preview as select public.preview_setlist_source_sync('admin-test-team','admin-test-original') as snapshot;
select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',(snapshot#>>'{source,updated_at}')::timestamptz,snapshot#>'{entry,override_json}',snapshot#>'{source,content_json}') from sync_preview;
select pg_temp.assert_true((select content_json#>>'{sections,0,bars,0,chords,0}'='G' and content_json#>>'{sections,0,bars,0,riff}'='2' and content_json->>'currentKey'='C' and content_json->>'capo'='2' and content_json->>'showNashvilleNumbers'='true' and updated_by=auth.uid() from public.songs where id='admin-test-song'),'manual sync promotes score and preserves source preferences and identity');
select pg_temp.assert_true((select override_json->>'overrideKey'='D' and override_json->'sectionOrder'='["verse","verse"]'::jsonb from public.setlist_songs where id='admin-test-original'),'setlist key and repeated section order preserved');
select pg_temp.assert_true((select count(*)=1 and bool_and(before_json#>>'{content_json,sections,0,bars,0,chords,0}'='C') from public.setlist_source_sync_history),'full previous source is backed up');
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',(snapshot#>>'{source,updated_at}')::timestamptz,snapshot#>'{entry,override_json}',snapshot#>'{source,content_json}') from sync_preview$q$,'stale source version rejected');
update sync_preview set snapshot=public.preview_setlist_source_sync('admin-test-team','admin-test-original');
select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',(snapshot#>>'{source,updated_at}')::timestamptz,snapshot#>'{entry,override_json}',snapshot#>'{source,content_json}') from sync_preview;
select pg_temp.assert_true((select count(*)=1 from public.setlist_source_sync_history),'identical score no-op does not generate duplicate history');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["Am"]') where id='admin-test-original';
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',(snapshot#>>'{source,updated_at}')::timestamptz,snapshot#>'{entry,override_json}',snapshot#>'{source,content_json}') from sync_preview$q$,'concurrent entry edit rejected');
update sync_preview set snapshot=public.preview_setlist_source_sync('admin-test-team','admin-test-original');
update public.songs set updated_at=clock_timestamp(),content_json=jsonb_set(content_json,'{sections,0,bars,0,rhythm}','"q q q q"') where id='admin-test-song';
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',(snapshot#>>'{source,updated_at}')::timestamptz,snapshot#>'{entry,override_json}',snapshot#>'{source,content_json}') from sync_preview$q$,'source edit since preview rejected');
select pg_temp.expect_error($q$update public.setlist_source_sync_history set before_json='{}'$q$,'history cannot be rewritten');
select pg_temp.expect_error($q$select public.preview_setlist_source_sync('admin-test-other','admin-test-other-entry')$q$,'team boundary enforced');
do $test$ declare i int; begin
 for i in 2..7 loop
   if i=3 then continue; end if;
   perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
   perform pg_temp.expect_error($q$select public.preview_setlist_source_sync('admin-test-team','admin-test-original')$q$,'non-administrator cannot preview');
   perform pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',now(),'{}','{}')$q$,'non-administrator cannot upload');
 end loop;
end $test$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true(public.preview_setlist_source_sync('admin-test-team','admin-test-original') is not null,'owner may preview');
update public.songs set archived_at=clock_timestamp(),updated_by=auth.uid() where id='admin-test-song';
select pg_temp.expect_error($q$select public.preview_setlist_source_sync('admin-test-team','admin-test-original')$q$,'archived source rejected');
select pg_temp.expect_error($q$select public.sync_setlist_song_to_library('admin-test-team','admin-test-original',now(),'{}','{}')$q$,'archived source cannot be updated');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.sync_setlist_song_to_library(text,text,timestamptz,jsonb,jsonb)','execute'),'anonymous execution denied');
select pg_temp.assert_true((select count(*)=1 from public.setlist_source_sync_history),'all rejected writes leave history unchanged');
rollback;
