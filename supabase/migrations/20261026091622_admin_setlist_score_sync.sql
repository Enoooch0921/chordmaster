-- Explicit, administrator-only promotion of a saved setlist score. Ordinary
-- setlist saves never update the source song. All functions retain caller RLS.
create table public.setlist_source_sync_history (
  id bigint generated always as identity primary key,
  library_id text not null references public.libraries(id),
  song_id text not null,
  setlist_song_id text not null,
  actor_id uuid not null,
  before_json jsonb not null,
  after_content_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.setlist_source_sync_history enable row level security;
create policy "administrators read source sync backups" on public.setlist_source_sync_history for select to authenticated
  using (exists(select 1 from public.library_members m where m.library_id=setlist_source_sync_history.library_id
    and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy "administrators back up current source before sync" on public.setlist_source_sync_history for insert to authenticated
  with check (actor_id=auth.uid() and exists(select 1 from public.library_members m
    join public.libraries l on l.id=m.library_id and l.kind='team'
    join public.songs s on s.library_id=l.id and s.id=setlist_source_sync_history.song_id and s.archived_at is null
    where l.id=setlist_source_sync_history.library_id and m.user_id=auth.uid() and m.role in ('owner','admin')
      and to_jsonb(s)=setlist_source_sync_history.before_json));
revoke all on public.setlist_source_sync_history from public,anon,authenticated;
grant select,insert on public.setlist_source_sync_history to authenticated;
grant usage on sequence public.setlist_source_sync_history_id_seq to authenticated;

create or replace function public.setlist_source_score(p_song jsonb)
returns jsonb language sql immutable security invoker set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, case when key = 'lyricsDoc'
    then value - 'displayLanguage' - 'fontSize' - 'lineHeight' else value end), '{}'::jsonb)
  from jsonb_each(coalesce(p_song, '{}'::jsonb))
  where key = any(array['title','lyricist','composer','translator','groove','shuffle',
    'originalKey','originalKeyMode','originalKeyUnspecified','tempo','timeSignature',
    'timeSignatureUnspecified','jianpuInputAbsolute','references','pickup','sections',
    'lyricsDoc','chordTimingVersion']);
$$;

create or replace function public.preview_setlist_source_sync(p_library_id text, p_entry_id text)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare entry public.setlist_songs; source public.songs; list_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.library_members m join public.libraries l on l.id=m.library_id
    where l.id=p_library_id and l.kind='team' and m.user_id=auth.uid() and m.role in ('owner','admin')
  ) then raise exception '只有團隊擁有者或總管理員可以同步回歌曲庫。'; end if;
  select ss.* into entry
    from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
    where ss.id=p_entry_id and sl.library_id=p_library_id and not coalesce(sl.archived,false);
  if entry.id is null then raise exception '歌單不存在、已封存或不在目前團隊。'; end if;
  select name into list_name from public.setlists where id=entry.setlist_id;
  if jsonb_typeof(entry.override_json->'songData') is distinct from 'object' then raise exception '請先儲存歌單譜面。'; end if;
  select * into source from public.songs
    where id=entry.song_id and library_id=p_library_id and archived_at is null;
  if source.id is null then raise exception '來源歌曲已封存、移除或不在同一曲庫。'; end if;
  return jsonb_build_object('source',to_jsonb(source),'entry',to_jsonb(entry),'setlistName',list_name);
end;
$$;

create or replace function public.sync_setlist_song_to_library(
  p_library_id text, p_entry_id text, p_expected_source_updated_at timestamptz, p_expected_override_json jsonb,
  p_expected_source_content jsonb
)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare entry public.setlist_songs; source public.songs; score jsonb; merged jsonb; list_id text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.library_members m join public.libraries l on l.id=m.library_id
    where l.id=p_library_id and l.kind='team' and m.user_id=auth.uid() and m.role in ('owner','admin')
  ) then raise exception '只有團隊擁有者或總管理員可以同步回歌曲庫。'; end if;
  select setlist_id into list_id from public.setlist_songs where id=p_entry_id;
  -- Lock the parent first, matching the ordinary setlist-save lock order.
  perform 1 from public.setlists where id=list_id and library_id=p_library_id and not coalesce(archived,false) for update;
  if not found then raise exception '歌單不存在、已封存或不在目前團隊。'; end if;
  select * into entry from public.setlist_songs where id=p_entry_id and setlist_id=list_id for update;
  if entry.id is null or entry.override_json is distinct from p_expected_override_json then
    raise exception '歌單已被其他人修改，請重新預覽差異再同步。';
  end if;
  if jsonb_typeof(entry.override_json->'songData') is distinct from 'object' then raise exception '請先儲存歌單譜面。'; end if;
  select * into source from public.songs
    where id=entry.song_id and library_id=p_library_id and archived_at is null for update;
  if source.id is null then raise exception '來源歌曲已封存、移除或不在同一曲庫。'; end if;
  if source.updated_at is distinct from p_expected_source_updated_at or source.content_json is distinct from p_expected_source_content then
    raise exception '歌曲庫已被其他人修改，請重新預覽差異再同步。';
  end if;
  score := public.setlist_source_score(entry.override_json->'songData');
  if score is not distinct from public.setlist_source_score(source.content_json) then return to_jsonb(source); end if;
  if jsonb_typeof(score->'sections') is distinct from 'array' or coalesce(score->>'title','')='' then
    raise exception '歌單譜面缺少歌名或段落。';
  end if;
  merged := (source.content_json - array(select jsonb_object_keys(public.setlist_source_score(source.content_json)))) || score;
  if jsonb_typeof(score->'lyricsDoc')='object' then
    merged := jsonb_set(merged,'{lyricsDoc}',(coalesce(source.content_json->'lyricsDoc','{}'::jsonb)
      - array['chinese','english','blocks','translationLanguage']) || (score->'lyricsDoc'));
  end if;
  merged := merged || jsonb_build_object('updatedAt',floor(extract(epoch from clock_timestamp())*1000),'updatedBy',auth.uid());
  insert into public.setlist_source_sync_history(library_id,song_id,setlist_song_id,actor_id,before_json,after_content_json)
    values(p_library_id,source.id,entry.id,auth.uid(),to_jsonb(source),merged);
  update public.songs set content_json=merged,title=score->>'title',updated_at=clock_timestamp(),updated_by=auth.uid()
    where id=source.id and library_id=p_library_id and archived_at is null and updated_at=p_expected_source_updated_at
    returning * into source;
  if not found then raise exception '歌曲庫已更新，請重新預覽後同步。'; end if;
  select * into source from public.songs where id=entry.song_id and library_id=p_library_id and archived_at is null;
  if source.content_json is distinct from merged then raise exception '寫入後完整譜面驗證失敗，本次同步已取消。'; end if;
  return to_jsonb(source);
end;
$$;

revoke all on function public.setlist_source_score(jsonb) from public,anon;
grant execute on function public.setlist_source_score(jsonb) to authenticated,service_role;
revoke all on function public.preview_setlist_source_sync(text,text) from public,anon;
revoke all on function public.sync_setlist_song_to_library(text,text,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.preview_setlist_source_sync(text,text) to authenticated;
grant execute on function public.sync_setlist_song_to_library(text,text,timestamptz,jsonb,jsonb) to authenticated;
