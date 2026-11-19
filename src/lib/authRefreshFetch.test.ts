import { AuthClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createAuthFetch } from './authRefreshFetch';

const backend = 'https://nas.example.invalid';
const tokenUrl = backend + '/auth/v1/token?grant_type=refresh_token';
const authFetch = createAuthFetch(backend);
const post = { method: 'POST' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([
  [409, { code: 'conflict' }], [409, { error_code: 'conflict' }],
  [408, {}], [429, {}], [504, { error_code: 'request_timeout' }]
])('preserves an expired stored session through HTTP %i and renews it after recovery', async (status, body) => {
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const key = 'refresh-recovery-test';
  const user = { id: 'test-user', email: 'test@example.invalid' };
  const saved = { access_token: 'old-access', refresh_token: 'old-refresh', user, expires_at: now / 1000 - 60 };
  localStorage.setItem(key, JSON.stringify(saved));
  const fetcher = vi.fn().mockImplementationOnce(() => {
    now += 31_000; // The outage lasts beyond the SDK's per-call retry window.
    return Response.json(body, { status });
  }).mockImplementationOnce(() => Response.json({
    access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer', user
  }));
  vi.stubGlobal('fetch', fetcher);
  const client = new AuthClient({ url: backend + '/auth/v1', storage: localStorage, storageKey: key,
    autoRefreshToken: false, detectSessionInUrl: false, fetch: authFetch });
  try {
    const failed = await client.getSession();
    expect(isAuthRetryableFetchError(failed.error)).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
    now += 61_000; // Allow the SDK's failed-refresh cooldown to elapse.
    const restored = await client.getSession();
    expect(restored.error).toBeNull();
    expect(restored.data.session?.user.id).toBe(user.id);
    expect(JSON.parse(localStorage.getItem(key)!).refresh_token).toBe('new-refresh');
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    await client.dispose();
    localStorage.removeItem(key);
  }
});

it('honors a revoked refresh token and lets the SDK remove the expired session', async () => {
  const key = 'revoked-session-test';
  localStorage.setItem(key, JSON.stringify({
    access_token: 'old-access', refresh_token: 'revoked', expires_at: Date.now() / 1000 - 60
  }));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error_code: 'refresh_token_not_found' }, { status: 400 })));
  const client = new AuthClient({ url: backend + '/auth/v1', storage: localStorage, storageKey: key,
    autoRefreshToken: false, detectSessionInUrl: false, fetch: authFetch });
  try {
    expect((await client.getSession()).error?.code).toBe('refresh_token_not_found');
    expect(localStorage.getItem(key)).toBeNull();
  } finally {
    await client.dispose();
    localStorage.removeItem(key);
  }
});

it('passes through unrelated API, Google code exchange and logout responses', async () => {
  const response = Response.json({ error_code: 'conflict' }, { status: 409 });
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  for (const url of [
    backend + '/rest/v1/songs', backend + '/auth/v1/token?grant_type=pkce',
    backend + '/auth/v1/logout', 'https://other.example.invalid/auth/v1/token?grant_type=refresh_token'
  ]) {
    expect(await authFetch(url, post)).toBe(response);
    expect(fetcher).toHaveBeenLastCalledWith(url, post);
  }
});

it('bounds a stalled renewal so a later attempt can run', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_input, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new TypeError('Request aborted')));
  })));
  const result = expect(authFetch(tokenUrl, post)).rejects.toThrow('Request aborted');
  await vi.advanceTimersByTimeAsync(30_000);
  await result;
});
