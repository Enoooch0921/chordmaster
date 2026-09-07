\set ON_ERROR_STOP on

-- Run against a disposable local Supabase database after all migrations.
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
  ('20000000-0000-0000-0000-000000000001', 'invite-owner@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'invitee@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000003', 'other@test.local', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, email, display_name)
values
  ('20000000-0000-0000-0000-000000000001', 'invite-owner@test.local', 'Invite Owner'),
  ('20000000-0000-0000-0000-000000000002', 'invitee@test.local', 'Invitee'),
  ('20000000-0000-0000-0000-000000000003', 'other@test.local', 'Other User');

insert into public.libraries (id, name, kind, owner_user_id)
values ('invite-inbox-team', 'Inbox Team', 'team', '20000000-0000-0000-0000-000000000001');

insert into public.library_members (library_id, user_id, role)
values ('invite-inbox-team', '20000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select public.create_team_invite('invite-inbox-team', 'invitee@test.local', 'setlist_manager');
select public.create_team_invite('invite-inbox-team', 'invitee@test.local', 'setlist_manager');
reset role;

-- The second create replaces the first and must leave exactly one live invite
-- and one inbox notification for an account that already exists.
select pg_temp.assert_true(
  (select count(*) from public.team_invites where library_id = 'invite-inbox-team' and revoked_at is null) = 1,
  're-inviting replaces the previous pending invitation'
);
select pg_temp.assert_true(
  (select count(*) from public.notifications where recipient_user_id = '20000000-0000-0000-0000-000000000002' and type = 'team_invite') = 1,
  'an existing invitee receives one in-app notification'
);

select id::text as live_invite_id
from public.team_invites
where library_id = 'invite-inbox-team' and revoked_at is null
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true(jsonb_array_length(public.get_my_team_invites()) = 0, 'another account cannot discover the invitation');
select pg_temp.expect_error(
  format('select public.accept_my_team_invite(%L::uuid)', :'live_invite_id'),
  'another account cannot accept the invitation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(
  public.get_my_team_invites() #>> '{0,libraryName}' = 'Inbox Team',
  'the invitee sees the team invitation in their inbox'
);
select public.accept_my_team_invite(:'live_invite_id'::uuid);
reset role;

select pg_temp.assert_true(
  exists (
    select 1 from public.library_members
    where library_id = 'invite-inbox-team'
      and user_id = '20000000-0000-0000-0000-000000000002'
      and role = 'setlist_manager'
  ),
  'accepting creates the requested team membership'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.notifications
    where recipient_user_id = '20000000-0000-0000-0000-000000000002'
      and type = 'team_invite'
  ),
  'accepting clears the invite notification'
);

rollback;

\echo 'team_invite_inbox.sql: all assertions passed'
