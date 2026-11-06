\set ON_ERROR_STOP on
-- Disposable PostgreSQL only: real roles/RLS with synthetic songs, rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
insert into auth.users(id,email) values ('17000000-0000-4000-8000-000000000001','prefs-owner@example.invalid'),('17000000-0000-4000-8000-000000000002','prefs-viewer@example.invalid');
insert into public.libraries(id,name,kind,owner_user_id) values ('prefs-lib','Synthetic','team','17000000-0000-4000-8000-000000000001');
insert into public.library_members(library_id,user_id,role) values ('prefs-lib','17000000-0000-4000-8000-000000000001','owner'),('prefs-lib','17000000-0000-4000-8000-000000000002','viewer');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
('prefs-a','prefs-lib','A','{}','17000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001'),
('prefs-b','prefs-lib','B','{}','17000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-a","favorite":true,"favoriteAt":10}]')->'favorites'='["prefs-a"]','device A favorite');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-b","favorite":true,"favoriteAt":20}]')->'favorites'='["prefs-a","prefs-b"]','device B does not replace other favorites');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-a","usedAt":30}]')->'favorites'='["prefs-a","prefs-b"]','recent use does not reset favorite');
select public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-a","favorite":false,"favoriteAt":40,"usedAt":50}]');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-a","favorite":true,"favoriteAt":10,"usedAt":20}]')->'favorites'='["prefs-b"]','stale offline favorite cannot resurrect removal');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib')#>>'{recent,0,at}'='50','recent timestamp never regresses');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'other-lib','[{"id":"prefs-a","favorite":true,"favoriteAt":60}]')->'favorites'='[]','wrong library cannot store preference');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"deleted","usedAt":100}]')->'favorites'='["prefs-b"]','deleted pending song does not block sync');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"not-uploaded-yet","usedAt":100}]')->'applied'='[]','unsaved song is not falsely acknowledged');
create temp table observed_clock as select (public.sync_song_library_preferences(auth.uid(),'prefs-lib')->>'clock')::bigint as value;
select public.sync_song_library_preferences(auth.uid(),'prefs-lib',jsonb_build_array(jsonb_build_object('id','prefs-b','favorite',false,'favoriteAt',(select value+1 from observed_clock))));
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib')->'favorites'='[]','observed server clock lets a slow device cancel a favorite');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib')->'favoriteStates' @> '[["prefs-a",false,40]]'::jsonb,'cancelled favorite retains a mergeable tombstone');
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.song_library_preferences),'another library member cannot read owner preferences');
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib','[{"id":"prefs-a","favorite":true,"favoriteAt":60}]')->'favorites'='["prefs-a"]','viewer may keep own favorites without score write access');
do $$ begin
  begin perform public.sync_song_library_preferences('17000000-0000-4000-8000-000000000001','prefs-lib'); raise exception 'identity spoof accepted'; exception when insufficient_privilege then null; end;
  begin update public.song_library_preferences set user_id='17000000-0000-4000-8000-000000000001'; raise exception 'ownership transfer accepted'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_true(not has_table_privilege('anon','public.song_library_preferences','SELECT'),'anonymous table access denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.sync_song_library_preferences(uuid,text,jsonb)','EXECUTE'),'anonymous RPC denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.song_library_preferences','DELETE'),'no unneeded delete grant');
reset role;
delete from public.library_members where user_id='17000000-0000-4000-8000-000000000002' and library_id='prefs-lib';
set local role authenticated;
select pg_temp.assert_true(public.sync_song_library_preferences(auth.uid(),'prefs-lib')->'favorites'='[]','revoked member no longer reads preferences for inaccessible songs');
reset role;
select set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000001',true);
update public.songs set archived_at=now(), archived_by='17000000-0000-4000-8000-000000000001' where id='prefs-a';
delete from public.songs where id='prefs-a';
select pg_temp.assert_true((select count(*)=0 from public.song_library_preferences where song_id='prefs-a'),'song deletion cascades only its preferences');
rollback;
