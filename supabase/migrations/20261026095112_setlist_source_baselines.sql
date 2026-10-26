alter table public.setlist_songs add column source_baseline jsonb;
alter table public.setlist_source_sync_history add column direction text not null default 'to-library'
  check (direction in ('to-library','to-setlist'));
alter table public.setlist_source_sync_history add column before_setlist_json jsonb;

create or replace function public.setlist_source_status(p_entry jsonb,p_source jsonb,p_baseline jsonb)
returns text language sql immutable security invoker set search_path=public
as $$ select case
  when public.setlist_source_score(p_entry)=public.setlist_source_score(p_source) then 'aligned'
  when jsonb_typeof(p_baseline->'sourceContent') is distinct from 'object'
    or jsonb_typeof(p_baseline->'entryContent') is distinct from 'object' then 'unknown'
  when public.setlist_source_score(p_entry)=public.setlist_source_score(p_baseline->'entryContent')
    and public.setlist_source_score(p_source)<>public.setlist_source_score(p_baseline->'sourceContent') then 'source-newer'
  when public.setlist_source_score(p_entry)<>public.setlist_source_score(p_baseline->'entryContent')
    and public.setlist_source_score(p_source)=public.setlist_source_score(p_baseline->'sourceContent') then 'setlist-changed'
  else 'conflict' end $$;

-- The browser cannot set its own provenance. Capture it from real rows before
-- the arrangement trigger removes a duplicate's sourceSetlistSongId marker.
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
    where sl.id=new.setlist_id and l.kind='team';
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
create trigger aa_capture_setlist_source_baseline before insert on public.setlist_songs
  for each row execute function public.capture_setlist_source_baseline();
-- Run after the existing setlist-manager content protection on UPDATE.
create trigger zz_capture_setlist_source_baseline before update on public.setlist_songs
  for each row execute function public.capture_setlist_source_baseline();

-- Existing scores are not rewritten by this schema migration. Equal-score
-- baselines may be established by a separately backed-up, scoped metadata pass.
-- Divergent legacy snapshots remain unknown; never guess from saved times.

create or replace function public.preview_setlist_source_sync(p_library_id text,p_entry_id text)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare entry public.setlist_songs; source public.songs; list_name text;
begin
  if auth.uid() is null or not exists(select 1 from public.library_members m join public.libraries l on l.id=m.library_id
    where l.id=p_library_id and l.kind='team' and m.user_id=auth.uid() and m.role in ('owner','admin')) then
    raise exception '只有團隊擁有者或總管理員可以同步譜面。'; end if;
  select ss.* into entry from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
    where ss.id=p_entry_id and sl.library_id=p_library_id and not coalesce(sl.archived,false);
  if entry.id is null then raise exception '歌單不存在、已封存或不在目前團隊。'; end if;
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
  if auth.uid() is null or not exists(select 1 from public.library_members m join public.libraries l on l.id=m.library_id
    where l.id=p_library_id and l.kind='team' and m.user_id=auth.uid() and m.role in ('owner','admin')) then
    raise exception '只有團隊擁有者或總管理員可以同步譜面。'; end if;
  if p_direction not in ('to-library','to-setlist') or p_direction is null then raise exception 'Invalid sync direction'; end if;
  select * into parent from public.setlists where id=(select setlist_id from public.setlist_songs where id=p_entry_id)
    and library_id=p_library_id and not coalesce(archived,false) for update;
  if parent.id is null then raise exception '歌單不存在、已封存或不在目前團隊。'; end if;
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

-- Older clients also obey provenance checks and cannot upload a stale copy.
create or replace function public.sync_setlist_song_to_library(
  p_library_id text,p_entry_id text,p_expected_source_updated_at timestamptz,p_expected_override_json jsonb,p_expected_source_content jsonb
)
returns jsonb language plpgsql security invoker set search_path=public
as $$ declare baseline jsonb; result jsonb; begin
  select source_baseline into baseline from public.setlist_songs where id=p_entry_id;
  result:=public.reconcile_setlist_source(p_library_id,p_entry_id,p_expected_source_updated_at,p_expected_override_json,p_expected_source_content,baseline,'to-library',false);
  return result->'source';
end $$;

revoke all on function public.capture_setlist_source_baseline() from public,anon,authenticated;
revoke all on function public.setlist_source_status(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.setlist_source_status(jsonb,jsonb,jsonb) to authenticated,service_role;
revoke all on function public.reconcile_setlist_source(text,text,timestamptz,jsonb,jsonb,jsonb,text,boolean) from public,anon;
grant execute on function public.reconcile_setlist_source(text,text,timestamptz,jsonb,jsonb,jsonb,text,boolean) to authenticated;
