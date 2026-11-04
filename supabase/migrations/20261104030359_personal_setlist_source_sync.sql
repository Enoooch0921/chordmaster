-- Extend existing atomic score reconciliation to the owner of a personal library.
-- Caller RLS, exact content/revision checks and immutable backups remain in force.
create or replace function public.can_reconcile_setlist_source(p_library_id text)
returns boolean language sql stable security invoker set search_path=public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.libraries l where l.id=p_library_id and (
      (l.kind='personal' and l.owner_user_id=auth.uid())
      or (l.kind='team' and exists (
        select 1 from public.library_members m where m.library_id=l.id
          and m.user_id=auth.uid() and m.role in ('owner','admin')
      ))
    )
  );
$$;
revoke all on function public.can_reconcile_setlist_source(text) from public,anon;
grant execute on function public.can_reconcile_setlist_source(text) to authenticated,service_role;

drop policy "administrators read source sync backups" on public.setlist_source_sync_history;
drop policy "administrators back up current source before sync" on public.setlist_source_sync_history;
create policy "authorized owners read source sync backups" on public.setlist_source_sync_history
  for select to authenticated using (public.can_reconcile_setlist_source(library_id));
create policy "authorized owners back up current source before sync" on public.setlist_source_sync_history
  for insert to authenticated with check (
    actor_id=auth.uid() and public.can_reconcile_setlist_source(library_id)
    and exists(select 1 from public.songs s where s.id=song_id
      and s.library_id=setlist_source_sync_history.library_id and s.archived_at is null
      and to_jsonb(s)=before_json)
    and exists(select 1 from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
      where ss.id=setlist_song_id and ss.song_id=setlist_source_sync_history.song_id
        and sl.library_id=setlist_source_sync_history.library_id and not coalesce(sl.archived,false)
        and to_jsonb(ss)=before_setlist_json)
  );

create or replace function public.capture_setlist_source_baseline()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare source public.songs; old_entry public.setlist_songs; library text; copied jsonb; snapshot jsonb; origin jsonb;
begin
  if tg_op='INSERT' then
    select * into old_entry from public.setlist_songs where id=new.id;
    if found then new.source_baseline:=old_entry.source_baseline; return new; end if;
    new.source_baseline:=null;
  else
    new.source_baseline:=case when old.song_id=new.song_id and old.setlist_id=new.setlist_id then old.source_baseline else null end;
  end if;
  origin:=new.override_json->'sourceEditBase';
  new.override_json:=new.override_json-'sourceEditBase';
  select sl.library_id into library from public.setlists sl join public.libraries l on l.id=sl.library_id
    where sl.id=new.setlist_id and l.kind in ('team','personal');
  select * into source from public.songs where id=new.song_id and library_id=library and archived_at is null;
  if source.id is null then return new; end if;
  if tg_op='INSERT' and new.override_json ? 'sourceSetlistSongId' then
    select ss.source_baseline into copied from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
      where ss.id=new.override_json->>'sourceSetlistSongId' and ss.song_id=new.song_id and sl.library_id=library;
    new.source_baseline:=copied;
    return new;
  end if;
  -- A live reference has no private score yet. Its first edit must prove the
  -- displayed origin still matches the source; otherwise provenance is unknown.
  if tg_op='UPDATE' and jsonb_typeof(old.override_json->'songData') is distinct from 'object'
    and jsonb_typeof(new.override_json->'songData')='object' then new.source_baseline:=null; end if;
  if jsonb_typeof(origin)='object' and public.setlist_source_score(origin)=public.setlist_source_score(source.content_json)
    and (tg_op='INSERT' or jsonb_typeof(old.override_json->'songData') is distinct from 'object') then
    new.source_baseline:=jsonb_build_object('songId',new.song_id,'sourceContent',source.content_json,
      'entryContent',origin,'sourceRevision',source.updated_at,'capturedAt',clock_timestamp());
  end if;
  snapshot:=coalesce(new.override_json->'songData',source.content_json);
  if public.setlist_source_score(snapshot)=public.setlist_source_score(source.content_json) then
    if new.source_baseline is null
      or public.setlist_source_score(new.source_baseline->'sourceContent')<>public.setlist_source_score(source.content_json)
      or public.setlist_source_score(new.source_baseline->'entryContent')<>public.setlist_source_score(snapshot) then
      new.source_baseline:=jsonb_build_object('songId',new.song_id,'sourceContent',source.content_json,
        'entryContent',snapshot,'sourceRevision',source.updated_at,'capturedAt',clock_timestamp());
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.preview_setlist_source_sync(p_library_id text,p_entry_id text)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare entry public.setlist_songs; source public.songs; list_name text;
begin
  if not public.can_reconcile_setlist_source(p_library_id) then
    raise exception '只有個人曲庫擁有者或團隊擁有者／總管理員可以同步譜面。'; end if;
  select ss.* into entry from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
    where ss.id=p_entry_id and sl.library_id=p_library_id and not coalesce(sl.archived,false);
  if entry.id is null then raise exception '歌單不存在、已封存或不在目前曲庫。'; end if;
  select name into list_name from public.setlists where id=entry.setlist_id;
  if jsonb_typeof(entry.override_json->'songData') is distinct from 'object' then raise exception '請先儲存歌單譜面。'; end if;
  select * into source from public.songs where id=entry.song_id and library_id=p_library_id and archived_at is null;
  if source.id is null then raise exception '來源歌曲已封存、移除或不在同一曲庫。'; end if;
  return jsonb_build_object('source',to_jsonb(source),'entry',to_jsonb(entry),'setlistName',list_name,
    'syncStatus',public.setlist_source_status(entry.override_json->'songData',source.content_json,entry.source_baseline));
end;
$$;

create or replace function public.reconcile_setlist_source(
  p_library_id text,p_entry_id text,p_expected_source_updated_at timestamptz,p_expected_override_json jsonb,
  p_expected_source_content jsonb,p_expected_baseline jsonb,p_direction text,p_resolve_conflict boolean default false
)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare entry public.setlist_songs; source public.songs; parent public.setlists; score jsonb; merged jsonb;
  state text; old_order jsonb; old_default jsonb; new_default jsonb; new_order jsonb; before_entry jsonb;
begin
  if not public.can_reconcile_setlist_source(p_library_id) then
    raise exception '只有個人曲庫擁有者或團隊擁有者／總管理員可以同步譜面。'; end if;
  if p_direction not in ('to-library','to-setlist') or p_direction is null then raise exception 'Invalid sync direction'; end if;
  select * into parent from public.setlists where id=(select setlist_id from public.setlist_songs where id=p_entry_id)
    and library_id=p_library_id and not coalesce(archived,false) for update;
  if parent.id is null then raise exception '歌單不存在、已封存或不在目前曲庫。'; end if;
  select * into entry from public.setlist_songs where id=p_entry_id and setlist_id=parent.id for update;
  if entry.id is null or entry.override_json is distinct from p_expected_override_json or entry.source_baseline is distinct from nullif(p_expected_baseline,'null'::jsonb) then
    raise exception '歌單或來源基準已被更新，請重新比對差異。'; end if;
  select * into source from public.songs where id=entry.song_id and library_id=p_library_id and archived_at is null for update;
  if source.id is null then raise exception '來源歌曲已封存、移除或不在同一曲庫。'; end if;
  if source.updated_at is distinct from p_expected_source_updated_at or source.content_json is distinct from p_expected_source_content then
    raise exception '歌曲庫已被其他人修改，請重新比對差異。'; end if;
  if jsonb_typeof(entry.override_json->'songData') is distinct from 'object' then raise exception '請先儲存歌單譜面。'; end if;
  state:=public.setlist_source_status(entry.override_json->'songData',source.content_json,entry.source_baseline);
  if state='source-newer' and p_direction='to-library' then raise exception '這份歌單是舊副本；請使用「更新歌單副本」，不能覆蓋曲庫新版。'; end if;
  if state='setlist-changed' and p_direction='to-setlist' then raise exception '歌單有尚未同步的修改，請先比對並保留修改。'; end if;
  if state in ('conflict','unknown') and not coalesce(p_resolve_conflict,false) then
    raise exception '雙方都有差異或來源版本未知，必須比對後明確選擇保留哪一份。'; end if;
  before_entry:=to_jsonb(entry);
  if state<>'aligned' then
    score:=public.setlist_source_score(case when p_direction='to-library' then entry.override_json->'songData' else source.content_json end);
    if jsonb_typeof(score->'sections') is distinct from 'array' or coalesce(score->>'title','')='' then raise exception '譜面缺少歌名或段落。'; end if;
    merged:=case when p_direction='to-library' then source.content_json else entry.override_json->'songData' end;
    merged:=(merged-array(select jsonb_object_keys(public.setlist_source_score(merged)))) || score;
    if jsonb_typeof(score->'lyricsDoc')='object' then
      merged:=jsonb_set(merged,'{lyricsDoc}',(coalesce(case when p_direction='to-library' then source.content_json else entry.override_json->'songData' end->'lyricsDoc','{}'::jsonb)
        -array['chinese','english','blocks','translationLanguage']) || (score->'lyricsDoc'));
    end if;
    merged:=merged || jsonb_build_object('updatedAt',floor(extract(epoch from clock_timestamp())*1000),'updatedBy',auth.uid());
    insert into public.setlist_source_sync_history(library_id,song_id,setlist_song_id,actor_id,before_json,after_content_json,direction,before_setlist_json)
      values(p_library_id,source.id,entry.id,auth.uid(),to_jsonb(source),merged,p_direction,before_entry);
    if p_direction='to-library' then
      update public.songs set content_json=merged,title=score->>'title',updated_at=clock_timestamp(),updated_by=auth.uid()
        where id=source.id and library_id=p_library_id and archived_at is null and updated_at=p_expected_source_updated_at;
      select * into source from public.songs where id=entry.song_id and library_id=p_library_id and archived_at is null;
      if source.content_json is distinct from merged then raise exception '原曲寫入後驗證失敗，本次同步已取消。'; end if;
    else
      select coalesce(jsonb_agg(s->'id'),'[]') into old_default from jsonb_array_elements(entry.override_json#>'{songData,sections}') s;
      select coalesce(jsonb_agg(s->'id'),'[]') into new_default from jsonb_array_elements(score->'sections') s;
      old_order:=coalesce(entry.override_json->'sectionOrder',old_default);
      if old_order=old_default or jsonb_typeof(old_order)<>'array' then new_order:=new_default;
      else
        select coalesce(jsonb_agg(v),'[]') into new_order from jsonb_array_elements(old_order) v
          where exists(select 1 from jsonb_array_elements(new_default) n where n=v);
        if jsonb_array_length(new_order)=0 then new_order:=new_default; end if;
      end if;
      update public.setlist_songs set override_json=jsonb_set(jsonb_set(override_json,'{songData}',merged),'{sectionOrder}',new_order)
        where id=entry.id and setlist_id=parent.id and song_id=source.id;
      select * into entry from public.setlist_songs where id=p_entry_id;
      if entry.override_json->'songData' is distinct from merged then raise exception '歌單寫入後驗證失敗，本次更新已取消。'; end if;
    end if;
  end if;
  -- The protected trigger records the newly agreed baseline; other copies keep
  -- their own baseline and correctly become "source-newer" after an upload.
  update public.setlist_songs set source_baseline=null where id=entry.id and setlist_id=parent.id and song_id=source.id;
  update public.setlists set updated_at=clock_timestamp(),updated_by=auth.uid() where id=parent.id returning * into parent;
  select * into entry from public.setlist_songs where id=p_entry_id;
  return jsonb_build_object('source',to_jsonb(source),'entry',to_jsonb(entry),'setlistUpdatedAt',parent.updated_at);
end;
$$;

