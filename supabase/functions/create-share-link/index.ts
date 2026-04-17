// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (request) => {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization
        }
      }
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401 });
    }

    const { resourceType, resourceId } = await request.json();
    if (!resourceType || !resourceId || !['song', 'setlist'].includes(resourceType)) {
      return new Response(JSON.stringify({ error: 'Invalid resource payload.' }), { status: 400 });
    }

    const tableName = resourceType === 'song' ? 'songs' : 'setlists';
    const { data: resource, error: resourceError } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', resourceId)
      .maybeSingle();

    if (resourceError || !resource?.id) {
      return new Response(JSON.stringify({ error: 'Resource not found or access denied.' }), { status: 404 });
    }

    const { data: existing } = await supabase
      .from('share_links')
      .select('token')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      return new Response(JSON.stringify({ token: existing.token }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = crypto.randomUUID().replaceAll('-', '');
    const { error: insertError } = await supabase
      .from('share_links')
      .insert({
        resource_type: resourceType,
        resource_id: resourceId,
        token,
        created_by: authData.user.id
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ token }), {
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
