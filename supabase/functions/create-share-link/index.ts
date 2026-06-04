// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
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

const getActiveShareToken = async (adminSupabase, resourceType: string, resourceId: string) => {
  const { data, error } = await adminSupabase
    .from('share_links')
    .select('token, expires_at')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const now = Date.now();
  return (data ?? []).find((link) => (
    !link.expires_at || new Date(link.expires_at).getTime() > now
  ))?.token ?? null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      return jsonResponse({ error: 'Missing bearer token.' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization
        }
      }
    });
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false
      }
    });

    const { data: authData, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { resourceType, resourceId } = await request.json();
    if (!resourceType || !resourceId || !['song', 'setlist', 'project'].includes(resourceType)) {
      return jsonResponse({ error: 'Invalid resource payload.' }, 400);
    }

    const tableName = resourceType === 'song'
      ? 'songs'
      : resourceType === 'setlist' ? 'setlists' : 'projects';
    const { data: resource, error: resourceError } = await supabase
      .from(tableName)
      .select('id, library_id')
      .eq('id', resourceId)
      .maybeSingle();

    if (resourceError || !resource?.id) {
      return jsonResponse({ error: 'Resource not found or access denied.' }, 404);
    }

    const existingToken = await getActiveShareToken(adminSupabase, resourceType, resourceId);
    if (existingToken) {
      return jsonResponse({ token: existingToken });
    }

    const { data: canWrite, error: canWriteError } = await supabase
      .rpc('can_write_library', { target_library_id: resource.library_id });
    if (canWriteError) {
      return jsonResponse({ error: canWriteError.message }, 400);
    }

    let canCreateNewShareLink = canWrite === true;
    if (!canCreateNewShareLink && resourceType === 'project') {
      const { data: isProjectManager, error: projectManagerError } = await supabase
        .rpc('has_project_manager_role', { target_project_id: resourceId });
      if (projectManagerError) {
        return jsonResponse({ error: projectManagerError.message }, 400);
      }
      canCreateNewShareLink = isProjectManager === true;
    }

    if (!canCreateNewShareLink) {
      return jsonResponse({ error: 'You do not have permission to create a new share link.' }, 403);
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
