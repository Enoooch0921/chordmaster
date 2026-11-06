-- Keep the five-second polling cadence without sending unchanged scores.
-- Existing RPCs remain available to old clients. This wrapper uses their
-- current per-user authorization, and RLS for personal Capo preferences.
create or replace function public.get_joined_workspace_snapshot(p_known_version text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_setlists jsonb;
  v_projects jsonb;
  v_capos jsonb;
  v_payload jsonb;
  v_version text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- STABLE uses one statement snapshot. Hash the actual returned content,
  -- including nested score edits that do not touch the parent timestamp.
  v_setlists := public.get_joined_setlists();
  v_projects := public.get_joined_projects();
  with visible_entries as (
    select entry->>'id' as id
    from jsonb_array_elements(v_setlists) sl
    cross join lateral jsonb_array_elements(sl->'songs') entry
    union
    select entry->>'id'
    from jsonb_array_elements(v_projects) project
    cross join lateral jsonb_array_elements(project->'setlists') sl
    cross join lateral jsonb_array_elements(sl->'songs') entry
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'setlist_song_id', c.setlist_song_id, 'capo', c.capo
  ) order by c.setlist_song_id), '[]'::jsonb)
  into v_capos
  from public.user_setlist_capo_overrides c
  where c.user_id = v_user and c.setlist_song_id in (select id from visible_entries);

  v_payload := jsonb_build_object('setlists', v_setlists, 'projects', v_projects, 'personalCapos', v_capos);
  v_version := encode(sha256(convert_to(v_user::text || ':' || v_payload::text, 'UTF8')), 'hex');
  if v_version = p_known_version then
    return jsonb_build_object('version', v_version, 'unchanged', true);
  end if;
  return jsonb_build_object('version', v_version, 'unchanged', false, 'payload', v_payload);
end;
$$;

revoke all on function public.get_joined_workspace_snapshot(text) from public, anon, authenticated;
grant execute on function public.get_joined_workspace_snapshot(text) to authenticated;
