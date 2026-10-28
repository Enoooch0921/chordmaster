\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. All fixtures and mutations roll back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if; end;
$$;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000001','score-time@example.invalid');
insert into public.profiles(id,email,display_name) values ('10000000-0000-0000-0000-000000000001','score-time@example.invalid','Owner');
insert into public.libraries(id,name,kind,owner_user_id) values ('time-team','Time Test','team','10000000-0000-0000-0000-000000000001');
insert into public.library_members(library_id,user_id,role) values ('time-team','10000000-0000-0000-0000-000000000001','owner');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
  ('time-song','time-team','Song','{"title":"Song","currentKey":"C","sections":[{"id":"v","title":"Verse","bars":[{"id":"b","chords":["C"]}]}]}',
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,created_by,updated_by) values
  ('time-list','time-team','Sunday','chord-fixed-key','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,override_json)
select 'time-entry','time-list','time-song',jsonb_build_object('songData',content_json) from public.songs where id='time-song';
insert into public.setlist_songs(id,setlist_id,song_id) values ('time-live','time-list','time-song');
select pg_temp.assert_true((select score_updated_at is not null from public.setlist_songs where id='time-entry'),'new score receives a server timestamp');
select pg_temp.assert_true((select score_updated_at is null from public.setlist_songs where id='time-live'),'a live reference does not pretend to have a private score edit');

-- Reproduce existing legacy data without guessing its last edit date.
alter table public.setlist_songs disable trigger zzz_track_setlist_score_modified_time;
update public.setlist_songs set score_updated_at=null where id='time-entry';
alter table public.setlist_songs enable trigger zzz_track_setlist_score_modified_time;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update public.setlist_songs set order_index=1,override_json=override_json || '{"overrideKey":"D","sectionOrder":["v","v"]}',score_updated_at='2000-01-01' where id='time-entry';
select pg_temp.assert_true((select score_updated_at is null from public.setlist_songs where id='time-entry'),'Key, order and forged dates do not backfill unknown score times');
select pg_temp.assert_true(public.preview_setlist_source_sync('time-team','time-entry')#>>'{entry,score_updated_at}' is null,'preview exposes unknown time honestly');

update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["G"]') where id='time-entry';
create temp table first_edit as select score_updated_at from public.setlist_songs where id='time-entry';
select pg_temp.assert_true((select score_updated_at>=transaction_timestamp() from first_edit),'actual chord edit records current server time');
select pg_temp.assert_true((public.preview_setlist_source_sync('time-team','time-entry')#>>'{entry,score_updated_at}')::timestamptz=(select score_updated_at from first_edit),'preview returns the precise per-song timestamp');

-- Browser saves UPSERT every entry in a changed list: none of the unchanged
-- scores may acquire a new date, even when the caller supplies another date.
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json,score_updated_at)
select id,setlist_id,song_id,order_index+1,override_json || '{"overrideKey":"E"}','2100-01-01' from public.setlist_songs where id='time-entry'
on conflict(id) do update set order_index=excluded.order_index,override_json=excluded.override_json,score_updated_at=excluded.score_updated_at;
update public.setlists set name='Renamed Sunday' where id='time-list';
update public.songs set content_json=jsonb_set(content_json,'{sections,0,bars,0,chords}','["Am"]') where id='time-song';
select pg_temp.assert_true((select e.score_updated_at=f.score_updated_at from public.setlist_songs e cross join first_edit f where e.id='time-entry'),'unchanged UPSERT, list rename and library changes preserve this score timestamp');

update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,lyricsDoc}','{"chinese":"歌詞","fontSize":14,"displayLanguage":"chinese"}') where id='time-entry';
create temp table lyrics_edit as select score_updated_at from public.setlist_songs where id='time-entry';
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,lyricsDoc,fontSize}','20') where id='time-entry';
select pg_temp.assert_true((select e.score_updated_at=f.score_updated_at from public.setlist_songs e cross join lyrics_edit f where e.id='time-entry'),'lyric display preference does not modify the score timestamp');
insert into public.setlist_songs(id,setlist_id,song_id,override_json)
select id,setlist_id,song_id,jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["Am"]') from public.setlist_songs where id='time-entry'
on conflict(id) do update set override_json=excluded.override_json;
select pg_temp.assert_true((select e.score_updated_at>f.score_updated_at from public.setlist_songs e cross join lyrics_edit f where e.id='time-entry'),'changed UPSERT advances the score timestamp');
select pg_temp.assert_true((select score_updated_at is null from public.setlist_songs where id='time-live'),'editing a different song leaves the live entry unchanged');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.track_setlist_score_modified_time()','EXECUTE') and not has_function_privilege('authenticated','public.track_setlist_score_modified_time()','EXECUTE'),'trigger helper is not an exposed RPC');
rollback;
