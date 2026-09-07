-- Make team invitations discoverable inside the app. Existing accounts receive
-- a bell notification, while every signed-in invitee can list, accept, or
-- decline invitations addressed to their verified auth email.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('resource_shared', 'member_promoted', 'member_demoted', 'access_removed', 'team_invite'));

alter table public.notifications drop constraint if exists notifications_resource_type_check;
alter table public.notifications add constraint notifications_resource_type_check
  check (resource_type in ('setlist', 'project', 'team'));

create or replace function public.create_team_invite(p_library_id text, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_role text := p_role;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_invite public.team_invites;
  v_library_name text;
  v_recipient_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not public.can_manage_library_members(p_library_id) then
    raise exception 'Access denied';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid invite email is required';
  end if;

  if v_role not in ('editor', 'setlist_manager', 'viewer') then
    raise exception 'Invalid role';
  end if;

  if exists (
    select 1
    from public.library_members lm
    join auth.users u on u.id = lm.user_id
    where lm.library_id = p_library_id
      and lower(u.email) = v_email
  ) then
    raise exception 'This person is already a team member';
  end if;

  -- Retire the prior invitation and its inbox item before issuing a fresh one.
  delete from public.notifications n
  where n.type = 'team_invite'
    and n.resource_type = 'team'
    and n.resource_id in (
      select ti.id::text
      from public.team_invites ti
      where ti.library_id = p_library_id
        and lower(ti.email) = v_email
        and ti.accepted_at is null
        and ti.revoked_at is null
    );

  update public.team_invites
  set revoked_at = now()
  where library_id = p_library_id
    and lower(email) = v_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.team_invites (library_id, email, role, token, invited_by, expires_at)
  values (p_library_id, v_email, v_role, v_token, auth.uid(), now() + interval '30 days')
  returning * into v_invite;

  select l.name into v_library_name
  from public.libraries l
  where l.id = p_library_id;

  select u.id into v_recipient_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_recipient_id is not null and v_recipient_id <> auth.uid() then
    insert into public.notifications (
      recipient_user_id,
      actor_user_id,
      type,
      resource_type,
      resource_id,
      resource_name
    ) values (
      v_recipient_id,
      auth.uid(),
      'team_invite',
      'team',
      v_invite.id::text,
      coalesce(v_library_name, '')
    );
  end if;

  return jsonb_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'role', v_invite.role,
    'token', v_invite.token,
    'invitedBy', v_invite.invited_by,
    'invitedAt', v_invite.created_at,
    'expiresAt', v_invite.expires_at,
    'acceptedAt', v_invite.accepted_at,
    'revokedAt', v_invite.revoked_at,
    'notificationSent', v_recipient_id is not null and v_recipient_id <> auth.uid()
  );
end;
$$;

create or replace function public.get_my_team_invites()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ti.id,
        'email', ti.email,
        'role', ti.role,
        'token', ti.token,
        'invitedBy', ti.invited_by,
        'invitedAt', ti.created_at,
        'expiresAt', ti.expires_at,
        'acceptedAt', ti.accepted_at,
        'revokedAt', ti.revoked_at,
        'libraryId', ti.library_id,
        'libraryName', coalesce(l.name, ''),
        'inviterName', coalesce(inviter.display_name, inviter.email, ''),
        'inviterEmail', coalesce(inviter.email, ''),
        'inviterPicture', inviter.avatar_url
      )
      order by ti.created_at desc
    ),
    '[]'::jsonb
  )
  from public.team_invites ti
  join public.libraries l on l.id = ti.library_id
  left join public.profiles inviter on inviter.id = ti.invited_by
  where auth.uid() is not null
    and lower(ti.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
    and ti.accepted_at is null
    and ti.revoked_at is null
    and (ti.expires_at is null or ti.expires_at > now());
$$;

create or replace function public.accept_team_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid();

  select * into v_invite
  from public.team_invites
  where token = p_token
    and accepted_at is null
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'This invite is for %, but you are signed in as %', v_invite.email, v_email;
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (v_invite.library_id, auth.uid(), v_invite.role)
  on conflict (library_id, user_id) do update
  set role = excluded.role;

  update public.team_invites
  set accepted_at = now()
  where id = v_invite.id;

  delete from public.notifications
  where recipient_user_id = auth.uid()
    and type = 'team_invite'
    and resource_type = 'team'
    and resource_id = v_invite.id::text;

  return v_invite.library_id;
end;
$$;

create or replace function public.accept_my_team_invite(p_invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ti.token into v_token
  from public.team_invites ti
  join auth.users u on u.id = auth.uid()
  where ti.id = p_invite_id
    and lower(ti.email) = lower(coalesce(u.email, ''))
    and ti.accepted_at is null
    and ti.revoked_at is null
    and (ti.expires_at is null or ti.expires_at > now());

  if v_token is null then
    raise exception 'Invalid or expired invite';
  end if;

  return public.accept_team_invite(v_token);
end;
$$;

create or replace function public.decline_my_team_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update public.team_invites ti
  set revoked_at = now()
  from auth.users u
  where ti.id = p_invite_id
    and u.id = auth.uid()
    and lower(ti.email) = lower(coalesce(u.email, ''))
    and ti.accepted_at is null
    and ti.revoked_at is null;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  delete from public.notifications
  where recipient_user_id = auth.uid()
    and type = 'team_invite'
    and resource_type = 'team'
    and resource_id = p_invite_id::text;
end;
$$;

revoke all on function public.create_team_invite(text, text, text) from public;
revoke all on function public.get_my_team_invites() from public;
revoke all on function public.accept_team_invite(text) from public;
revoke all on function public.accept_my_team_invite(uuid) from public;
revoke all on function public.decline_my_team_invite(uuid) from public;

grant execute on function public.create_team_invite(text, text, text) to authenticated;
grant execute on function public.get_my_team_invites() to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;
grant execute on function public.accept_my_team_invite(uuid) to authenticated;
grant execute on function public.decline_my_team_invite(uuid) to authenticated;
