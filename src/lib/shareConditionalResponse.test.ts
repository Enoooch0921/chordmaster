// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conditionalPayload } from '../../supabase/functions/_shared/conditionalResponse';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), limit: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../supabase/functions/_shared/rateLimit.ts', () => ({ consumeRequestLimit: mocks.limit }));

let handler: (request: Request) => Promise<Response>;
let link: Record<string, unknown>;
let score: Record<string, unknown>;
beforeEach(async () => {
  vi.resetModules();
  mocks.limit.mockReset().mockResolvedValue(true);
  link = { resource_type: 'song', resource_id: 'song', revoked_at: null, expires_at: null };
  score = { id: 'song', title: 'Test', content_json: { currentKey: 'C', sections: [] }, archived_at: null };
  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder), eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: table === 'share_links' ? link : score, error: null }))
    };
    return builder;
  });
  mocks.createClient.mockReset().mockReturnValue({ from });
  vi.stubGlobal('Deno', { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } });
  await import('../../supabase/functions/resolve-share-link/index.ts');
});
afterEach(() => vi.unstubAllGlobals());

const read = (body: Record<string, unknown> = {}) => handler(new Request('https://example.invalid/share', {
  method: 'POST', body: JSON.stringify({ token: 'test-token', ...body })
}));

describe('conditional NAS share response', () => {
  it('keeps old clients compatible and sends only a confirmation for unchanged new clients', async () => {
    const legacy = await (await read()).json();
    expect(legacy.resourceType).toBe('song');
    expect(legacy.version).toBeUndefined();
    const initial = await (await read({ conditional: true })).json();
    expect(initial.payload).toEqual(legacy);
    const unchanged = await read({ conditional: true, knownVersion: initial.version });
    const text = await unchanged.text();
    expect(JSON.parse(text)).toEqual({ version: initial.version, unchanged: true });
    expect(Buffer.byteLength(text)).toBe(95);
    expect(unchanged.headers.get('cache-control')).toBe('no-store');
    score.content_json = { currentKey: 'D', sections: [] };
    const changed = await (await read({ conditional: true, knownVersion: initial.version })).json();
    expect(changed.unchanged).toBe(false);
    expect(changed.payload.song.song.currentKey).toBe('D');
    expect(changed.version).not.toBe(initial.version);
  });

  it.each(['revoked', 'expired', 'missing', 'limited'])('rechecks %s access before acknowledging a version', async kind => {
    const initial = await (await read({ conditional: true })).json();
    if (kind === 'revoked') link.revoked_at = new Date().toISOString();
    if (kind === 'expired') link.expires_at = '2000-01-01T00:00:00Z';
    if (kind === 'missing') link = null;
    if (kind === 'limited') mocks.limit.mockResolvedValue(false);
    const response = await read({ conditional: true, knownVersion: initial.version });
    expect(response.status).toBe(kind === 'missing' ? 404 : kind === 'limited' ? 429 : 410);
    expect((await response.json()).unchanged).toBeUndefined();
  });

  it('versions nested score content, ordering, deletions and display settings', async () => {
    const original = { resourceType: 'project', project: { name: 'Event', setlists: [{
      id: 'sl', displayMode: 'chord-fixed-key', songs: [
        { id: 'one', overrideKey: 'C', song: { sections: [{ bars: [{ chords: ['C'] }] }] } },
        { id: 'two', overrideKey: 'D', song: { sections: [] } }
      ]
    }] } };
    const { version } = await conditionalPayload(original, null);
    expect((await conditionalPayload(structuredClone(original), version)).unchanged).toBe(true);
    for (const change of [
      (p: typeof original) => { p.project.setlists[0].songs[0].song.sections[0].bars[0].chords = ['Am']; },
      (p: typeof original) => { p.project.setlists[0].songs.reverse(); },
      (p: typeof original) => { p.project.setlists[0].songs.pop(); },
      (p: typeof original) => { p.project.setlists[0].displayMode = 'lyrics'; }
    ]) {
      const next = structuredClone(original); change(next);
      expect((await conditionalPayload(next, version)).unchanged).toBe(false);
    }
  });
});
