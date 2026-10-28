import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
const state = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), unsubscribe: vi.fn(),
  callback: null as null | ((event: string, session: unknown) => void) }));
vi.mock('./supabase', () => ({ hasSupabaseConfig: true, supabase: { auth: {
  getSession: state.getSession, refreshSession: state.refreshSession,
  onAuthStateChange: (callback: typeof state.callback) => { state.callback = callback; return { data: { subscription: { unsubscribe: state.unsubscribe } } }; }
} } }));
import { useSupabaseAuth } from './auth';
const session = () => ({ access_token: 'test-session', expires_at: Date.now() / 1000 + 3600,
  user: { id: 'user', email: 'user@example.invalid', user_metadata: { name: 'Test' } } });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  state.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  state.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.restoreAllMocks());

it('reports offline immediately without waiting for an expired-session network refresh', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const { result } = renderHook(useSupabaseAuth);
  await waitFor(() => expect(result.current.status).toBe('offline'));
  expect(state.getSession).not.toHaveBeenCalled(); expect(state.refreshSession).not.toHaveBeenCalled();
});
it('distinguishes a retryable refresh failure and signs in after connectivity returns', async () => {
  state.getSession.mockResolvedValue({ data: { session: null }, error: null });
  state.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Network unavailable', 503) });
  const { result } = renderHook(useSupabaseAuth);
  await waitFor(() => expect(result.current.status).toBe('offline'));
  state.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  expect(result.current.user?.id).toBe('user');
});
it('ignores an old in-flight response after explicit sign-out', async () => {
  let resolve!: (value: unknown) => void;
  state.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  localStorage.setItem('chordmaster.cloud-startup.v1', '{"version":1,"userId":"user","libraryId":"team"}');
  const { result } = renderHook(useSupabaseAuth);
  act(() => state.callback?.('SIGNED_OUT', null));
  await act(async () => resolve({ data: { session: session() }, error: null }));
  expect(result.current.status).toBe('unauthenticated'); expect(result.current.user).toBeNull();
  expect(localStorage.getItem('chordmaster.cloud-startup.v1')).toBeNull();
});
it('preserves an already open session when offline focus events arrive', async () => {
  const { result } = renderHook(useSupabaseAuth);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(result.current.user?.id).toBe('user'); expect(result.current.status).toBe('authenticated');
});
it('clears the startup identity when the server definitively rejects the saved session', async () => {
  state.getSession.mockResolvedValue({ data: { session: null }, error: null });
  state.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 400 } });
  localStorage.setItem('chordmaster.cloud-startup.v1', '{}');
  const { result } = renderHook(useSupabaseAuth);
  await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
  expect(localStorage.getItem('chordmaster.cloud-startup.v1')).toBeNull();
});
