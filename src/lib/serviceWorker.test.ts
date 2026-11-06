import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const source = readFileSync('public/sw.js', 'utf8');
const setup = () => {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = { put: vi.fn(), match: vi.fn() };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['chordmaster-pwa-old', 'unrelated']), delete: vi.fn(async () => true), match: vi.fn() };
  const self = { registration: { scope: 'https://example.test/chordmaster/' }, location: { href: 'https://example.test/chordmaster/sw.js', origin: 'https://example.test' }, skipWaiting: vi.fn(), clients: { claim: vi.fn(), matchAll: vi.fn(async () => [] as Array<{ id: string }>) }, addEventListener: (type: string, callback: any) => { listeners[type] = callback; } };
  const response = { ok: true, clone() { return this; }, text: async () => '<script src="./assets/main.js"></script>' };
  const fetch = vi.fn(async (_url: string) => response);
  runInNewContext(source.replace('const BUILD_ASSETS = [];', "const BUILD_ASSETS = ['./assets/main.js'];"), { self, caches, fetch, URL, Set, Promise });
  return { listeners, cache, caches, self, fetch, response };
};
describe('safe offline app updates', () => {
  it('only activates on an explicit update request from this app', async () => {
    const { listeners, self } = setup();
    const waitUntil = vi.fn();
    listeners.message({ data: { type: 'other' }, source: { url: 'https://example.test/chordmaster/' }, waitUntil });
    listeners.message({ data: { type: 'CHORDMASTER_ACTIVATE_UPDATE' }, source: { url: 'https://other.test/' }, waitUntil });
    expect(self.skipWaiting).not.toHaveBeenCalled();
    listeners.message({ data: { type: 'CHORDMASTER_ACTIVATE_UPDATE' }, source: { url: 'https://example.test/chordmaster/' }, waitUntil });
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });
  it('retains old caches while another page can still need its lazy chunks', async () => {
    const { listeners, self, caches } = setup();
    self.clients.matchAll.mockResolvedValue([{ id: 'performance-page' }]);
    let pending!: Promise<void>;
    listeners.activate({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    await pending;
    expect(caches.delete).not.toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });
  it('prunes old app caches when activation has no open pages', async () => {
    const { listeners, caches } = setup();
    let pending!: Promise<void>;
    listeners.activate({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    await pending;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith('chordmaster-pwa-old');
  });
  it('warms bundled assets without replacing the worker or deleting an open session’s cache', async () => {
    const { listeners, self, cache, caches } = setup();
    let pending!: Promise<void>;
    listeners.install({ waitUntil: (promise: Promise<void>) => { pending = promise; } }); await pending;
    expect(cache.put).toHaveBeenCalledWith('https://example.test/chordmaster/assets/main.js', expect.anything());
    expect(cache.put).toHaveBeenCalledWith('https://example.test/chordmaster/fonts/JianpuASCII.ttf?v=20261107', expect.anything());
    expect(self.skipWaiting).not.toHaveBeenCalled(); expect(caches.delete).not.toHaveBeenCalled();
  });
  it('rejects an incomplete release instead of replacing the working offline cache', async () => {
    const { listeners, self, caches, fetch, response } = setup();
    fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/assets/main.js')) throw new Error('Connection dropped during update');
      return response;
    });
    let pending!: Promise<void>;
    listeners.install({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    await expect(pending).rejects.toThrow('Connection dropped during update');
    expect(self.skipWaiting).not.toHaveBeenCalled(); expect(caches.delete).not.toHaveBeenCalled();
  });
  it('serves an already cached navigation and lazy chunk when the network fails', async () => {
    const { listeners, cache, caches, fetch, response } = setup();
    fetch.mockRejectedValue(new Error('Offline')); caches.match.mockResolvedValue(response); cache.match.mockResolvedValue(response);
    for (const mode of ['navigate', 'cors']) {
      let pending!: Promise<unknown>;
      listeners.fetch({ request: { method: 'GET', url: `https://example.test/chordmaster/${mode === 'navigate' ? '' : 'assets/main.js'}`, mode }, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
      expect(await pending).toBe(response);
    }
  });
  it('opens the installed shell immediately when a weak network request would never finish', async () => {
    const { listeners, cache, fetch, response } = setup();
    fetch.mockImplementation(() => new Promise(() => {}));
    cache.match.mockResolvedValue(response);
    let pending!: Promise<unknown>;
    listeners.fetch({ request: { method: 'GET', url: 'https://example.test/chordmaster/?team=team', mode: 'navigate' }, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
    expect(await pending).toBe(response);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('fetches the page only when this release has no cached shell', async () => {
    const { listeners, cache, caches, fetch, response } = setup();
    caches.match.mockResolvedValue({ stale: true });
    let pending!: Promise<unknown>;
    const request = { method: 'GET', url: 'https://example.test/chordmaster/', mode: 'navigate' };
    listeners.fetch({ request, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
    expect(await pending).toBe(response);
    expect(fetch).toHaveBeenCalledWith(request);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
