-- Pure, lossless JSON transport patch. No musical comparison or write semantics change.
create or replace function public.workspace_json_patch(p_base jsonb, p_target jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare v_key text; v_value jsonb; v_set jsonb := '{}'; v_children jsonb := '{}'; v_delete jsonb := '[]'; v_patch jsonb := '{}';
begin
  if p_base is not distinct from p_target then return '{}'::jsonb; end if;
  if jsonb_typeof(p_base) is distinct from 'object' or jsonb_typeof(p_target) is distinct from 'object' then
    return jsonb_build_object('v',p_target);
  end if;
  for v_key,v_value in select key,value from jsonb_each(p_target) loop
    if not (p_base ? v_key) then v_set := v_set || jsonb_build_object(v_key,v_value);
    elsif p_base->v_key is distinct from v_value then
      if jsonb_typeof(p_base->v_key)='object' and jsonb_typeof(v_value)='object' then
        v_children := v_children || jsonb_build_object(v_key,public.workspace_json_patch(p_base->v_key,v_value));
      else v_set := v_set || jsonb_build_object(v_key,v_value); end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into v_delete from jsonb_object_keys(p_base) key where not (p_target ? key);
  if v_set <> '{}'::jsonb then v_patch := v_patch || jsonb_build_object('s',v_set); end if;
  if v_children <> '{}'::jsonb then v_patch := v_patch || jsonb_build_object('p',v_children); end if;
  if v_delete <> '[]'::jsonb then v_patch := v_patch || jsonb_build_object('d',v_delete); end if;
  return v_patch;
end $$;
revoke all on function public.workspace_json_patch(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_json_patch(jsonb,jsonb) to authenticated;

-- One statement snapshot, caller RLS, full membership manifest plus changed rows.
-- Versions hash actual rows, so imports that preserve updated_at still propagate.
create or replace function public.get_library_workspace_delta(p_library_id text, p_known_versions jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_scope text; v_rows jsonb; v_sources jsonb;
  v_versions jsonb; v_changes jsonb := '{}'; v_group text; v_group_rows jsonb;
  v_group_versions jsonb; v_changed jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_scope := v_user::text || ':' || p_library_id;
  v_rows := jsonb_build_object(
    'songs',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from public.songs s where s.library_id=p_library_id),
    'setlists',(select coalesce(jsonb_agg(to_jsonb(sl) order by sl.id),'[]'::jsonb) from public.setlists sl where sl.library_id=p_library_id),
    'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from public.projects p where p.library_id=p_library_id),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.setlist_songs e join public.setlists sl on sl.id=e.setlist_id where sl.library_id=p_library_id),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by a.setlist_id),'[]'::jsonb) from public.setlist_editor_assignments a join public.setlists sl on sl.id=a.setlist_id where sl.library_id=p_library_id and a.user_id=v_user),
    'capos',(select coalesce(jsonb_agg(to_jsonb(c) order by c.setlist_song_id),'[]'::jsonb) from public.user_setlist_capo_overrides c join public.setlist_songs e on e.id=c.setlist_song_id join public.setlists sl on sl.id=e.setlist_id where sl.library_id=p_library_id and c.user_id=v_user)
  );
  select coalesce(jsonb_object_agg(s->>'id',s->'content_json'),'{}'::jsonb) into v_sources from jsonb_array_elements(v_rows->'songs') s;
  v_versions := jsonb_build_object('scope',v_scope);
  for v_group,v_group_rows in select key,value from jsonb_each(v_rows) loop
    -- Aggregate once: repeatedly concatenating the growing song JSON array
    -- copies megabytes for every row and delays the first synchronization.
    with hashed as materialized (
      select value as row,
        case v_group when 'capos' then value->>'setlist_song_id' when 'assignments' then value->>'setlist_id' else value->>'id' end as id,
        encode(sha256(convert_to(value::text,'UTF8')),'hex') as hash
      from jsonb_array_elements(v_group_rows)
    )
    select coalesce(jsonb_object_agg(id,hash),'{}'::jsonb),
      coalesce(jsonb_agg(row order by id) filter (where p_known_versions->>'scope' is distinct from v_scope
        or p_known_versions#>>array[v_group,id] is distinct from hash),'[]'::jsonb)
      into v_group_versions,v_changed from hashed;
    if v_group='entries' then
      select coalesce(jsonb_agg(case when jsonb_typeof(source)='object'
        and jsonb_typeof(baseline->'sourceContent')='object' and jsonb_typeof(baseline->'entryContent')='object'
        then (row-'source_baseline') || jsonb_build_object('baseline_delta',jsonb_build_object(
          'sourceId',row->>'song_id', 'metadata',baseline-'sourceContent'-'entryContent',
          'sourcePatch',public.workspace_json_patch(source,baseline->'sourceContent'),
          'entryPatch',public.workspace_json_patch(source,baseline->'entryContent')))
        else row end order by row->>'id'),'[]'::jsonb) into v_changed
      from (select value as row,v_sources->(value->>'song_id') as source,value->'source_baseline' as baseline
        from jsonb_array_elements(v_changed)) changed_entries;
    end if;
    v_versions := v_versions || jsonb_build_object(v_group,v_group_versions);
    v_changes := v_changes || jsonb_build_object(v_group,v_changed);
  end loop;
  if v_versions = p_known_versions then return jsonb_build_object('scope',v_scope,'unchanged',true); end if;
  return jsonb_build_object('scope',v_scope,'unchanged',false,'versions',v_versions,'changes',v_changes);
end $$;
revoke all on function public.get_library_workspace_delta(text,jsonb) from public,anon,authenticated;
grant execute on function public.get_library_workspace_delta(text,jsonb) to authenticated;

-- Removal-only saves no longer write an unchanged entry merely to trigger a
-- role check. Check the captured role explicitly while deleting only named IDs.
create or replace function public.delete_setlist_entries_checked(p_setlist_id text,p_entry_ids text[],p_expected_role text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_role text; v_kind text;
begin
  if auth.uid() is null or not public.can_write_setlist(p_setlist_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select l.kind,m.role into v_kind,v_role from public.setlists sl join public.libraries l on l.id=sl.library_id
    join public.library_members m on m.library_id=l.id and m.user_id=auth.uid() where sl.id=p_setlist_id;
  if v_kind is distinct from 'team' or v_role is distinct from p_expected_role then
    raise exception 'Your team role changed. Reload permissions before saving.' using errcode='42501';
  end if;
  delete from public.setlist_songs where setlist_id=p_setlist_id and id=any(p_entry_ids);
end $$;
revoke all on function public.delete_setlist_entries_checked(text,text[],text) from public,anon,authenticated;
grant execute on function public.delete_setlist_entries_checked(text,text[],text) to authenticated;
