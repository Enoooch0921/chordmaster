// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (request) => {
  try {
    const { token } = await request.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token.' }), { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false
      }
    });

    const { data: shareLink, error: shareError } = await supabase
      .from('share_links')
      .select('resource_type, resource_id, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (shareError || !shareLink) {
      return new Response(JSON.stringify({ error: 'Share link not found.' }), { status: 404 });
    }

    if (shareLink.revoked_at) {
      return new Response(JSON.stringify({ error: 'Share link has been revoked.' }), { status: 410 });
    }

    if (shareLink.expires_at && new Date(shareLink.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'Share link has expired.' }), { status: 410 });
    }

    if (shareLink.resource_type === 'song') {
      const { data: song, error: songError } = await supabase
        .from('songs')
        .select('id, title, content_json')
        .eq('id', shareLink.resource_id)
        .maybeSingle();

      if (songError || !song) {
        return new Response(JSON.stringify({ error: 'Song not found.' }), { status: 404 });
      }

      return new Response(JSON.stringify({
        resourceType: 'song',
        song: {
          id: song.id,
          title: song.title,
          song: song.content_json
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { data: setlist, error: setlistError } = await supabase
      .from('setlists')
      .select('id, name, display_mode, show_lyrics')
      .eq('id', shareLink.resource_id)
      .maybeSingle();

    if (setlistError || !setlist) {
      return new Response(JSON.stringify({ error: 'Setlist not found.' }), { status: 404 });
    }

    const { data: setlistSongs, error: setlistSongsError } = await supabase
      .from('setlist_songs')
      .select('id, song_id, order_index, override_json')
      .eq('setlist_id', setlist.id)
      .order('order_index', { ascending: true });

    if (setlistSongsError) {
      return new Response(JSON.stringify({ error: setlistSongsError.message }), { status: 500 });
    }

    const songIds = (setlistSongs ?? []).map((item) => item.song_id);
    const { data: songs, error: songsError } = songIds.length > 0
      ? await supabase
        .from('songs')
        .select('id, title, content_json')
        .in('id', songIds)
      : { data: [], error: null };

    if (songsError) {
      return new Response(JSON.stringify({ error: songsError.message }), { status: 500 });
    }

    const songsById = new Map((songs ?? []).map((song) => [song.id, song] as const));
    const payloadSongs = (setlistSongs ?? [])
      .map((item) => {
        const song = songsById.get(item.song_id);
        if (!song) {
          return null;
        }

        return {
          id: item.id,
          title: song.title,
          song: item.override_json?.songData ?? song.content_json
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({
      resourceType: 'setlist',
      setlist: {
        id: setlist.id,
        name: setlist.name,
        displayMode: setlist.display_mode,
        showLyrics: setlist.show_lyrics,
        songs: payloadSongs
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unexpected error.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
