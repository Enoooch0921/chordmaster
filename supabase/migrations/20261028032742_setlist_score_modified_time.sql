-- A setlist's updated_at includes renames, reordering and edits to other songs.
-- Track this entry's score separately; never invent dates for legacy snapshots.
alter table public.setlist_songs add column score_updated_at timestamptz;

create function public.track_setlist_score_modified_time()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare previous public.setlist_songs;
begin
  if tg_op='INSERT' then
    -- BEFORE INSERT also runs for ON CONFLICT UPDATE. The UPDATE invocation
    -- below compares the final, permission-checked score with the stored row.
    select * into previous from public.setlist_songs where id=new.id;
    if found and previous.setlist_id=new.setlist_id and previous.song_id=new.song_id then
      new.score_updated_at:=previous.score_updated_at;
      return new;
    end if;
  elsif old.setlist_id=new.setlist_id and old.song_id=new.song_id
      and public.setlist_source_score(old.override_json->'songData')
        is not distinct from public.setlist_source_score(new.override_json->'songData') then
    new.score_updated_at:=old.score_updated_at;
    return new;
  end if;
  -- Ignore client-provided dates, including ordinary saves of the whole list.
  new.score_updated_at:=case when jsonb_typeof(new.override_json->'songData')='object'
    then clock_timestamp() else null end;
  return new;
end;
$$;
-- Run after manager content protection and source-baseline capture.
create trigger zzz_track_setlist_score_modified_time before insert or update on public.setlist_songs
  for each row execute function public.track_setlist_score_modified_time();
revoke all on function public.track_setlist_score_modified_time() from public,anon,authenticated;
