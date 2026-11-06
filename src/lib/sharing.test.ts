import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { resolveShareLink, resolveShareLinkUpdate, ShareLinkResolutionError } from './sharing';

beforeEach(() => mocks.invoke.mockReset());

describe('public share requests', () => {
  it('opts into conditional reads and falls back to a full response from an older server', async () => {
    const payload = { resourceType: 'setlist', setlist: { id: 'sl', songs: [] } };
    mocks.invoke.mockResolvedValue({ data: payload, error: null });
    expect(await resolveShareLinkUpdate('token')).toEqual({ version: null, payload });
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({ token: 'token', conditional: true, knownVersion: null });
    const version = 'a'.repeat(64);
    mocks.invoke.mockResolvedValue({ data: { version, unchanged: true }, error: null });
    expect(await resolveShareLinkUpdate('token', undefined, version)).toEqual({ version, payload: null });
    await expect(resolveShareLinkUpdate('token')).rejects.toThrow('baseline');
    await expect(resolveShareLinkUpdate('token', undefined, 'b'.repeat(64))).rejects.toThrow('baseline');
  });

  it('still propagates revoked access when requesting an unchanged version', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response('{"error":"Revoked"}', { status: 410 }) } });
    await expect(resolveShareLinkUpdate('token', undefined, 'a'.repeat(64))).rejects.toMatchObject({ status: 410 });
  });
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
