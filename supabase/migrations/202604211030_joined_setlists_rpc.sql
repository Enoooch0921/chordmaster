-- Return joined setlists and embedded song charts for the current authenticated user.
-- This avoids multi-table client reads being blocked by RLS policy interactions.

create or replace function public.get_joined_setlists()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sl.id,
        'name', sl.name,
        'displayMode', sl.display_mode,
        'showLyrics', sl.show_lyrics,
        'createdAt', sl.created_at,
        'updatedAt', sl.updated_at,
        'songs', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ss.id,
              'setlistId', ss.setlist_id,
              'songId', ss.song_id,
              'order', ss.order_index,
              'overrideKey', ss.override_json ->> 'overrideKey',
              'capo',
                case
                  when ucco.capo is not null then ucco.capo
                  when jsonb_typeof(ss.override_json -> 'capo') = 'number' then (ss.override_json ->> 'capo')::integer
                  else null
                end,
              'sectionOrder', coalesce(ss.override_json -> 'sectionOrder', '[]'::jsonb),
              'songData', coalesce(s.content_json, ss.override_json -> 'songData')
            )
            order by ss.order_index asc
          )
          from public.setlist_songs ss
          left join public.songs s on s.id = ss.song_id
          left join public.user_setlist_capo_overrides ucco
            on ucco.setlist_song_id = ss.id
           and ucco.user_id = auth.uid()
          where ss.setlist_id = sl.id
        ), '[]'::jsonb)
      )
      order by usm.joined_at asc
    ),
    '[]'::jsonb
  )
  from public.user_setlist_memberships usm
  join public.setlists sl on sl.id = usm.setlist_id
  where usm.user_id = auth.uid()
$$;

grant execute on function public.get_joined_setlists() to authenticated;
