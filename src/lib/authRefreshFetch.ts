// GoTrue can report temporary contention on its refresh-token endpoint. If the
// SDK treats this as a permanent rejection it removes the saved session.
export function createAuthFetch(backendUrl: string): typeof fetch {
  const endpoint = new URL(backendUrl.replace(/\/$/, '') + '/auth/v1/token');
  return async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
    if ((init?.method ?? request?.method)?.toUpperCase() !== 'POST') return fetch(input, init);
    const url = new URL(request?.url ?? String(input), endpoint);
    if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname
      || url.searchParams.get('grant_type') !== 'refresh_token') return fetch(input, init);

    const controller = new AbortController();
    const signal = init?.signal ?? request?.signal;
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 30_000);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      // Keep the deadline active while receiving the small token response, too.
      const complete = new Response(response.body ? await response.arrayBuffer() : null, response);
      if (response.status === 409) {
        const body = await complete.clone().json().catch(() => null);
        if (body?.code === 'conflict' || body?.error_code === 'conflict') {
          throw new Error('Concurrent session renewal');
        }
      }
      // A rejected fetch enters the SDK's normal retry and storage handling.
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new Error(`Session renewal temporarily unavailable (HTTP ${response.status})`);
      }
      return complete;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}
