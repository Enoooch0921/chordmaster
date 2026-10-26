import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const source = readFileSync('public/sw.js', 'utf8');
const setup = () => {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = { put: vi.fn() };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['chordmaster-pwa-old', 'unrelated']), delete: vi.fn(async () => true), match: vi.fn() };
  const self = { registration: { scope: 'https://example.test/chordmaster/' }, location: { href: 'https://example.test/chordmaster/sw.js', origin: 'https://example.test' }, skipWaiting: vi.fn(), clients: { claim: vi.fn() }, addEventListener: (type: string, callback: any) => { listeners[type] = callback; } };
  const response = { ok: true, clone() { return this; }, text: async () => '<script src="./assets/main.js"></script>' };
  const fetch = vi.fn(async (_url: string) => response);
  runInNewContext(source.replace('const BUILD_ASSETS = [];', "const BUILD_ASSETS = ['./assets/main.js'];"), { self, caches, fetch, URL, Set, Promise });
  return { listeners, cache, caches, self, fetch, response };
};
describe('safe offline app updates', () => {
  it('warms bundled assets without replacing the worker or deleting an open session’s cache', async () => {
    const { listeners, self, cache, caches } = setup();
    let pending!: Promise<void>;
    listeners.install({ waitUntil: (promise: Promise<void>) => { pending = promise; } }); await pending;
    expect(cache.put).toHaveBeenCalledWith('https://example.test/chordmaster/assets/main.js', expect.anything());
    expect(cache.put).toHaveBeenCalledWith('https://example.test/chordmaster/fonts/JianpuASCII.ttf', expect.anything());
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
    const { listeners, caches, fetch, response } = setup();
    fetch.mockRejectedValue(new Error('Offline')); caches.match.mockResolvedValue(response);
    for (const mode of ['navigate', 'cors']) {
      let pending!: Promise<unknown>;
      listeners.fetch({ request: { method: 'GET', url: `https://example.test/chordmaster/${mode === 'navigate' ? '' : 'assets/main.js'}`, mode }, respondWith: (promise: Promise<unknown>) => { pending = promise; } });
      expect(await pending).toBe(response);
    }
  });
});
