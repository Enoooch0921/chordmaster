import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => null) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
it('probes the configured service without caching, workspace reads or session credentials', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://backend.example.invalid/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetcher);
  const { checkSupabaseConnection } = await import('./supabase');
  const controller = new AbortController(); await checkSupabaseConnection(controller.signal);
  expect(fetcher).toHaveBeenCalledWith('https://backend.example.invalid/auth/v1/health', {
    signal: controller.signal, cache: 'no-store', credentials: 'omit', headers: { apikey: 'public-test-key' }
  });
  fetcher.mockResolvedValue({ ok: false, status: 503 });
  await expect(checkSupabaseConnection(controller.signal)).rejects.toThrow('503');
});
it('never probes an unconfigured backend', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { checkSupabaseConnection } = await import('./supabase');
  await expect(checkSupabaseConnection(new AbortController().signal)).rejects.toThrow('not configured');
  expect(fetcher).not.toHaveBeenCalled();
});
