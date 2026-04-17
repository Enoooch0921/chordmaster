// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
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
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
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
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { resourceType, resourceId } = await request.json();
    if (!resourceType || !resourceId || !['song', 'setlist'].includes(resourceType)) {
      return jsonResponse({ error: 'Invalid resource payload.' }, 400);
    }

    const tableName = resourceType === 'song' ? 'songs' : 'setlists';
    const { data: resource, error: resourceError } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', resourceId)
      .maybeSingle();

    if (resourceError || !resource?.id) {
      return jsonResponse({ error: 'Resource not found or access denied.' }, 404);
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
      return jsonResponse({ token: existing.token });
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
      return jsonResponse({ error: insertError.message }, 400);
    }

    return jsonResponse({ token });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unexpected error.'
    }, 500);
  }
});
