// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

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
        .select('id, title, content_json, archived_at')
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
          song: song.content_json,
          archivedAt: song.archived_at ?? null
        }
      });
    }

    if (shareLink.resource_type === 'song_bundle') {
      const { data: bundle, error: bundleError } = await supabase
        .from('song_share_bundles')
        .select('id')
        .eq('id', shareLink.resource_id)
        .maybeSingle();
      if (bundleError || !bundle) {
        return jsonResponse({ error: 'Song bundle not found.' }, 404);
      }

      const { data: bundleItems, error: bundleItemsError } = await supabase
        .from('song_share_bundle_items')
        .select('song_id, order_index')
        .eq('bundle_id', bundle.id)
        .order('order_index', { ascending: true });
      if (bundleItemsError) {
        return jsonResponse({ error: bundleItemsError.message }, 500);
      }

      const songIds = (bundleItems ?? []).map((item) => item.song_id);
      const { data: songs, error: songsError } = songIds.length > 0
        ? await supabase
          .from('songs')
          .select('id, title, content_json, archived_at')
          .in('id', songIds)
        : { data: [], error: null };
      if (songsError) {
        return jsonResponse({ error: songsError.message }, 500);
      }

      const songsById = new Map((songs ?? []).map((song) => [song.id, song] as const));
      const payloadSongs = songIds
        .map((songId) => songsById.get(songId))
        .filter(Boolean)
        .map((song) => ({
          id: song.id,
          title: song.title,
          song: song.content_json,
          archivedAt: song.archived_at ?? null
        }));

      return jsonResponse({
        resourceType: 'song_bundle',
        songBundle: {
          id: bundle.id,
          songs: payloadSongs
        }
      });
    }

    if (shareLink.resource_type === 'project') {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', shareLink.resource_id)
        .maybeSingle();

      if (projectError || !project) {
        return jsonResponse({ error: 'Project not found.' }, 404);
      }

      // Don't filter by `archived` — archive is the owner's local-view concept,
      // not a shareability concept. Recipients should see whatever setlists
      // exist in the project at the time the link is resolved.
      const { data: projectSetlists, error: projectSetlistsError } = await supabase
        .from('setlists')
        .select('id, name, display_mode, show_lyrics, created_at')
        .eq('project_id', shareLink.resource_id)
        .order('created_at', { ascending: true });

      if (projectSetlistsError) {
        return jsonResponse({ error: projectSetlistsError.message }, 500);
      }

      const setlistIds = (projectSetlists ?? []).map((sl) => sl.id);
      const { data: projectSetlistSongs, error: projectSetlistSongsError } = setlistIds.length > 0
        ? await supabase
          .from('setlist_songs')
          .select('id, setlist_id, song_id, order_index, override_json')
          .in('setlist_id', setlistIds)
          .order('order_index', { ascending: true })
        : { data: [], error: null };

      if (projectSetlistSongsError) {
        return jsonResponse({ error: projectSetlistSongsError.message }, 500);
      }

      const projectSongIds = Array.from(new Set((projectSetlistSongs ?? []).map((item) => item.song_id)));
      const { data: projectSongs, error: projectSongsError } = projectSongIds.length > 0
        ? await supabase
          .from('songs')
          .select('id, title, content_json, archived_at')
          .in('id', projectSongIds)
        : { data: [], error: null };

      if (projectSongsError) {
        return jsonResponse({ error: projectSongsError.message }, 500);
      }

      const projectSongsById = new Map((projectSongs ?? []).map((song) => [song.id, song] as const));
      const setlistPayloads = (projectSetlists ?? []).map((sl) => {
        const songsForSetlist = (projectSetlistSongs ?? [])
          .filter((item) => item.setlist_id === sl.id)
          .map((item) => {
            const baseSong = projectSongsById.get(item.song_id);
            const songContent = item.override_json?.songData ?? baseSong?.content_json;
            if (!songContent) {
              return null;
            }
            return {
              id: item.id,
              title: baseSong?.title ?? '',
              song: songContent,
              overrideKey: item.override_json?.overrideKey ?? null,
              archivedAt: baseSong?.archived_at ?? null
            };
          })
          .filter(Boolean);

        return {
          id: sl.id,
          name: sl.name,
          displayMode: sl.display_mode,
          showLyrics: sl.show_lyrics,
          songs: songsForSetlist
        };
      });

      return jsonResponse({
        resourceType: 'project',
        project: {
          id: project.id,
          name: project.name,
          setlists: setlistPayloads
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
        .select('id, title, content_json, archived_at')
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
          song: item.override_json?.songData ?? song.content_json,
          overrideKey: item.override_json?.overrideKey ?? null,
          archivedAt: song.archived_at ?? null
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
