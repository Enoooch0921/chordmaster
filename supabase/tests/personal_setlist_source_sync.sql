\set ON_ERROR_STOP on
-- Disposable database only; no production score data is used.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.expect_error(statement text,message text) returns void language plpgsql as $$
begin begin execute statement; exception when others then return; end;
raise exception 'ASSERTION FAILED (expected rejection): %',message; end $$;
insert into auth.users(id,email) values
 ('20000000-0000-0000-0000-000000000001','personal-owner@example.invalid'),
 ('20000000-0000-0000-0000-000000000002','other-owner@example.invalid');
insert into public.profiles(id,email,display_name) select id,email,email from auth.users where id::text like '20000000%';
insert into public.libraries(id,name,kind,owner_user_id) values
 ('personal-a','A','personal','20000000-0000-0000-0000-000000000001'),
 ('personal-b','B','personal','20000000-0000-0000-0000-000000000002');
insert into public.library_members(library_id,user_id,role) values
 ('personal-a','20000000-0000-0000-0000-000000000001','owner'),
 ('personal-b','20000000-0000-0000-0000-000000000002','owner');
insert into public.songs(id,library_id,title,content_json,created_by,updated_by) values
 ('personal-song','personal-a','Song','{"title":"Song","originalKey":"C","currentKey":"D","capo":2,"barRowCount":3,"timeSignature":"4/4","sections":[{"id":"v","title":"Verse","bars":[{"id":"b","chords":["C"]}]}]}','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into public.setlists(id,library_id,name,display_mode,created_by,updated_by) values
 ('personal-list','personal-a','個人歌單','chord-movable-key','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into public.setlist_songs(id,setlist_id,song_id,override_json)
 select v.id,'personal-list','personal-song',jsonb_build_object('songData',s.content_json,'overrideKey','E','sectionOrder','["v","v"]'::jsonb)
 from public.songs s cross join (values('personal-entry'),('personal-copy')) v(id) where s.id='personal-song';
select pg_temp.assert_true((select source_baseline is not null from public.setlist_songs where id='personal-entry'),'personal insert captures a real baseline');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
create function pg_temp.status(entry_id text) returns text language sql as $$ select public.preview_setlist_source_sync('personal-a',entry_id)->>'syncStatus' $$;
create function pg_temp.apply(entry_id text,direction text,resolve_conflict boolean default false) returns jsonb language plpgsql as $$
declare p jsonb; begin p:=public.preview_setlist_source_sync('personal-a',entry_id);
return public.reconcile_setlist_source('personal-a',entry_id,(p#>>'{source,updated_at}')::timestamptz,p#>'{entry,override_json}',p#>'{source,content_json}',p#>'{entry,source_baseline}',direction,resolve_conflict);end $$;
select pg_temp.assert_true(public.can_reconcile_setlist_source('personal-a'),'owner may reconcile own personal library');
select pg_temp.assert_true(not public.can_reconcile_setlist_source('personal-b'),'owner cannot reconcile another personal library');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["G"]') where id='personal-entry';
select pg_temp.assert_true(pg_temp.status('personal-entry')='setlist-changed','personal edits are distinguished from source edits');
select pg_temp.assert_true((select count(*)=0 from public.setlist_source_sync_history),'preview does not write backups or scores');
select pg_temp.apply('personal-entry','to-library');
select pg_temp.assert_true((select content_json#>>'{sections,0,bars,0,chords,0}'='G' and content_json->>'currentKey'='D' and content_json->>'capo'='2' and content_json->>'barRowCount'='3' from public.songs where id='personal-song'),'personal upload preserves reading preferences');
select pg_temp.assert_true(pg_temp.status('personal-entry')='aligned' and pg_temp.status('personal-copy')='source-newer','only the accepted baseline advances');
select pg_temp.assert_true((select count(*)=1 and bool_and(before_json#>>'{content_json,sections,0,bars,0,chords,0}'='C') from public.setlist_source_sync_history),'owner can read complete sync backups');
select pg_temp.expect_error($q$select pg_temp.apply('personal-copy','to-library')$q$,'stale personal copy cannot overwrite newer source');
select pg_temp.apply('personal-copy','to-setlist');
select pg_temp.assert_true((select override_json->>'overrideKey'='E' and override_json->'sectionOrder'='["v","v"]'::jsonb from public.setlist_songs where id='personal-copy'),'download preserves personal Key and repeated order');
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,sections,0,bars,0,chords}','["F"]') where id='personal-entry';
update public.songs set content_json=jsonb_set(content_json,'{sections,0,bars,0,chords}','["Am"]'),updated_by=auth.uid() where id='personal-song';
select pg_temp.assert_true(pg_temp.status('personal-entry')='conflict','personal edits on both sides require an explicit choice');
select pg_temp.expect_error($q$select pg_temp.apply('personal-entry','to-library')$q$,'personal conflict cannot be blindly uploaded');
select pg_temp.apply('personal-entry','to-setlist',true);
select pg_temp.assert_true(pg_temp.status('personal-entry')='aligned','personal conflict can accept the reviewed library version');
create temp table stale_preview as select public.preview_setlist_source_sync('personal-a','personal-entry') p;
update public.setlist_songs set override_json=jsonb_set(override_json,'{songData,title}','"Concurrent edit"') where id='personal-entry';
select pg_temp.expect_error($q$select public.reconcile_setlist_source('personal-a','personal-entry',(p#>>'{source,updated_at}')::timestamptz,p#>'{entry,override_json}',p#>'{source,content_json}',p#>'{entry,source_baseline}','to-library',true) from stale_preview$q$,'concurrent personal score edit rejects stale confirmation');
select pg_temp.expect_error($q$update public.setlist_source_sync_history set before_json='{}'$q$,'personal backups cannot be rewritten');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true(not public.can_reconcile_setlist_source('personal-a'),'other account cannot gain personal sync access');
select pg_temp.assert_true((select count(*)=0 from public.setlist_source_sync_history),'other account cannot read personal backups');
select pg_temp.expect_error($q$select public.preview_setlist_source_sync('personal-a','personal-entry')$q$,'cross-account preview rejected');
select pg_temp.expect_error($q$select public.reconcile_setlist_source('personal-a','personal-entry',now(),'{}','{}',null,'to-library',true)$q$,'cross-account write rejected');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.can_reconcile_setlist_source(text)','execute'),'anonymous sync helper rejected');
rollback;
