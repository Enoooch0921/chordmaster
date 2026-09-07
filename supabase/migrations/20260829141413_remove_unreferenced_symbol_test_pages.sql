-- Remove previously uploaded copies of the bundled symbol-test fixtures from
-- personal cloud libraries. Preserve anything referenced by a setlist, share,
-- bundle, or import record so deployment never removes user-linked data.

delete from public.songs song
using public.libraries library
where library.id = song.library_id
  and library.kind = 'personal'
  and song.title in ('符號測試頁', '符號測試頁（2行）', '符號測試頁（3行）')
  and jsonb_typeof(song.content_json -> 'sections') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(song.content_json -> 'sections') section
    where section ->> 'id' = 'test-bars'
  )
  and exists (
    select 1
    from jsonb_array_elements(song.content_json -> 'sections') section
    where section ->> 'id' = 'test-meter'
  )
  and not exists (
    select 1 from public.setlist_songs item where item.song_id = song.id
  )
  and not exists (
    select 1 from public.share_links link
    where link.resource_type = 'song' and link.resource_id = song.id
  )
  and not exists (
    select 1 from public.song_share_bundle_items item where item.song_id = song.id
  )
  and not exists (
    select 1 from public.song_share_imports imported
    where imported.source_song_id = song.id or imported.imported_song_id = song.id
  )
  and not exists (
    select 1 from public.team_song_imports imported
    where imported.source_song_id = song.id or imported.team_song_id = song.id
  );
