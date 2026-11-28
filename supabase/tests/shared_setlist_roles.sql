-- Exercise live permissions as authenticated accounts in disposable PostgreSQL.
begin;
create function pg_temp.check_value(ok boolean, reason text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Failed: %', reason; end if;
end; $$;
create function pg_temp.check_denied(command text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when raise_exception or insufficient_privilege then
    if sqlerrm = 'Access denied' then return; end if;
    raise;
  end;
  raise exception 'Expected access denial';
end; $$;

insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','owner@example.invalid'),
 ('11000000-0000-4000-8000-000000000002','guest@example.invalid');
insert into public.libraries(id,name,kind,owner_user_id) values
 ('role-lib','Library','personal','11000000-0000-4000-8000-000000000001');
insert into public.library_members(library_id,user_id,role) values
 ('role-lib','11000000-0000-4000-8000-000000000001','owner') on conflict do nothing;
insert into public.projects(id,library_id,name,created_by,updated_by) values
 ('project','role-lib','Project','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,project_id,created_by,updated_by) values
 ('direct','role-lib','Direct','chord-fixed-key',null,'11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
 ('sibling','role-lib','Sibling','chord-fixed-key','project','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('song','role-lib','Song','{"sections":[]}','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json) values
 ('a','direct','song',0,'{"songData":{"title":"Copy"}}'),('b','direct','song',1,'{}'),('c','sibling','song',0,'{}');
insert into public.user_setlist_memberships(user_id,setlist_id) values ('11000000-0000-4000-8000-000000000002','direct');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select pg_temp.check_value(public.get_joined_setlists()#>>'{0,role}' = 'viewer','new memberships are viewers');
select pg_temp.check_denied($q$select public.set_project_setlist_song_key('a','G')$q$);
select pg_temp.check_denied($q$select public.save_shared_setlist_song_settings('direct','a','{"tempo":100}')$q$);
select pg_temp.check_denied($q$select public.set_setlist_member_role('direct',auth.uid(),'manager')$q$);
create temp table initial_version as select public.get_joined_workspace_snapshot()->>'version' as version;

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select public.set_setlist_member_role('direct','11000000-0000-4000-8000-000000000002','manager');
select pg_temp.check_value(public.get_setlist_share_status('direct')#>>'{participants,0,role}'='manager','owner sees saved role');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select pg_temp.check_value(public.get_joined_workspace_snapshot((select version from initial_version))#>>'{payload,setlists,0,role}'='manager','poll receives new role');
select public.set_project_setlist_song_key('a','G');
select public.reorder_workspace_setlist('direct','["a","b"]','["b","a"]');
select pg_temp.check_value(public.get_joined_setlists()#>>'{0,songs,1,overrideKey}'='G','manager changes key and order');
select pg_temp.check_value(public.get_joined_setlists()#>>'{0,songs,1,songData,title}'='Copy','score copy preserved');
select public.save_shared_setlist_song_settings('direct','a','{"tempo":100,"setlistSongMap":[{"label":"Verse","repeats":2}]}');
select public.save_shared_setlist_song_settings('direct','a','{"translator":"Translated","showSongMap":true}');
select pg_temp.check_value(public.get_joined_setlists()#>'{0,songs,1}' @> '{"overrideKey":"G","songData":{"title":"Copy","tempo":100,"translator":"Translated","showSongMap":true,"setlistSongMap":[{"label":"Verse","repeats":2}]}}', 'settings, map and shared key are all preserved');
select public.save_shared_setlist_song_settings('direct','a','{"setlistSongMap":null,"translator":null}');
select pg_temp.check_value(not (public.get_joined_setlists()#>'{0,songs,1,songData}' ?| array['setlistSongMap','translator']),'can clear optional fields and inherit the default map');
select pg_temp.check_value(public.save_shared_setlist_song_settings('direct','b','{"showSongMap":true}') @> '{"sections":[],"showSongMap":true}', 'entry with no copy inherits the full source chart');
select pg_temp.check_denied($q$select public.save_shared_setlist_song_settings('direct','c','{"title":"Other setlist"}')$q$);
do $$ begin
  perform public.save_shared_setlist_song_settings('direct','a','{"sections":[{"title":"Overwritten"}]}');
  raise exception 'Expected rejection of a protected score field';
exception when invalid_parameter_value then null;
end $$;
select public.reorder_workspace_setlist('direct','["b","a"]','["a","b"]');
select pg_temp.check_denied($q$select public.set_project_setlist_song_key('c','D')$q$);
select pg_temp.check_denied($q$select public.get_setlist_share_status('direct')$q$);
select pg_temp.check_denied($q$select public.set_setlist_member_role('direct',auth.uid(),'viewer')$q$);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select public.set_setlist_member_role('direct','11000000-0000-4000-8000-000000000002','viewer');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select pg_temp.check_denied($q$select public.set_project_setlist_song_key('a','D')$q$);
select pg_temp.check_denied($q$select public.reorder_workspace_setlist('direct','["a","b"]','["b","a"]')$q$);
select pg_temp.check_denied($q$select public.save_shared_setlist_song_settings('direct','a','{"title":"After demotion"}')$q$);

reset role;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_value((select content_json from public.songs where id='song')='{"sections":[]}', 'library source is unchanged');
select pg_temp.check_value(not (select override_json ? 'sharedSongSettings' from public.setlist_songs where id='a'), 'patch assertion is transient');
update public.setlists set project_id='project' where id='direct';
insert into public.user_project_memberships(user_id,project_id,role) values
 ('11000000-0000-4000-8000-000000000002','project','manager');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select public.set_project_setlist_song_key('a','D');
select public.reorder_workspace_setlist('direct','["a","b"]','["b","a"]');
select pg_temp.check_value(public.save_shared_setlist_song_settings('sibling','c','{"title":"Project arrangement"}') @> '{"title":"Project arrangement","sections":[]}', 'project manager can edit the service settings');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select pg_temp.check_value(public.get_setlist_share_status('direct')#>>'{participants,0,inheritsProjectManager}'='true','direct viewer also inherits project grant');
select pg_temp.check_value(not has_function_privilege('anon','public.set_setlist_member_role(text,uuid,text)','execute'),'anonymous role changes unavailable');
select pg_temp.check_value(not has_function_privilege('anon','public.save_shared_setlist_song_settings(text,text,jsonb)','execute'),'anonymous song settings unavailable');

reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.libraries(id,name,kind,owner_user_id) values
 ('role-team','Team','team','11000000-0000-4000-8000-000000000001');
insert into public.library_members(library_id,user_id,role) values
 ('role-team','11000000-0000-4000-8000-000000000002','setlist_manager');
insert into public.setlists(id,library_id,name,display_mode,created_by,updated_by) values
 ('team-list','role-team','Team list','chord-fixed-key','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('team-song','role-team','Song','{"sections":[]}','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,order_index,override_json) values
 ('team-entry','team-list','team-song',0,'{"overrideKey":"C"}');
insert into public.user_setlist_memberships(user_id,setlist_id,role) values
 ('11000000-0000-4000-8000-000000000002','team-list','manager');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select pg_temp.check_value(public.save_shared_setlist_song_settings('team-list','team-entry','{"title":"Service copy"}') @> '{"title":"Service copy","sections":[]}', 'a team arranger with a separate shared grant can update service settings');
reset role;
select pg_temp.check_value((select override_json from public.setlist_songs where id='team-entry') = '{"overrideKey":"C","songData":{"title":"Service copy","sections":[]}}', 'the team trigger preserves the key and removes the patch assertion');
rollback;
