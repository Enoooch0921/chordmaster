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
 ('conditional-lib','Sync','personal','16000000-0000-4000-8000-000000000001');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('conditional-song','conditional-lib','Song','{"title":"Song","currentKey":"C","sections":[]}',
 '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.projects(id,library_id,name,created_by,updated_by) values
 ('conditional-project','conditional-lib','Event','16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,project_id,created_by,updated_by) values
 ('conditional-list','conditional-lib','Sunday','chord-fixed-key','conditional-project',
 '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json) values
 ('conditional-entry','conditional-list','conditional-song',0,'{"overrideKey":"C"}');
insert into public.user_setlist_memberships(user_id,setlist_id) values
 ('16000000-0000-4000-8000-000000000002','conditional-list');
insert into public.user_project_memberships(user_id,project_id,role) values
 ('16000000-0000-4000-8000-000000000002','conditional-project','manager');

set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
create temp table accepted_snapshot as select public.get_joined_workspace_snapshot() as value;
select pg_temp.assert_true((select value#>>'{payload,setlists,0,songs,0,songData,currentKey}'='C' from accepted_snapshot),'first read includes the full score');
select pg_temp.assert_true((select value#>>'{payload,projects,0,role}'='manager' from accepted_snapshot),'project permissions included');
select pg_temp.assert_true((select public.get_joined_workspace_snapshot(value->>'version') = jsonb_build_object('version',value->>'version','unchanged',true) from accepted_snapshot),'unchanged read contains no score payload');
create function pg_temp.assert_changed(reason text) returns void language plpgsql as $$
declare response jsonb;
begin
  response := public.get_joined_workspace_snapshot((select value->>'version' from accepted_snapshot));
  perform pg_temp.assert_true(response->>'unchanged'='false' and response ? 'payload',reason);
  update accepted_snapshot set value=response;
end;
$$;

-- Two viewers of the same resource receive the owner's changes on their next check.
reset role;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
update public.songs set content_json=jsonb_set(content_json,'{currentKey}','"D"') where id='conditional-song';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('source score changed without relying on the setlist timestamp');
select pg_temp.assert_true((select value#>>'{payload,projects,0,setlists,0,songs,0,songData,currentKey}'='D' from accepted_snapshot),'updated score is returned in the same response');

reset role;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
update public.setlist_songs set override_json='{"overrideKey":"E","songData":{"title":"Copy","currentKey":"F","sections":[]}}' where id='conditional-entry';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('Key and private score changes invalidate the version');
insert into public.user_setlist_capo_overrides(user_id,setlist_song_id,capo) values
 ('16000000-0000-4000-8000-000000000002','conditional-entry',0);
select pg_temp.assert_changed('personal Capo zero is included in the version');
select pg_temp.assert_true((select value#>>'{payload,personalCapos,0,capo}'='0' from accepted_snapshot),'personal Capo is returned');

reset role;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
insert into public.setlist_songs(id,setlist_id,song_id,order_index) values ('conditional-added','conditional-list','conditional-song',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('new songs invalidate the version');
reset role;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
update public.setlist_songs set order_index=-1 where id='conditional-added';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('reordering invalidates the version');
select pg_temp.assert_true((select value#>>'{payload,setlists,0,songs,0,id}'='conditional-added' from accepted_snapshot),'new ordering included');
reset role;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
delete from public.setlist_songs where id='conditional-added';
update public.user_project_memberships set role='viewer' where project_id='conditional-project';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('deletion and role downgrade invalidate the version');
select pg_temp.assert_true((select value#>>'{payload,projects,0,role}'='viewer' from accepted_snapshot),'downgraded permission included');

-- A version never authorizes a different account or survives membership revocation.
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select public.get_joined_workspace_snapshot(value->>'version')#>'{payload,setlists}'='[]'::jsonb from accepted_snapshot),'other account cannot obtain scores by presenting a version');
select pg_temp.assert_true((select public.get_joined_workspace_snapshot(value->>'version')#>'{payload,personalCapos}'='[]'::jsonb from accepted_snapshot),'other account cannot obtain personal Capo');
reset role;
delete from public.user_setlist_memberships where setlist_id='conditional-list';
delete from public.user_project_memberships where project_id='conditional-project';
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_changed('revoked memberships invalidate the version');
select pg_temp.assert_true((select value->'payload'='{"setlists":[],"projects":[],"personalCapos":[]}'::jsonb from accepted_snapshot),'revocation returns an empty authorized view, including removal of stale Capo');
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform public.get_joined_workspace_snapshot();
    raise exception 'Missing user was accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_joined_workspace_snapshot(text)','EXECUTE'),'anonymous RPC access denied');
select pg_temp.assert_true(not (select prosecdef from pg_proc where oid='public.get_joined_workspace_snapshot(text)'::regprocedure),'wrapper remains SECURITY INVOKER');
rollback;
