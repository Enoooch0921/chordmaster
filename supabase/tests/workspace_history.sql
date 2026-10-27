-- Disposable SQL fixtures only; never execute this file against production.
begin;
create or replace function pg_temp.assert_history(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; end; $$;
create or replace function pg_temp.history_error(command text) returns void language plpgsql as $$
begin begin execute command; exception when others then return; end; raise exception 'Expected rejection: %',command; end; $$;
insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000101','history-owner@test.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000102','history-viewer@test.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000103','history-outsider@test.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000104','history-editor@test.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now());
insert into public.libraries(id,name,kind,owner_user_id) values('history-team','Undo fixture','team','00000000-0000-0000-0000-000000000101');
insert into public.library_members(library_id,user_id,role) values
 ('history-team','00000000-0000-0000-0000-000000000101','owner'),('history-team','00000000-0000-0000-0000-000000000102','viewer'),
 ('history-team','00000000-0000-0000-0000-000000000104','editor') on conflict do nothing;
insert into public.projects(id,library_id,name,created_by,updated_by) values
 ('history-project','history-team','Original project','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101'),
 ('history-other','history-team','Other project','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101'),
 ('history-editor-project','history-team','Editor project','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000104');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('history-song','history-team','Song','{"title":"Song","originalKey":"C","currentKey":"C","timeSignature":"4/4","sections":[]}',
 '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101');
insert into public.setlists(id,library_id,name,display_mode,project_id,created_by,updated_by) values
 ('history-list','history-team','Meeting','chord-movable-key','history-project','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101');
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json) values
 ('history-a','history-list','history-song',0,'{"overrideKey":"C","sectionOrder":[]}'),
 ('history-b','history-list','history-song',1,'{"overrideKey":"D","sectionOrder":[]}');
insert into public.user_project_memberships(user_id,project_id,role) values('00000000-0000-0000-0000-000000000102','history-project','viewer');
insert into public.user_setlist_memberships(user_id,setlist_id) values('00000000-0000-0000-0000-000000000102','history-list');
insert into public.setlist_editor_assignments(setlist_id,library_id,user_id,assigned_by) values
 ('history-list','history-team','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000101');
insert into public.user_setlist_capo_overrides(user_id,setlist_song_id,capo) values('00000000-0000-0000-0000-000000000102','history-a',3);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
set local role authenticated;
select set_config('history.receipt',public.trash_workspace_resource('history-team','project','history-project','{"name":"Original project","archived":false}')::text,true);
select pg_temp.assert_history(not exists(select 1 from public.projects where id='history-project'),'project is deleted');
select pg_temp.assert_history((select project_id is null from public.setlists where id='history-list'),'setlists detach');
select public.restore_workspace_resource(current_setting('history.receipt')::uuid);
select pg_temp.assert_history((select project_id='history-project' from public.setlists where id='history-list'),'original grouping restored');
reset role;
select pg_temp.assert_history(exists(select 1 from public.user_project_memberships where project_id='history-project' and user_id='00000000-0000-0000-0000-000000000102'),'shared membership restored');
set local role authenticated;
select pg_temp.history_error($q$select public.restore_workspace_resource(current_setting('history.receipt')::uuid)$q$);
select pg_temp.history_error('select * from chordmaster_private.workspace_trash');
select set_config('history.receipt',public.trash_workspace_resource('history-team','project','history-project','{"name":"Original project","archived":false}')::text,true);
update public.setlists set project_id='history-other' where id='history-list';
select pg_temp.history_error($q$select public.restore_workspace_resource(current_setting('history.receipt')::uuid)$q$);
select pg_temp.assert_history(not exists(select 1 from public.projects where id='history-project'),'failed restore rolls back parent creation');
update public.setlists set project_id=null where id='history-list';
select public.restore_workspace_resource(current_setting('history.receipt')::uuid);

select public.reorder_workspace_setlist('history-list','["history-a","history-b"]','["history-b","history-a"]');
select pg_temp.assert_history((select order_index=0 from public.setlist_songs where id='history-b'),'order changed');
update public.setlist_songs set override_json=override_json||'{"overrideKey":"E"}' where id='history-a';
select public.reorder_workspace_setlist('history-list','["history-b","history-a"]','["history-a","history-b"]');
select pg_temp.assert_history((select override_json->>'overrideKey'='E' from public.setlist_songs where id='history-a'),'undo order preserves later key edit');
select pg_temp.history_error($q$select public.reorder_workspace_setlist('history-list','["history-a","history-b"]','["history-a","history-a"]')$q$);
select pg_temp.history_error($q$select public.reorder_workspace_setlist('history-list','["history-b","history-a"]','["history-a","history-b"]')$q$);
select pg_temp.history_error($q$select public.patch_workspace_history('history-team','[{"resource":"order","id":"history-list","before":{"ids":["history-a","history-b"]},"after":{"ids":["history-b","history-a"]}},{"resource":"project","id":"history-project","before":{"name":"wrong"},"after":{"name":"bad"}}]')$q$);
select pg_temp.assert_history((select order_index=0 from public.setlist_songs where id='history-a'),'later patch failure rolls back earlier order');
select public.patch_workspace_history('history-team','[{"resource":"project","id":"history-project","before":{"name":"Original project"},"after":{"name":"Renamed"}}]');
select pg_temp.assert_history((select name='Renamed' and not archived from public.projects where id='history-project'),'metadata patch preserves unrelated fields');
select pg_temp.history_error($q$select public.patch_workspace_history('history-team','[{"resource":"project","id":"history-project","before":{"created_by":null},"after":{"created_by":"00000000-0000-0000-0000-000000000103"}}]')$q$);

select set_config('history.baseline',(select source_baseline::text from public.setlist_songs where id='history-a'),true);
update public.songs set content_json=content_json||'{"tempo":120}' where id='history-song';
select set_config('history.setlist_receipt',public.trash_workspace_resource('history-team','setlist','history-list','{"name":"Meeting"}')::text,true);
select public.restore_workspace_resource(current_setting('history.setlist_receipt')::uuid);
select pg_temp.assert_history((select count(*)=2 from public.setlist_songs where setlist_id='history-list'),'setlist songs restored with identities');
select pg_temp.assert_history((select source_baseline=current_setting('history.baseline')::jsonb from public.setlist_songs where id='history-a'),'server source baseline restored');
reset role;
select pg_temp.assert_history(exists(select 1 from public.user_setlist_memberships where setlist_id='history-list'),'setlist membership restored');
select pg_temp.assert_history(exists(select 1 from public.setlist_editor_assignments where setlist_id='history-list'),'editor assignment restored');
select pg_temp.assert_history((select capo=3 from public.user_setlist_capo_overrides where setlist_song_id='history-a'),'other member capo restored');
set local role authenticated;
select pg_temp.history_error($q$select public.trash_workspace_resources('history-team','[{"type":"setlist","id":"history-list","expected":{"name":"Meeting"}},{"type":"setlist","id":"history-list","expected":{"name":"Meeting"}}]')$q$);
select pg_temp.assert_history(exists(select 1 from public.setlists where id='history-list'),'batch failure restores the entire transaction');
select pg_temp.history_error($q$select public.trash_workspace_resource('history-team','entry','history-a','{"songId":"history-song","overrideKey":"C"}')$q$);
select pg_temp.assert_history(exists(select 1 from public.setlist_songs where id='history-a'),'changed entry is not deleted');
select public.patch_workspace_history('history-team','[{"resource":"song","id":"history-song","before":{"archivedAt":null},"after":{"archivedAt":"2026-10-28T01:02:03.123Z"}}]');
select public.patch_workspace_history('history-team','[{"resource":"song","id":"history-song","before":{"archivedAt":"2026-10-28T01:02:03.123Z"},"after":{"archivedAt":null}}]');
select pg_temp.assert_history((select archived_at is null from public.songs where id='history-song'),'source archive can undo with browser timestamp precision');
select set_config('history.entry_receipt',public.trash_workspace_resource('history-team','entry','history-a','{"songId":"history-song"}')::text,true);
select pg_temp.assert_history((select order_index=0 from public.setlist_songs where id='history-b'),'entry removal closes order gap');
select public.restore_workspace_resource(current_setting('history.entry_receipt')::uuid);
select pg_temp.assert_history((select order_index=0 from public.setlist_songs where id='history-a'),'entry original slot restored');

select set_config('history.batch',public.trash_workspace_resources('history-team','[{"type":"entry","id":"history-a","expected":{"songId":"history-song"}},{"type":"entry","id":"history-b","expected":{"songId":"history-song"}}]')::text,true);
select public.restore_workspace_resources(array(select (value->>'trashId')::uuid from jsonb_array_elements(current_setting('history.batch')::jsonb)));
select pg_temp.assert_history((select jsonb_agg(id order by order_index)='["history-a","history-b"]' from public.setlist_songs where setlist_id='history-list'),'batch entry restoration reverses deletion order atomically');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000104',true);
select set_config('history.assigned_receipt',public.trash_workspace_resource('history-team','setlist','history-list','{"name":"Meeting"}')::text,true);
select set_config('chordmaster.restore_trash_id',current_setting('history.assigned_receipt'),true);
select pg_temp.assert_history(not public.is_workspace_history_restore('history-list','history-team','history-project','00000000-0000-0000-0000-000000000101'),'client receipt GUC cannot forge trusted restore context');
select pg_temp.history_error($q$insert into public.setlists(id,library_id,name,project_id,created_by) values('history-list','history-team','Forged restore','history-project','00000000-0000-0000-0000-000000000104')$q$);
select pg_temp.history_error('insert into chordmaster_private.workspace_restore_context(backend_pid,transaction_id,trash_id) values(pg_backend_pid(),txid_current(),current_setting(''history.assigned_receipt'')::uuid)');
select public.restore_workspace_resource(current_setting('history.assigned_receipt')::uuid);
select pg_temp.assert_history(public.can_write_setlist('history-list'),'assigned editor can restore their deleted setlist');
select set_config('history.assigned_receipt',public.trash_workspace_resource('history-team','setlist','history-list','{"name":"Meeting"}')::text,true);
reset role;
update public.library_members set role='viewer' where library_id='history-team' and user_id='00000000-0000-0000-0000-000000000104';
set local role authenticated;
select pg_temp.history_error($q$select public.restore_workspace_resource(current_setting('history.assigned_receipt')::uuid)$q$);
reset role;
select pg_temp.assert_history(not exists(select 1 from public.setlists where id='history-list'),'demoted editor restore rolls back the entire setlist');
select pg_temp.assert_history(not exists(select 1 from public.setlist_editor_assignments where setlist_id='history-list'),'failed restore does not revive delegated access');
update public.library_members set role='editor' where library_id='history-team' and user_id='00000000-0000-0000-0000-000000000104';
set local role authenticated;
select public.restore_workspace_resource(current_setting('history.assigned_receipt')::uuid);
select set_config('history.revoke_receipt',public.trash_workspace_resource('history-team','project','history-editor-project','{"name":"Editor project","archived":false}')::text,true);
reset role;
update public.library_members set role='viewer' where library_id='history-team' and user_id='00000000-0000-0000-0000-000000000104';
set local role authenticated;
select pg_temp.history_error($q$select public.restore_workspace_resource(current_setting('history.revoke_receipt')::uuid)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
select pg_temp.history_error($q$select public.reorder_workspace_setlist('history-list','["history-a","history-b"]','["history-b","history-a"]')$q$);
select pg_temp.history_error($q$select public.trash_workspace_resource('history-team','setlist','history-list','{"name":"Meeting"}')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true);
select pg_temp.history_error($q$select public.restore_workspace_resource(current_setting('history.revoke_receipt')::uuid)$q$);
select pg_temp.history_error($q$select public.patch_workspace_history('history-team','[{"resource":"setlist","id":"history-list","before":{"name":"Meeting"},"after":{"name":"Hijacked"}}]')$q$);
reset role;
select pg_temp.assert_history(not has_function_privilege('anon','public.trash_workspace_resource(text,text,text,jsonb)','EXECUTE'),'anonymous cannot delete');
select pg_temp.assert_history(not has_function_privilege('anon','public.restore_workspace_resource(uuid)','EXECUTE'),'anonymous cannot restore');
rollback;
