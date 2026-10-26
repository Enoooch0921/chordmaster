\set ON_ERROR_STOP on
-- Disposable database only; verify the member directory matches team RLS scope.
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

insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('30000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
  'scope-test-' || i || '@example.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now()
from generate_series(1,6) i;
insert into public.profiles(id,email,display_name)
select id,email,email from auth.users where email like 'scope-test-%@example.invalid';
insert into public.libraries(id,name,kind,owner_user_id) values
 ('scope-team','Scope Team','team','30000000-0000-0000-0000-000000000001'),
 ('scope-other-team','Other Team','team','30000000-0000-0000-0000-000000000006');
insert into public.library_members(library_id,user_id,role) values
 ('scope-team','30000000-0000-0000-0000-000000000001','owner'),
 ('scope-team','30000000-0000-0000-0000-000000000002','admin'),
 ('scope-team','30000000-0000-0000-0000-000000000003','editor'),
 ('scope-team','30000000-0000-0000-0000-000000000004','setlist_manager'),
 ('scope-team','30000000-0000-0000-0000-000000000005','viewer'),
 ('scope-other-team','30000000-0000-0000-0000-000000000006','owner');
insert into public.projects(id,library_id,name,archived,created_by,updated_by) values
 ('scope-owner-project','scope-team','Owner Project',true,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('scope-editor-project','scope-team','Editor Project',false,'30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003'),
 ('scope-manager-project','scope-team','Manager Project',false,'30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004'),
 ('scope-viewer-project','scope-team','Historic Viewer Project',false,'30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000005'),
 ('scope-other-project','scope-other-team','Other Project',false,'30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000006');
insert into public.setlists(id,library_id,name,display_mode,project_id,archived,created_by,updated_by) values
 ('scope-owner-list','scope-team','Owner List','chord-fixed-key','scope-owner-project',true,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('scope-editor-list','scope-team','Editor List','chord-fixed-key','scope-editor-project',false,'30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003'),
 ('scope-manager-list','scope-team','Manager List','chord-fixed-key',null,false,'30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004'),
 ('scope-viewer-list','scope-team','Historic Viewer List','chord-fixed-key',null,false,'30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000005'),
 ('scope-other-list','scope-other-team','Other List','chord-fixed-key','scope-other-project',false,'30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000006');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select public.set_setlist_editor_assignment('scope-owner-list','30000000-0000-0000-0000-000000000003',true);
select public.set_setlist_editor_assignment('scope-owner-list','30000000-0000-0000-0000-000000000004',true);
select public.set_setlist_editor_assignment('scope-editor-list','30000000-0000-0000-0000-000000000003',true);
create temporary table scope_directory on commit drop as
select member->>'userId' as user_id, member->'scope' as scope
from jsonb_array_elements(public.get_team_management('scope-team')->'members') member;
select pg_temp.assert_true((select count(*)=5 from scope_directory),'directory contains only this team members');
select pg_temp.assert_true((select jsonb_array_length(scope->'projects')=4 and jsonb_array_length(scope->'setlists')=4 from scope_directory where user_id='30000000-0000-0000-0000-000000000001'),'owner scope includes all team resources');
select pg_temp.assert_true((select jsonb_array_length(scope->'projects')=4 and jsonb_array_length(scope->'setlists')=4 from scope_directory where user_id='30000000-0000-0000-0000-000000000002'),'admin scope includes all team resources');
select pg_temp.assert_true((select bool_and(item->>'access'='administrator') from scope_directory directory cross join lateral jsonb_array_elements(directory.scope->'setlists') item where directory.user_id='30000000-0000-0000-0000-000000000002'),'admin access to other creators lists is identified');
select pg_temp.assert_true((select scope->'projects'='[{"id":"scope-editor-project","name":"Editor Project","archived":false}]'::jsonb and jsonb_array_length(scope->'setlists')=2 from scope_directory where user_id='30000000-0000-0000-0000-000000000003'),'editor scope has only own project and own or assigned lists');
select pg_temp.assert_true((select item->>'access'='created' from scope_directory directory cross join lateral jsonb_array_elements(directory.scope->'setlists') item where directory.user_id='30000000-0000-0000-0000-000000000003' and item->>'id'='scope-editor-list'),'created and assigned list appears once with created precedence');
select pg_temp.assert_true((select item->>'access'='assigned' and (item->>'archived')::boolean and item->>'projectId'='scope-owner-project' from scope_directory directory cross join lateral jsonb_array_elements(directory.scope->'setlists') item where directory.user_id='30000000-0000-0000-0000-000000000004' and item->>'id'='scope-owner-list'),'assigned scope includes archived flag and owning project');
select pg_temp.assert_true((select scope->'projects'='[{"id":"scope-manager-project","name":"Manager Project","archived":false}]'::jsonb and jsonb_array_length(scope->'setlists')=2 from scope_directory where user_id='30000000-0000-0000-0000-000000000004'),'manager own and assigned scope matches access rules');
select pg_temp.assert_true((select scope='{"projects":[],"setlists":[]}'::jsonb from scope_directory where user_id='30000000-0000-0000-0000-000000000005'),'viewer has no editable scope even for historic created resources');
select pg_temp.assert_true(not exists(select 1 from scope_directory directory cross join lateral jsonb_array_elements((directory.scope->'projects') || (directory.scope->'setlists')) item where item->>'id' like 'scope-other-%'),'directory never leaks another team resources');
select pg_temp.assert_true((select scope#>>'{setlists,1,id}'='scope-owner-list' from scope_directory where user_id='30000000-0000-0000-0000-000000000004'),'active resources precede archived resources');

-- Scope is server-derived on each read, including assignment removal and downgrade.
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select pg_temp.expect_error($q$select public.get_team_management('scope-team')$q$,'setlist manager cannot inspect full member directory');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select public.set_setlist_editor_assignment('scope-owner-list','30000000-0000-0000-0000-000000000004',false);
select pg_temp.assert_true((select jsonb_array_length(member#>'{scope,setlists}')=1 from jsonb_array_elements(public.get_team_management('scope-team')->'members') member where member->>'userId'='30000000-0000-0000-0000-000000000004'),'assignment removal immediately updates scope');
select public.set_setlist_editor_assignment('scope-owner-list','30000000-0000-0000-0000-000000000004',true);
select public.update_team_member_role('scope-team','30000000-0000-0000-0000-000000000004','viewer');
select pg_temp.assert_true((select member->'scope'='{"projects":[],"setlists":[]}'::jsonb from jsonb_array_elements(public.get_team_management('scope-team')->'members') member where member->>'userId'='30000000-0000-0000-0000-000000000004'),'role downgrade removes editable project and list scope');
select pg_temp.assert_true(not exists(select 1 from public.setlist_editor_assignments where library_id='scope-team' and user_id='30000000-0000-0000-0000-000000000004'),'role downgrade removes stored assignments');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true(jsonb_array_length(public.get_team_management('scope-team')->'members')=5,'admin can inspect recipient scope');
select pg_temp.expect_error($q$select public.get_team_management('scope-other-team')$q$,'admin cannot inspect another team directory');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select pg_temp.expect_error($q$select public.get_team_management('scope-team')$q$,'editor cannot inspect full member directory');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000005',true);
select pg_temp.expect_error($q$select public.get_team_management('scope-team')$q$,'viewer cannot inspect full member directory');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_team_management(text)','EXECUTE'),'anonymous member directory access remains denied');
rollback;
