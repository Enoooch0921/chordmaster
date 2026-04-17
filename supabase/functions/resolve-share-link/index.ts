// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const jsonResponse = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  })
);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await request.json();
    if (!token) {
      return jsonResponse({ error: 'Missing token.' }, 400);
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
      return jsonResponse({ error: 'Share link not found.' }, 404);
    }

    if (shareLink.revoked_at) {
      return jsonResponse({ error: 'Share link has been revoked.' }, 410);
    }

    if (shareLink.expires_at && new Date(shareLink.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'Share link has expired.' }, 410);
    }

    if (shareLink.resource_type === 'song') {
      const { data: song, error: songError } = await supabase
        .from('songs')
        .select('id, title, content_json')
        .eq('id', shareLink.resource_id)
        .maybeSingle();

      if (songError || !song) {
        return jsonResponse({ error: 'Song not found.' }, 404);
      }

      return jsonResponse({
        resourceType: 'song',
        song: {
          id: song.id,
          title: song.title,
          song: song.content_json
        }
      });
    }

    const { data: setlist, error: setlistError } = await supabase
      .from('setlists')
      .select('id, name, display_mode, show_lyrics')
      .eq('id', shareLink.resource_id)
      .maybeSingle();

    if (setlistError || !setlist) {
      return jsonResponse({ error: 'Setlist not found.' }, 404);
    }

    const { data: setlistSongs, error: setlistSongsError } = await supabase
      .from('setlist_songs')
      .select('id, song_id, order_index, override_json')
      .eq('setlist_id', setlist.id)
      .order('order_index', { ascending: true });

    if (setlistSongsError) {
      return jsonResponse({ error: setlistSongsError.message }, 500);
    }

    const songIds = (setlistSongs ?? []).map((item) => item.song_id);
    const { data: songs, error: songsError } = songIds.length > 0
      ? await supabase
        .from('songs')
        .select('id, title, content_json')
        .in('id', songIds)
      : { data: [], error: null };

    if (songsError) {
      return jsonResponse({ error: songsError.message }, 500);
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

    return jsonResponse({
      resourceType: 'setlist',
      setlist: {
        id: setlist.id,
        name: setlist.name,
        displayMode: setlist.display_mode,
        showLyrics: setlist.show_lyrics,
        songs: payloadSongs
      }
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unexpected error.'
    }, 500);
  }
});
