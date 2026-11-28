-- The existing self-only policy still controls whose preference can be
-- touched. Restrict writes to entries visible through setlist_songs RLS.
create policy personal_capo_visible_entry_insert
on public.user_setlist_capo_overrides as restrictive
for insert to authenticated
with check (exists (
  select 1 from public.setlist_songs entry where entry.id = user_setlist_capo_overrides.setlist_song_id
));

create policy personal_capo_visible_entry_update
on public.user_setlist_capo_overrides as restrictive
for update to authenticated
using (exists (
  select 1 from public.setlist_songs entry where entry.id = user_setlist_capo_overrides.setlist_song_id
))
with check (exists (
  select 1 from public.setlist_songs entry where entry.id = user_setlist_capo_overrides.setlist_song_id
));
