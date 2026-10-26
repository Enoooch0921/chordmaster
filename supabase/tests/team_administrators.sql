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

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000002','admin');
select pg_temp.assert_true((select role='admin' from public.library_members where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000002'),'owner grants admin');
select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000003','editor');
select pg_temp.assert_true((select role='editor' from public.library_members where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000003'),'owner demotes admin');
select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000003','admin');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000001','admin')$q$,'owner cannot demote self');
select pg_temp.expect_error($q$update public.libraries set owner_user_id='10000000-0000-0000-0000-000000000002' where id='admin-test-team'$q$,'ownership immutable');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true(not public.is_library_owner('admin-test-team'),'admin is not owner');
select pg_temp.assert_true(public.can_manage_library_members('admin-test-team'),'admin manages members');
select pg_temp.assert_true(public.can_edit_library_content('admin-test-team'),'admin manages song library');
select pg_temp.assert_true(public.can_write_library('admin-test-team'),'legacy edge-function helper recognizes admin');
select pg_temp.assert_true(public.can_write_setlist('admin-test-owner-list'),'admin edits owner setlist');
select pg_temp.assert_true(public.can_write_project('admin-test-project'),'admin edits owner project');
select pg_temp.assert_true(public.can_manage_setlist_assignments('admin-test-owner-list'),'admin assigns setlist editors');
select pg_temp.assert_true(not public.can_manage_library_members('admin-test-other'),'admin is scoped to team');
select pg_temp.assert_true(public.can_manage_share_resource('setlist','admin-test-owner-list'),'admin can share owner setlist');
select pg_temp.assert_true(public.can_manage_share_resource('project','admin-test-project'),'admin can share owner project');
select pg_temp.assert_true(jsonb_array_length(public.get_team_management('admin-test-team')->'members')=6,'admin can read membership management');
update public.songs set title='Admin edit',updated_by=auth.uid() where id='admin-test-song';
select pg_temp.assert_true((select title='Admin edit' from public.songs where id='admin-test-song'),'admin writes song rows through RLS');
update public.projects set name='Admin project edit',updated_by=auth.uid() where id='admin-test-project';
select pg_temp.assert_true((select name='Admin project edit' from public.projects where id='admin-test-project'),'admin writes other creator project');
update public.setlists set name='Admin setlist edit',updated_by=auth.uid() where id='admin-test-owner-list';
select pg_temp.assert_true((select name='Admin setlist edit' from public.setlists where id='admin-test-owner-list'),'admin writes other creator setlist');
update public.setlist_songs set override_json=override_json || '{"expectedTeamRole":"admin"}'::jsonb where id='admin-test-original';
select pg_temp.assert_true((select not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-original'),'admin marker is not persisted');
select public.set_setlist_editor_assignment('admin-test-owner-list','10000000-0000-0000-0000-000000000006',true);
select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000005','setlist_manager');
select pg_temp.assert_true((select role='setlist_manager' from public.library_members where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000005'),'admin changes lower role');
select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000005','viewer');
update public.library_members set role='admin' where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000005';
select pg_temp.assert_true((select role='viewer' from public.library_members where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000005'),'admin cannot bypass role RPC through direct update');
select public.create_team_invite('admin-test-team','new-person@example.invalid','viewer');
select pg_temp.assert_true(exists(select 1 from public.team_invites where email='new-person@example.invalid'),'admin invites ordinary members');
select pg_temp.assert_true(public.create_team_invite('admin-test-team','default-person@example.invalid')->>'role'='viewer','two-argument invitation defaults to viewer');
select pg_temp.expect_error($q$select public.create_team_invite('admin-test-team','new-admin@example.invalid','admin')$q$,'admin invitation cannot grant admin');
select pg_temp.expect_error($q$insert into public.team_invites(library_id,email,role,token,invited_by) values ('admin-test-team','bypass@example.invalid','viewer','bypass',auth.uid())$q$,'direct invite writes blocked');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000005','admin')$q$,'admin cannot promote another admin');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000003','viewer')$q$,'admin cannot demote peer admin');
select pg_temp.expect_error($q$select public.remove_team_member('admin-test-team','10000000-0000-0000-0000-000000000003')$q$,'admin cannot remove peer admin');
select pg_temp.expect_error($q$select public.remove_team_member('admin-test-team','10000000-0000-0000-0000-000000000001')$q$,'admin cannot remove owner');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team','10000000-0000-0000-0000-000000000001','viewer')$q$,'admin cannot alter owner');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team',auth.uid(),'viewer')$q$,'admin cannot alter self');
select public.accept_team_invite('admin-test-stale-token');
select pg_temp.assert_true((select role='admin' from public.library_members where library_id='admin-test-team' and user_id=auth.uid()),'stale invite preserves granted admin role');
select public.remove_team_member('admin-test-team','10000000-0000-0000-0000-000000000006');
select pg_temp.assert_true(not exists(select 1 from public.library_members where library_id='admin-test-team' and user_id='10000000-0000-0000-0000-000000000006'),'admin removes ordinary members');

-- Managers choose songs/order/Key; the server exclusively supplies protected score fields.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-no-marker','admin-test-manager-list','admin-test-song','{}')$q$,'legacy manager insert fails visibly until reload');
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values
 ('admin-test-legacy-entry','admin-test-manager-list','admin-test-legacy-song','{"expectedTeamRole":"setlist_manager"}');
select pg_temp.assert_true((select jsonb_array_length(override_json->'songData'->'sections')=2 and override_json->'sectionOrder'='[]' from public.setlist_songs where id='admin-test-legacy-entry'),'legacy sections remain intact with default-order fallback');
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values
 ('admin-test-entry','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"setlist_manager","overrideKey":"E","songData":{"title":"Injected"},"sectionOrder":["injected"]}');
select pg_temp.assert_true((select override_json->'songData'=(select content_json from public.songs where id='admin-test-song') and override_json->'sectionOrder'='["verse","chorus"]' and not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-entry'),'manager insert uses canonical source chart and consumes role assertion');
update public.setlist_songs set order_index=2,override_json='{"expectedTeamRole":"setlist_manager","overrideKey":"F","songData":{"title":"Injected"},"sectionOrder":["injected"]}' where id='admin-test-entry';
select pg_temp.assert_true((select order_index=2 and override_json->>'overrideKey'='F' and override_json->'songData'=(select content_json from public.songs where id='admin-test-song') and override_json->'sectionOrder'='["verse","chorus"]' from public.setlist_songs where id='admin-test-entry'),'manager update accepts order and Key but preserves score and sections');
select pg_temp.expect_error($q$update public.setlist_songs set override_json='{"overrideKey":"G"}' where id='admin-test-entry'$q$,'missing role assertion rejects update');
select pg_temp.expect_error($q$update public.setlist_songs set override_json='{"expectedTeamRole":"editor","songData":{"title":"Lost draft"}}' where id='admin-test-entry'$q$,'editor downgraded during save rejects update');
select pg_temp.expect_error($q$update public.setlist_songs set override_json='{"expectedTeamRole":"admin","songData":{"title":"Lost draft"}}' where id='admin-test-entry'$q$,'admin downgraded during save rejects update');
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-entry','admin-test-manager-list','admin-test-song','{"overrideKey":"G"}') on conflict(id) do update set override_json=excluded.override_json$q$,'missing role assertion rejects upsert');
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-entry','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"editor","overrideKey":"G"}') on conflict(id) do update set override_json=excluded.override_json$q$,'editor downgrade rejects conflicting upsert');
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-entry','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"admin","overrideKey":"G"}') on conflict(id) do update set override_json=excluded.override_json$q$,'admin downgrade rejects conflicting upsert');
select pg_temp.assert_true((select override_json->>'overrideKey'='F' and not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-entry'),'rejected saves leave chart and role marker unchanged');
update public.songs set title='Manager injected',updated_by=auth.uid() where id='admin-test-song';
select pg_temp.assert_true((select title='Admin edit' from public.songs where id='admin-test-song'),'manager cannot write library score');
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values
 ('admin-test-copy','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"setlist_manager","overrideKey":"G","sourceSetlistSongId":"admin-test-original","songData":{"title":"Injected copy"}}');
select pg_temp.assert_true((select override_json->'songData'='{"title":"Approved arrangement","sections":[{"id":"chorus"}]}'::jsonb and override_json->'sectionOrder'='["chorus"]' and not(override_json ? 'sourceSetlistSongId') from public.setlist_songs where id='admin-test-copy'),'manager copy preserves trusted arrangement and consumes marker');
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-forged','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"setlist_manager","sourceSetlistSongId":"missing"}')$q$,'forged copy source rejected');
select pg_temp.expect_error($q$insert into public.setlist_songs(id,setlist_id,song_id,override_json) values ('admin-test-cross-copy','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"setlist_manager","sourceSetlistSongId":"admin-test-other-entry"}')$q$,'copy source from another library rejected');
select pg_temp.expect_error($q$update public.setlist_songs set id='renamed-entry', override_json=override_json || '{"expectedTeamRole":"setlist_manager"}'::jsonb where id='admin-test-entry'$q$,'manager entry identity immutable');
select pg_temp.expect_error($q$update public.setlist_songs set override_json='{"expectedTeamRole":"setlist_manager","overrideKey":"invalid"}' where id='admin-test-entry'$q$,'invalid shared key rejected');
reset role;
delete from public.setlist_songs where id='admin-test-original';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
insert into public.setlist_songs(id,setlist_id,song_id,override_json) values
 ('admin-test-copy','admin-test-manager-list','admin-test-song','{"expectedTeamRole":"setlist_manager","overrideKey":"A","sourceSetlistSongId":"admin-test-original"}')
on conflict(id) do update set override_json=excluded.override_json;
select pg_temp.assert_true((select override_json->>'overrideKey'='A' and override_json->'songData'->>'title'='Approved arrangement' from public.setlist_songs where id='admin-test-copy'),'saved copy remains editable after original removed');
select pg_temp.assert_true((select not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-copy'),'conflicting upsert consumes role assertion');

-- Shared-project managers retain their checked Key/order RPC path even when
-- they are also a setlist_manager in the team.
reset role;
insert into public.user_project_memberships(user_id,project_id,role) values
 ('10000000-0000-0000-0000-000000000004','admin-test-project','manager');
select set_config('request.jwt.claim.sub','',true);
update public.setlists set project_id='admin-test-project' where id='admin-test-manager-list';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select public.set_project_setlist_song_key('admin-test-copy','D');
select public.reorder_project_setlist('admin-test-manager-list','["admin-test-copy","admin-test-entry","admin-test-legacy-entry"]');
select pg_temp.assert_true((select override_json->>'overrideKey'='D' and order_index=0 and override_json->'songData'->>'title'='Approved arrangement' and not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-copy'),'checked shared-project RPCs preserve chart and remove assertion');
select public.set_project_setlist_song_key('admin-test-copy',null);
select pg_temp.assert_true((select not(override_json ? 'overrideKey') and not(override_json ? 'expectedTeamRole') from public.setlist_songs where id='admin-test-copy'),'shared-project key clear consumes assertion');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
update public.setlist_songs set override_json='{"overrideKey":"B"}' where id='admin-test-copy';
select pg_temp.assert_true((select not(override_json ? 'overrideKey') from public.setlist_songs where id='admin-test-copy'),'viewer cannot change shared Key');
insert into public.user_setlist_capo_overrides(user_id,setlist_song_id,capo) values(auth.uid(),'admin-test-copy',3);
select pg_temp.assert_true((select capo=3 from public.user_setlist_capo_overrides where user_id=auth.uid() and setlist_song_id='admin-test-copy'),'viewer retains personal Capo');
select pg_temp.expect_error($q$select public.update_team_member_role('admin-test-team',auth.uid(),'admin')$q$,'viewer cannot self escalate');
reset role;
select pg_temp.expect_error($q$insert into public.library_members(library_id,user_id,role) values('admin-test-personal','10000000-0000-0000-0000-000000000002','admin')$q$,'admin role is team-only');
select pg_temp.assert_true(not has_function_privilege('anon','public.update_team_member_role(text,uuid,text)','EXECUTE'),'anonymous role RPC denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.enforce_setlist_manager_arrangement()','EXECUTE'),'trigger is not callable API');
select pg_temp.assert_true(not has_function_privilege('anon','public.set_project_setlist_song_key(text,text)','EXECUTE') and not has_function_privilege('anon','public.reorder_project_setlist(text,jsonb)','EXECUTE'),'shared-project RPCs remain inaccessible anonymously');
select pg_temp.assert_true((select owner_user_id='10000000-0000-0000-0000-000000000001' from public.libraries where id='admin-test-team'),'original owner retained');
select pg_temp.assert_true((select count(*)=1 from public.library_members where library_id='admin-test-team' and role='owner'),'single-owner invariant retained');
rollback;
