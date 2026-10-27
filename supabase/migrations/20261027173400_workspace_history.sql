-- Reversible collection deletion. Backups never enter a browser payload.
-- Each new routine has explicit caller grants below. Preserve the NAS
-- installation's cross-schema defaults for its other Supabase services.
create schema if not exists chordmaster_private;
revoke all on schema chordmaster_private from public, anon, authenticated;
create table chordmaster_private.workspace_trash (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references public.libraries(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check(resource_type in ('project','setlist','entry')),
  resource_id text not null,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz
);
alter table chordmaster_private.workspace_trash enable row level security;
revoke all on chordmaster_private.workspace_trash from public, anon, authenticated;

-- A private, transaction-bound marker lets the existing project-scope trigger
-- distinguish a trusted restore of the original link from a new classification.
-- A client-controlled GUC is deliberately insufficient to bypass that trigger.
create table chordmaster_private.workspace_restore_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  trash_id uuid not null references chordmaster_private.workspace_trash(id) on delete cascade,
  primary key (backend_pid,transaction_id)
);
alter table chordmaster_private.workspace_restore_context enable row level security;
revoke all on chordmaster_private.workspace_restore_context from public,anon,authenticated;
create function public.is_workspace_history_restore(p_id text,p_library_id text,p_project_id text,p_created_by uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from chordmaster_private.workspace_restore_context c
    join chordmaster_private.workspace_trash t on t.id=c.trash_id
    where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current()
      and t.actor=auth.uid() and t.restored_at is null and t.resource_type='setlist'
      and t.resource_id=p_id and t.library_id=p_library_id
      and (t.snapshot->'row'->>'project_id') is not distinct from p_project_id
      and (t.snapshot->'row'->>'created_by')::uuid is not distinct from p_created_by
  );
$$;
revoke all on function public.is_workspace_history_restore(text,text,text,uuid) from public,anon;
grant execute on function public.is_workspace_history_restore(text,text,text,uuid) to authenticated;
drop trigger setlists_project_scope on public.setlists;
create trigger setlists_project_scope before insert or update of project_id on public.setlists
for each row when (not public.is_workspace_history_restore(new.id,new.library_id,new.project_id,new.created_by))
execute function public.enforce_setlist_project_scope();

create function public.trash_workspace_resource(p_library_id text, p_type text, p_id text, p_expected jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare row_data jsonb; backup jsonb; parent_id text; result uuid; links jsonb; field text;
begin
  if auth.uid() is null or jsonb_typeof(p_expected) is distinct from 'object' then raise exception 'Access denied'; end if;
  if p_type='project' then
    select to_jsonb(p) into row_data from public.projects p where id=p_id and library_id=p_library_id for update;
    if row_data is null or not public.can_manage_project(p_id) then raise exception 'Access denied'; end if;
    if row_data->'name' is distinct from p_expected->'name' or row_data->'archived' is distinct from coalesce(p_expected->'archived','false'::jsonb) then
      raise exception 'History conflict: project changed'; end if;
    if p_expected ? 'setlistIds' and
      (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.setlists where project_id=p_id) is distinct from
      (select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from jsonb_array_elements_text(p_expected->'setlistIds')) then
      raise exception 'History conflict: project grouping changed'; end if;
    perform 1 from public.setlists where project_id=p_id order by id for update;
    backup:=jsonb_build_object('row',row_data,'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.user_project_memberships m where project_id=p_id),'[]'::jsonb),
      'setlists',coalesce((select jsonb_agg(jsonb_build_object('id',id)) from public.setlists where project_id=p_id),'[]'::jsonb));
    delete from public.projects where id=p_id and library_id=p_library_id;
    -- Preserve child identities; restore changes only their project link.
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'updated_at',s.updated_at)),'[]'::jsonb) into links
      from public.setlists s where s.id in (select value->>'id' from jsonb_array_elements(backup->'setlists'));
    backup:=backup||jsonb_build_object('setlists',links);
  elsif p_type='setlist' then
    select to_jsonb(s) into row_data from public.setlists s where id=p_id and library_id=p_library_id for update;
    if row_data is null or not public.can_write_setlist(p_id) then raise exception 'Access denied'; end if;
    if row_data->'name' is distinct from p_expected->'name' then raise exception 'History conflict: setlist changed'; end if;
    backup:=jsonb_build_object('row',row_data,
      'entries',coalesce((select jsonb_agg(to_jsonb(e) order by order_index,id) from public.setlist_songs e where setlist_id=p_id),'[]'::jsonb),
      'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.user_setlist_memberships m where setlist_id=p_id),'[]'::jsonb),
      'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.setlist_editor_assignments a where setlist_id=p_id),'[]'::jsonb),
      'capos',coalesce((select jsonb_agg(to_jsonb(c)) from public.user_setlist_capo_overrides c join public.setlist_songs e on e.id=c.setlist_song_id where e.setlist_id=p_id),'[]'::jsonb));
    delete from public.setlists where id=p_id and library_id=p_library_id;
  elsif p_type='entry' then
    select s.id into parent_id from public.setlists s join public.setlist_songs e on e.setlist_id=s.id where e.id=p_id and s.library_id=p_library_id;
    perform 1 from public.setlists where id=parent_id for update;
    if parent_id is null or not public.can_write_setlist(parent_id) then raise exception 'Access denied'; end if;
    select to_jsonb(e) into row_data from public.setlist_songs e where id=p_id and setlist_id=parent_id for update;
    if row_data->>'song_id' is distinct from p_expected->>'songId' then raise exception 'History conflict: entry changed'; end if;
    foreach field in array array['overrideKey','sectionOrder','songData'] loop
      if p_expected ? field and coalesce(row_data->'override_json'->field,'null'::jsonb) is distinct from p_expected->field then
        raise exception 'History conflict: entry content changed';
      end if;
    end loop;
    backup:=jsonb_build_object('row',row_data,
      'order', (select jsonb_agg(id order by order_index,id) from public.setlist_songs where setlist_id=parent_id),
      'capos',coalesce((select jsonb_agg(to_jsonb(c)) from public.user_setlist_capo_overrides c where setlist_song_id=p_id),'[]'::jsonb));
    delete from public.setlist_songs where id=p_id and setlist_id=parent_id;
    update public.setlist_songs e set order_index=ordered.idx-1 from
      (select id,row_number() over(order by order_index,id)::integer idx from public.setlist_songs where setlist_id=parent_id) ordered where e.id=ordered.id;
  else raise exception 'Unsupported history resource'; end if;
  insert into chordmaster_private.workspace_trash(library_id,actor,resource_type,resource_id,snapshot)
    values(p_library_id,auth.uid(),p_type,p_id,backup) returning id into result;
  return result;
end; $$;

create function public.restore_workspace_resource(p_trash_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare trash chordmaster_private.workspace_trash; item jsonb; parent_id text; actual jsonb; expected jsonb;
begin
  select * into trash from chordmaster_private.workspace_trash where id=p_trash_id and actor=auth.uid() for update;
  if trash.id is null or trash.restored_at is not null or not public.can_read_library(trash.library_id) then raise exception 'Access denied or already restored'; end if;
  if trash.resource_type='project' then
    -- INSERT fails on identity reuse; never overwrite a concurrently recreated row.
    insert into public.projects select (jsonb_populate_record(null::public.projects,trash.snapshot->'row')).*;
    if not public.can_manage_project(trash.resource_id) then raise exception 'Access denied'; end if;
    for item in select value from jsonb_array_elements(trash.snapshot->'setlists') loop
      perform 1 from public.setlists where id=item->>'id' and library_id=trash.library_id and project_id is null for update;
      if not found then raise exception 'History conflict: a project setlist changed'; end if;
      update public.setlists set project_id=trash.resource_id where id=item->>'id' and library_id=trash.library_id;
    end loop;
    insert into public.user_project_memberships select * from jsonb_populate_recordset(null::public.user_project_memberships,trash.snapshot->'members');
  elsif trash.resource_type='setlist' then
    insert into chordmaster_private.workspace_restore_context(backend_pid,transaction_id,trash_id)
      values(pg_backend_pid(),txid_current(),trash.id);
    insert into public.setlists select (jsonb_populate_record(null::public.setlists,trash.snapshot->'row')).*;
    delete from chordmaster_private.workspace_restore_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
    -- Deletion cascades delegated assignments. Restore them inside this same
    -- transaction before checking current authorization. A demoted/removed
    -- member still fails can_write_setlist and rolls the entire restore back.
    insert into public.setlist_editor_assignments select * from jsonb_populate_recordset(null::public.setlist_editor_assignments,trash.snapshot->'assignments');
    if not public.can_write_setlist(trash.resource_id) then raise exception 'Access denied'; end if;
    perform set_config('chordmaster.restore_trash_id',p_trash_id::text,true);
    insert into public.setlist_songs select * from jsonb_populate_recordset(null::public.setlist_songs,trash.snapshot->'entries');
    insert into public.user_setlist_memberships select * from jsonb_populate_recordset(null::public.user_setlist_memberships,trash.snapshot->'members');
    insert into public.user_setlist_capo_overrides select * from jsonb_populate_recordset(null::public.user_setlist_capo_overrides,trash.snapshot->'capos');
  elsif trash.resource_type='entry' then
    parent_id:=trash.snapshot->'row'->>'setlist_id';
    perform 1 from public.setlists where id=parent_id and library_id=trash.library_id for update;
    if not found or not public.can_write_setlist(parent_id) then raise exception 'Access denied'; end if;
    select coalesce(jsonb_agg(id order by order_index,id),'[]'::jsonb) into actual from public.setlist_songs where setlist_id=parent_id;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into expected from jsonb_array_elements(trash.snapshot->'order') where value<>to_jsonb(trash.resource_id);
    if actual<>expected then raise exception 'History conflict: setlist order changed'; end if;
    perform set_config('chordmaster.restore_trash_id',p_trash_id::text,true);
    insert into public.setlist_songs select (jsonb_populate_record(null::public.setlist_songs,trash.snapshot->'row')).*;
    update public.setlist_songs e set order_index=ordered.idx::integer-1 from jsonb_array_elements_text(trash.snapshot->'order') with ordinality ordered(id,idx) where e.id=ordered.id and e.setlist_id=parent_id;
    insert into public.user_setlist_capo_overrides select * from jsonb_populate_recordset(null::public.user_setlist_capo_overrides,trash.snapshot->'capos');
  end if;
  update chordmaster_private.workspace_trash set restored_at=now() where id=trash.id;
end; $$;

-- Preserve server-owned source provenance only during the trusted restore RPC.
create function public.restore_history_entry_baseline()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare backup jsonb; token uuid;
begin
  if current_user<>pg_get_userbyid((select proowner from pg_proc where oid='public.restore_workspace_resource(uuid)'::regprocedure)) then return new; end if;
  token:=nullif(current_setting('chordmaster.restore_trash_id',true),'')::uuid;
  if token is null then return new; end if;
  select case when t.resource_type='entry' then t.snapshot->'row' else e.value end into backup
    from chordmaster_private.workspace_trash t left join lateral jsonb_array_elements(coalesce(t.snapshot->'entries','[]'::jsonb)) e on true
    where t.id=token and t.actor=auth.uid() and t.restored_at is null
      and (case when t.resource_type='entry' then t.snapshot->'row' else e.value end)->>'id'=new.id;
  if backup->>'setlist_id'=new.setlist_id and backup->>'song_id'=new.song_id then new.source_baseline:=nullif(backup->'source_baseline','null'::jsonb); end if;
  return new;
end; $$;
create trigger zzzz_restore_history_entry_baseline before insert on public.setlist_songs for each row execute function public.restore_history_entry_baseline();

create function public.reorder_workspace_setlist(p_id text,p_expected jsonb,p_order jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare parent public.setlists; actual jsonb; role text;
begin
  if jsonb_typeof(p_expected) is distinct from 'array' or jsonb_typeof(p_order) is distinct from 'array' then raise exception 'Invalid order'; end if;
  select * into parent from public.setlists where id=p_id for update;
  if parent.id is null or auth.uid() is null or not (public.can_write_setlist(p_id) or public.has_project_manager_role(parent.project_id)) then raise exception 'Access denied'; end if;
  select coalesce(jsonb_agg(id order by order_index,id),'[]'::jsonb) into actual from public.setlist_songs where setlist_id=p_id;
  if actual is distinct from p_expected or jsonb_array_length(p_order)<>jsonb_array_length(actual)
    or (select count(distinct value) from jsonb_array_elements_text(p_order))<>jsonb_array_length(actual)
    or exists(select value from jsonb_array_elements_text(p_order) except select value from jsonb_array_elements_text(actual)) then raise exception 'History conflict: setlist order changed'; end if;
  if parent.project_id is not null and public.has_project_manager_role(parent.project_id) and not public.can_write_setlist(p_id) then
    perform public.reorder_project_setlist(p_id,p_order);
  else
    select lm.role into role from public.library_members lm where library_id=parent.library_id and user_id=auth.uid();
    update public.setlist_songs e set order_index=ordered.idx::integer-1,
      override_json=coalesce(e.override_json,'{}')||jsonb_build_object('expectedTeamRole',role)
      from jsonb_array_elements_text(p_order) with ordinality ordered(id,idx) where e.id=ordered.id and e.setlist_id=p_id;
    update public.setlists set updated_at=now(),updated_by=auth.uid() where id=p_id;
  end if;
end; $$;

-- Scalar fields and score JSON are guarded and written in a single transaction.
-- Invoker security keeps all existing RLS and content-integrity triggers in force.
create function public.patch_workspace_history(p_library_id text,p_patches jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare patch jsonb; row_data jsonb; field text; pair record; value jsonb; table_name text; db_field text; allowed text[]; current_value jsonb; affected bigint;
begin
  if auth.uid() is null or jsonb_typeof(p_patches)<>'array' then raise exception 'Access denied'; end if;
  for patch in select v from jsonb_array_elements(p_patches) v order by v->>'resource',v->>'id' loop
    if patch->>'resource'='order' then
      perform public.reorder_workspace_setlist(patch->>'id',patch->'before'->'ids',patch->'after'->'ids');
      continue;
    end if;
    table_name:=case patch->>'resource' when 'project' then 'projects' when 'setlist' then 'setlists' when 'song' then 'songs' when 'entry' then 'setlist_songs' end;
    if table_name is null then raise exception 'Unsupported history resource'; end if;
    if table_name='setlist_songs' then
      select to_jsonb(e) into row_data from public.setlist_songs e join public.setlists s on s.id=e.setlist_id where e.id=patch->>'id' and s.library_id=p_library_id for update of e;
    else
      execute format('select to_jsonb(r) from public.%I r where id=$1 and library_id=$2 for update',table_name) into row_data using patch->>'id',p_library_id;
    end if;
    if row_data is null then raise exception 'History conflict or access denied'; end if;
    for pair in select e.key,e.value from jsonb_each(patch->'after') e loop
      field:=pair.key; value:=pair.value;
      if table_name='songs' and field<>'archivedAt' then
        if field=any(array['id','createdBy','updatedBy','createdAt','updatedAt','sourceBaseline','teamSource']) then raise exception 'Protected history field'; end if;
        current_value:=coalesce(row_data->'content_json'->field,'null'::jsonb);
        if current_value is distinct from coalesce(patch->'before'->field,'null'::jsonb) then raise exception 'History conflict: song changed'; end if;
        update public.songs set content_json=case when value='null'::jsonb then content_json-field else jsonb_set(content_json,array[field],value,true) end,
          title=case when field='title' then value#>>'{}' else title end,updated_by=auth.uid() where id=patch->>'id' and library_id=p_library_id;
      elsif table_name='setlist_songs' then
        if not field=any(array['overrideKey','sectionOrder','songData']) then raise exception 'Protected history field'; end if;
        current_value:=coalesce(row_data->'override_json'->field,'null'::jsonb);
        if current_value is distinct from coalesce(patch->'before'->field,'null'::jsonb) then raise exception 'History conflict: setlist entry changed'; end if;
        update public.setlist_songs set override_json=case when value='null'::jsonb then override_json-field else jsonb_set(override_json,array[field],value,true) end where id=patch->>'id' and setlist_id=row_data->>'setlist_id';
      else
        db_field:=case field when 'projectId' then 'project_id' when 'displayMode' then 'display_mode' when 'archivedAt' then 'archived_at' else field end;
        allowed:=case table_name when 'projects' then array['name','archived'] when 'setlists' then array['name','archived','project_id','display_mode'] else array['archived_at'] end;
        if not db_field=any(allowed) then raise exception 'Protected history field'; end if;
        if db_field='archived_at' then
          if floor(extract(epoch from (row_data->>db_field)::timestamptz)*1000) is distinct from floor(extract(epoch from (patch->'before'->>field)::timestamptz)*1000) then raise exception 'History conflict: archive changed'; end if;
          update public.songs set archived_at=(value#>>'{}')::timestamptz,
            archived_by=case when value='null'::jsonb then null else auth.uid() end,updated_by=auth.uid()
            where id=patch->>'id' and library_id=p_library_id;
          get diagnostics affected = row_count;
          if affected<>1 then raise exception 'History write was not authorized'; end if;
          continue;
        end if;
        if row_data->db_field is distinct from coalesce(patch->'before'->field,'null'::jsonb) then raise exception 'History conflict: collection changed'; end if;
        execute format('update public.%I set %I=(jsonb_populate_record(null::public.%I,$1)).%I,updated_by=auth.uid() where id=$2 and library_id=$3',table_name,db_field,table_name,db_field)
          using jsonb_build_object(db_field,value),patch->>'id',p_library_id;
      end if;
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'History write was not authorized'; end if;
    end loop;
  end loop;
end; $$;

revoke all on function public.trash_workspace_resource(text,text,text,jsonb) from public,anon;
revoke all on function public.restore_workspace_resource(uuid) from public,anon;
revoke all on function public.reorder_workspace_setlist(text,jsonb,jsonb) from public,anon;
revoke all on function public.patch_workspace_history(text,jsonb) from public,anon;
revoke all on function public.restore_history_entry_baseline() from public,anon,authenticated;
grant execute on function public.trash_workspace_resource(text,text,text,jsonb),public.restore_workspace_resource(uuid),public.reorder_workspace_setlist(text,jsonb,jsonb),public.patch_workspace_history(text,jsonb) to authenticated;

create function public.trash_workspace_resources(p_library_id text,p_resources jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare resource jsonb; receipt uuid; result jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_resources) is distinct from 'array' or jsonb_array_length(p_resources)>50 then raise exception 'Invalid deletion batch'; end if;
  for resource in select value from jsonb_array_elements(p_resources) order by value->>'type',value->>'id' loop
    receipt:=public.trash_workspace_resource(p_library_id,resource->>'type',resource->>'id',resource->'expected');
    result:=result||jsonb_build_array(jsonb_build_object('type',resource->>'type','id',resource->>'id','trashId',receipt));
  end loop;
  return result;
end; $$;
create function public.restore_workspace_resources(p_trash_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare token uuid;
begin
  if cardinality(p_trash_ids)>50 then raise exception 'Invalid restore batch'; end if;
  for token in select r.value from unnest(p_trash_ids) with ordinality r(value,idx) order by idx desc loop
    perform public.restore_workspace_resource(token);
  end loop;
end; $$;
revoke all on function public.trash_workspace_resources(text,jsonb),public.restore_workspace_resources(uuid[]) from public,anon;
grant execute on function public.trash_workspace_resources(text,jsonb),public.restore_workspace_resources(uuid[]) to authenticated;
