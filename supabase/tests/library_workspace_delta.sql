\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. No production data is used by this suite.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if; end;
$$;
insert into auth.users(id,email) values
 ('16000000-0000-4000-8000-000000000001','sync-owner@example.invalid'),
 ('16000000-0000-4000-8000-000000000002','sync-viewer@example.invalid'),
 ('16000000-0000-4000-8000-000000000003','sync-other@example.invalid');
insert into public.libraries(id,name,kind,owner_user_id) values
 ('delta-lib','Sync','personal','16000000-0000-4000-8000-000000000001');
insert into public.library_members(library_id,user_id,role) values
 ('delta-lib','16000000-0000-4000-8000-000000000001','owner');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('delta-song','delta-lib','Song','{"title":"Song","currentKey":"C","sections":[]}',
 '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.projects(id,library_id,name,created_by,updated_by) values
 ('delta-project','delta-lib','Event','16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,project_id,created_by,updated_by) values
 ('delta-list','delta-lib','Sunday','chord-fixed-key','delta-project',
 '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json) values
 ('delta-entry','delta-list','delta-song',0,'{"overrideKey":"C"}');
insert into public.user_setlist_memberships(user_id,setlist_id) values
 ('16000000-0000-4000-8000-000000000002','delta-list');
insert into public.user_project_memberships(user_id,project_id,role) values
 ('16000000-0000-4000-8000-000000000002','delta-project','manager');

-- Establish real provenance with existing triggers, not a browser-authored baseline.
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
update public.songs set content_json=content_json || jsonb_build_object('notes',repeat('x',2000)) where id='delta-song';
update public.setlist_songs e set override_json=jsonb_build_object('songData',s.content_json,'overrideKey','C')
from public.songs s where e.song_id=s.id and e.id='delta-entry';
set local role authenticated;
create temp table accepted_delta as select public.get_library_workspace_delta('delta-lib') as value;
select pg_temp.assert_true((select jsonb_array_length(value#>'{changes,songs}')=1 from accepted_delta),'first snapshot includes songs');
select pg_temp.assert_true((select value#>'{changes,entries,0,baseline_delta,sourcePatch}'='{}'::jsonb from accepted_delta),'equal provenance uses an empty source patch');
select pg_temp.assert_true((select not (value#>'{changes,entries,0}' ? 'source_baseline') from accepted_delta),'full provenance omitted from transport');
select pg_temp.assert_true((select public.get_library_workspace_delta('delta-lib',value->'versions')->>'unchanged'='true' from accepted_delta),'unchanged workspace returns confirmation');
create function pg_temp.capture_delta() returns jsonb language plpgsql as $$
declare result jsonb; begin
 result:=public.get_library_workspace_delta('delta-lib',(select value->'versions' from accepted_delta));
 perform pg_temp.assert_true(result->>'unchanged'='false','update must be visible');
 update accepted_delta set value=result; return result;
end $$;

-- Changes with identical timestamps are visible; hashes cover exact source content.
update public.songs set content_json=jsonb_set(content_json,'{title}','"New title"') where id='delta-song';
select pg_temp.assert_true(jsonb_array_length(pg_temp.capture_delta()#>'{changes,songs}')=1,'only changed source returned');
select pg_temp.assert_true((select value#>'{changes,entries}'='[]'::jsonb from accepted_delta),'unchanged provenance is not resent when source changes');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('delta-added','delta-lib','Added','{"title":"Added","sections":[]}',
 '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.capture_delta()#>>'{changes,songs,0,id}'='delta-added','new song included without resending old song');
delete from public.songs where id='delta-added';
select pg_temp.assert_true(not (pg_temp.capture_delta()#>'{versions,songs}' ? 'delta-added'),'deleted ID removed from manifest');
update public.setlist_songs set override_json=jsonb_set(override_json,'{overrideKey}','"D"') where id='delta-entry';
select pg_temp.assert_true(pg_temp.capture_delta()#>>'{changes,entries,0,override_json,overrideKey}'='D','Key changes returned');
select pg_temp.assert_true((select value#>>'{changes,entries,0,baseline_delta,sourcePatch,s,title}'='Song' from accepted_delta),'old source title is losslessly patched against the new source');
insert into public.user_setlist_capo_overrides(user_id,setlist_song_id,capo) values
 ('16000000-0000-4000-8000-000000000001','delta-entry',0);
select pg_temp.assert_true(pg_temp.capture_delta()#>>'{changes,capos,0,capo}'='0','personal Capo changes included');
select pg_temp.assert_true((select value#>'{changes,songs}'='[]'::jsonb from accepted_delta),'Capo does not resend songs');

-- Version manifests confer no permissions; reads stay within caller RLS.
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select public.get_library_workspace_delta('delta-lib',value->'versions')#>'{versions,songs}'='{}'::jsonb from accepted_delta),'other account receives no songs');
select pg_temp.assert_true((select public.get_library_workspace_delta('delta-lib',value->'versions')#>'{versions,capos}'='{}'::jsonb from accepted_delta),'other account receives no Capo');
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
update accepted_delta set value=public.get_library_workspace_delta('delta-lib');
select pg_temp.assert_true((select value#>'{versions,entries}' ? 'delta-entry' from accepted_delta),'joined viewer sees authorized entry');
reset role;
delete from public.user_setlist_memberships where setlist_id='delta-list';
delete from public.user_project_memberships where project_id='delta-project';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(pg_temp.capture_delta()#>'{versions,entries}'='{}'::jsonb,'revocation removes previously visible entries');

-- Patch format distinguishes explicit null, deletion, nested edits and arrays.
select pg_temp.assert_true(public.workspace_json_patch('{"a":1,"remove":2,"nested":{"x":1},"list":[1]}',
 '{"a":null,"nested":{"x":2},"list":[2,3]}')=
 '{"s":{"a":null,"list":[2,3]},"d":["remove"],"p":{"nested":{"s":{"x":2}}}}'::jsonb,'patch is lossless for nontrivial JSON');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_library_workspace_delta(text,jsonb)','EXECUTE'),'anonymous delta access denied');
select pg_temp.assert_true(not (select prosecdef from pg_proc where oid='public.get_library_workspace_delta(text,jsonb)'::regprocedure),'delta does not bypass RLS');

select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
insert into public.libraries(id,name,kind,owner_user_id) values ('delta-team','Team','team','16000000-0000-4000-8000-000000000001');
insert into public.library_members(library_id,user_id,role) values ('delta-team','16000000-0000-4000-8000-000000000001','owner');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('delta-team-song','delta-team','Song','{"title":"Song","sections":[]}','16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,created_by,updated_by) values
 ('delta-team-list','delta-team','Team list','chord-fixed-key','16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,order_index) values
 ('delta-team-entry','delta-team-list','delta-team-song',0), ('delta-retained','delta-team-list','delta-team-song',1);
set local role authenticated;
do $$ begin
 begin
  perform public.delete_setlist_entries_checked('delta-team-list',array['delta-team-entry'],'editor');
  raise exception 'Role change was accepted';
 exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_true(exists(select 1 from public.setlist_songs where id='delta-team-entry'),'role rejection preserves entry');
select public.delete_setlist_entries_checked('delta-team-list',array['delta-team-entry','delta-entry'],'owner');
select pg_temp.assert_true(not exists(select 1 from public.setlist_songs where id='delta-team-entry')
 and exists(select 1 from public.setlist_songs where id='delta-retained')
 and exists(select 1 from public.setlist_songs where id='delta-entry'),'checked deletion touches only named entries in this setlist');
rollback;
