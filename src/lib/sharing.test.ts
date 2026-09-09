import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { resolveShareLink, ShareLinkResolutionError } from './sharing';

beforeEach(() => mocks.invoke.mockReset());

describe('public share requests', () => {
  it('passes cancellation and a bounded timeout to the token-checked endpoint', async () => {
    const controller = new AbortController();
    const payload = { resourceType: 'setlist', setlist: { id: 'sl', songs: [] } };
    mocks.invoke.mockResolvedValue({ data: payload, error: null });
    expect(await resolveShareLink('share-token', controller.signal)).toBe(payload);
    expect(mocks.invoke).toHaveBeenCalledWith('resolve-share-link', {
      body: { token: 'share-token' }, signal: controller.signal, timeout: 15000
    });
  });

  it.each([403, 404, 410, 500])('retains status %s so polling distinguishes revoked links from transient failures', async (status) => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'Unavailable' }), { status }) } });
    const error = await resolveShareLink('share-token').catch((value) => value);
    expect(error).toBeInstanceOf(ShareLinkResolutionError);
    expect(error).toMatchObject({ status, message: 'Unavailable' });
  });
});
