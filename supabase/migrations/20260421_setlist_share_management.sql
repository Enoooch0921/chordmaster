-- Share management helpers for setlist owners/editors.
-- Owners can inspect active sharing state and revoke all current sharing.

create or replace function public.get_setlist_share_status(p_setlist_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
  v_active_token text;
  v_active_created_at timestamptz;
  v_participants jsonb;
  v_participant_count integer;
begin
  select library_id into v_library_id
  from public.setlists
  where id = p_setlist_id;

  if v_library_id is null then
    raise exception 'Setlist not found';
  end if;

  if not public.can_write_library(v_library_id) then
    raise exception 'Access denied';
  end if;

  select token, created_at into v_active_token, v_active_created_at
  from public.share_links
  where resource_type = 'setlist'
    and resource_id = p_setlist_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', usm.user_id,
          'email', coalesce(p.email, ''),
          'name', coalesce(p.display_name, p.email, ''),
          'picture', p.avatar_url,
          'joinedAt', usm.joined_at
        )
        order by usm.joined_at asc
      ),
      '[]'::jsonb
    )
  into v_participant_count, v_participants
  from public.user_setlist_memberships usm
  left join public.profiles p on p.id = usm.user_id
  where usm.setlist_id = p_setlist_id;

  return jsonb_build_object(
    'activeToken', v_active_token,
    'activeCreatedAt', v_active_created_at,
    'participantCount', coalesce(v_participant_count, 0),
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

create or replace function public.revoke_setlist_sharing(p_setlist_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_library_id text;
begin
  select library_id into v_library_id
  from public.setlists
  where id = p_setlist_id;

  if v_library_id is null then
    raise exception 'Setlist not found';
  end if;

  if not public.can_write_library(v_library_id) then
    raise exception 'Access denied';
  end if;

  update public.share_links
  set revoked_at = now()
  where resource_type = 'setlist'
    and resource_id = p_setlist_id
    and revoked_at is null;

  delete from public.user_setlist_capo_overrides ucco
  using public.setlist_songs ss
  where ucco.setlist_song_id = ss.id
    and ss.setlist_id = p_setlist_id;

  delete from public.user_setlist_memberships
  where setlist_id = p_setlist_id;
end;
$$;
