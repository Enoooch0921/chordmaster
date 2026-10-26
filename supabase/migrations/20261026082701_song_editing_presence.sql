-- Private, advisory editor status. No score data is broadcast or persisted.
-- Realtime owns this table and already enables RLS; do not change its schema.
create policy "library members receive song editor presence"
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and (select realtime.topic()) like 'song-editors:%'
  and public.can_read_library(substring((select realtime.topic()) from 14))
);

create policy "library editors publish song editor presence"
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (select realtime.topic()) like 'song-editors:%'
  and public.can_edit_library_content(substring((select realtime.topic()) from 14))
);
