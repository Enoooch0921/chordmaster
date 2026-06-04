create or replace function public.join_shared_setlist(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setlist_id text;
begin
  select resource_id into v_setlist_id
  from public.share_links
  where token = p_token
    and resource_type = 'setlist'
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_setlist_id is null then
    raise exception 'Invalid or expired share link';
  end if;

  insert into public.user_setlist_memberships (user_id, setlist_id, token_used)
  values (auth.uid(), v_setlist_id, p_token)
  on conflict (user_id, setlist_id) do nothing;

  return v_setlist_id;
end;
$$;

grant execute on function public.join_shared_setlist(text) to authenticated;
