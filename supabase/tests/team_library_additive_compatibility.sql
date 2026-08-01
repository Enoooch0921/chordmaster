\set ON_ERROR_STOP on

-- Run on a disposable database after 20260801090000 and before
-- 20260801100000. This verifies the rolling-deploy compatibility window:
-- legacy editors keep broad setlist access while new setlist managers use
-- creator/assignment scope. The whole fixture is rolled back.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(p_sql text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION FAILED (expected error): %', p_message;
end;
$$;

insert into auth.users (
  id, email, aud, role, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('10000000-0000-0000-0000-000000000001', 'compat-owner@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'compat-editor@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'compat-manager@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'compat-viewer@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'compat-owner@test.local', 'Compat Owner'),
  ('10000000-0000-0000-0000-000000000002', 'compat-editor@test.local', 'Compat Editor'),
  ('10000000-0000-0000-0000-000000000003', 'compat-manager@test.local', 'Compat Setlist Editor'),
  ('10000000-0000-0000-0000-000000000004', 'compat-viewer@test.local', 'Compat Viewer')
on conflict (id) do nothing;

insert into public.libraries (id, name, kind, owner_user_id)
values
  (
    'compat-team', 'Compatibility Team', 'team',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    'compat-editor-personal', 'Compatibility Editor Personal', 'personal',
    '10000000-0000-0000-0000-000000000002'
  );

insert into public.library_members (library_id, user_id, role)
values
  ('compat-team', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('compat-team', '10000000-0000-0000-0000-000000000002', 'editor'),
  ('compat-team', '10000000-0000-0000-0000-000000000003', 'setlist_manager'),
  ('compat-team', '10000000-0000-0000-0000-000000000004', 'viewer'),
  ('compat-editor-personal', '10000000-0000-0000-0000-000000000002', 'owner');

insert into public.projects(id, library_id, name, created_by, updated_by)
values
  ('compat-owner-project', 'compat-team', 'Owner Project', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('compat-editor-project', 'compat-team', 'Editor Project', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');

insert into public.setlists (
  id, library_id, name, display_mode, show_lyrics, project_id, created_by, updated_by
)
values
  ('compat-owner-setlist', 'compat-team', 'Owner Setlist', 'full', false, 'compat-owner-project', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('compat-owner-in-editor-project', 'compat-team', 'Owner In Editor Project', 'full', false, 'compat-editor-project', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('compat-editor-setlist', 'compat-team', 'Editor Setlist', 'full', false, 'compat-editor-project', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('compat-manager-setlist', 'compat-team', 'Manager Setlist', 'full', false, null, '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003');

insert into public.songs(
  id, library_id, title, content_json, created_by, updated_by, archived_at, archived_by
)
values
  ('compat-unarchived', 'compat-team', 'Unarchived', '{"id":"compat-unarchived","title":"Unarchived","sections":[]}', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null, null),
  ('compat-archived-ref', 'compat-team', 'Archived Ref', '{"id":"compat-archived-ref","title":"Archived Ref","sections":[]}', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001'),
  ('compat-archived-free', 'compat-team', 'Archived Free', '{"id":"compat-archived-free","title":"Archived Free","sections":[]}', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001'),
  ('compat-archived-share', 'compat-team', 'Archived Share', '{"id":"compat-archived-share","title":"Archived Share","sections":[]}', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001'),
  ('compat-personal-song', 'compat-editor-personal', 'Personal Song', '{"id":"compat-personal-song","title":"Personal Song","sections":[]}', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', null, null);

insert into public.setlist_songs(id, setlist_id, song_id)
values ('compat-reference', 'compat-owner-setlist', 'compat-archived-ref');

insert into public.share_links(resource_type, resource_id, token, created_by)
values ('song', 'compat-archived-share', 'compat-active-song-token', '10000000-0000-0000-0000-000000000001');
insert into public.song_share_bundles(id, library_id, created_by)
values ('compat-team-bundle', 'compat-team', '10000000-0000-0000-0000-000000000001');
select pg_temp.expect_error(
  $$insert into public.song_share_bundle_items(bundle_id,song_id,order_index)
    values ('compat-team-bundle','compat-personal-song',0)$$,
  'additive phase rejects a cross-library shared-song bundle item'
);

select pg_temp.expect_error(
  $$delete from public.libraries where id='compat-team'$$,
  'additive phase blocks administrative cascade deletion of a team library'
);
select pg_temp.expect_error(
  $$delete from public.songs where id='compat-unarchived'$$,
  'additive phase blocks direct deletion before archive'
);
select pg_temp.expect_error(
  $$delete from public.songs where id='compat-archived-ref'$$,
  'additive phase blocks direct deletion with a setlist reference'
);
select pg_temp.expect_error(
  $$delete from public.songs where id='compat-archived-share'$$,
  'additive phase blocks direct deletion with an active share reference'
);
delete from public.songs where id='compat-archived-free';
select pg_temp.assert_true(
  not exists (select 1 from public.songs where id='compat-archived-free'),
  'additive phase permits a safe archived unreferenced direct delete'
);

insert into public.setlist_editor_assignments (
  setlist_id, library_id, user_id, assigned_by
)
values (
  'compat-owner-setlist', 'compat-team',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  public.can_write_setlist('compat-editor-setlist'),
  'owner writes every setlist during compatibility stage'
);
select pg_temp.expect_error(
  $$update public.libraries set kind='personal' where id='compat-team'$$,
  'library kind is immutable during compatibility stage'
);
select pg_temp.expect_error(
  $$delete from public.libraries where id='compat-team'$$,
  'team owner cannot directly cascade-delete the team library during compatibility'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  public.can_write_setlist('compat-owner-setlist')
  and public.can_write_setlist('compat-manager-setlist'),
  'legacy editor keeps library-wide setlist access during rolling deploy'
);
select pg_temp.expect_error(
  $$update public.songs
    set library_id='compat-editor-personal',
        updated_by='10000000-0000-0000-0000-000000000002'
    where id='compat-unarchived'$$,
  'compatibility stage prevents moving a team song to a personal library'
);
select pg_temp.expect_error(
  $$update public.setlists
    set library_id='compat-editor-personal',
        updated_by='10000000-0000-0000-0000-000000000002'
    where id='compat-editor-setlist'$$,
  'compatibility stage keeps setlist library identity immutable'
);
select pg_temp.expect_error(
  $$update public.projects
    set library_id='compat-editor-personal',
        updated_by='10000000-0000-0000-0000-000000000002'
    where id='compat-editor-project'$$,
  'compatibility stage keeps project library identity immutable'
);
select pg_temp.expect_error(
  $$insert into public.setlist_songs(id,setlist_id,song_id)
    values ('compat-cross-library-song','compat-editor-setlist','compat-personal-song')$$,
  'compatibility stage rejects a cross-library setlist song relation'
);
select pg_temp.assert_true(
  (select library_id from public.songs where id='compat-unarchived')='compat-team'
  and (select library_id from public.setlists where id='compat-editor-setlist')='compat-team'
  and (select library_id from public.projects where id='compat-editor-project')='compat-team'
  and not exists (
    select 1 from public.setlist_songs where id='compat-cross-library-song'
  ),
  'failed compatibility-stage cross-library writes leave no partial mutations'
);
select pg_temp.expect_error(
  $$update public.setlists
    set project_id='compat-owner-project', updated_by='10000000-0000-0000-0000-000000000002'
    where id='compat-editor-setlist'$$,
  'compatibility stage blocks attachment to an unowned same-team project'
);
select pg_temp.expect_error(
  $$update public.setlists
    set project_id=null, updated_by='10000000-0000-0000-0000-000000000002'
    where id='compat-owner-setlist'$$,
  'compatibility stage blocks removal from an unowned same-team project'
);
update public.setlists
set project_id=null, updated_by='10000000-0000-0000-0000-000000000002'
where id='compat-editor-setlist';
update public.setlists
set project_id='compat-editor-project', updated_by='10000000-0000-0000-0000-000000000002'
where id='compat-editor-setlist';
delete from public.projects where id='compat-editor-project';
select pg_temp.assert_true(
  not exists (select 1 from public.projects where id='compat-editor-project')
  and (select project_id is null from public.setlists where id='compat-editor-setlist')
  and (select project_id is null from public.setlists where id='compat-owner-in-editor-project'),
  'compatibility project deletion lets FK ON DELETE SET NULL detach every child setlist'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true(
  public.can_write_setlist('compat-manager-setlist'),
  'setlist manager writes a self-created setlist'
);
select pg_temp.assert_true(
  public.can_write_setlist('compat-owner-setlist'),
  'setlist manager writes an explicitly assigned setlist'
);
update public.setlists
set name='Owner Setlist Edited By Assignee',
    updated_by='10000000-0000-0000-0000-000000000003'
where id='compat-owner-setlist';
select pg_temp.assert_true(
  (select name from public.setlists where id='compat-owner-setlist') =
    'Owner Setlist Edited By Assignee',
  'assigned setlist manager passes the compatibility UPDATE policy end to end'
);
select pg_temp.assert_true(
  not public.can_write_setlist('compat-editor-setlist'),
  'setlist manager cannot write an unassigned foreign setlist'
);
select pg_temp.expect_error(
  $$update public.setlists
    set project_id=null, updated_by='10000000-0000-0000-0000-000000000003'
    where id='compat-owner-setlist'$$,
  'assigned setlist manager cannot remove a setlist from an unowned project'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true(
  not public.can_write_setlist('compat-owner-setlist'),
  'viewer remains read-only during compatibility stage'
);
reset role;

select pg_temp.assert_true(
  (
    select count(*)=5
    from pg_trigger t
    where t.tgname in (
      'auth_users_reference_graph_statement_lock',
      'songs_reference_graph_statement_lock',
      'share_links_reference_graph_statement_lock',
      'song_share_bundle_items_reference_graph_statement_lock',
      'setlist_songs_reference_graph_statement_lock'
    )
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%for each statement%'
  )
  and exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'auth_users_reference_graph_statement_lock'
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%before delete on auth.users%'
      and lower(pg_get_triggerdef(t.oid)) like '%for each statement%'
  )
  and not exists (
    select 1
    from pg_trigger t
    where t.tgname in (
      'share_links_reference_graph_statement_lock',
      'song_share_bundle_items_reference_graph_statement_lock',
      'setlist_songs_reference_graph_statement_lock'
    )
      and not t.tgisinternal
      and lower(pg_get_triggerdef(t.oid)) like '%delete%'
  )
  and not exists (
    select 1
    from pg_trigger t
    where t.tgname in (
      'setlists_share_parent_statement_lock',
      'song_share_bundles_share_parent_statement_lock'
    )
      and not t.tgisinternal
  ),
  'compatibility stage gates auth-user cascade roots and reference additions but leaves reference removal ungated'
);

select pg_temp.assert_true(
  (
    select c.relreplident = 'f'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'setlist_editor_assignments'
  ),
  'compatibility migration preserves assignment library_id in DELETE payloads'
);

rollback;
