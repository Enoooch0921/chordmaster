import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AuthCallbackPage from './AuthCallbackPage';
import { rememberInvitationAuthReturn, takeInvitationAuthReturn } from '../lib/invitationJourney';
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), session: vi.fn(), subscribe: vi.fn(), resume: vi.fn(), fail: vi.fn() }));
vi.mock('../lib/auth', () => ({ NATIVE_AUTH_NEXT_PATH_STORAGE_KEY: 'native-next', resolveActiveSession: mocks.session }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: mocks.exchange, onAuthStateChange: mocks.subscribe } } }));
vi.mock('../components/InvitationTransition', () => ({ useInvitationTransition: () => ({ resume: mocks.resume, fail: mocks.fail }) }));
function Location() { const location = useLocation(); return <div>{location.pathname}</div>; }
const view = () => render(<StrictMode><MemoryRouter initialEntries={['/auth/callback']}><Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="*" element={<Location />} /></Routes></MemoryRouter></StrictMode>);
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  mocks.exchange.mockResolvedValue({ error: null }); mocks.session.mockResolvedValue({ access_token: 'test' });
  mocks.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  window.history.replaceState(null, '', '/auth/callback?code=test&next=%2Fshare%2Finvite');
});
it('returns a matched invitation once even under StrictMode', async () => {
  const invitation = { kind: 'project' as const, id: 'p', token: 'invite', name: 'Sunday', language: 'zh' as const, motion: 'full' as const };
  rememberInvitationAuthReturn(invitation); view();
  expect(await screen.findByText('/share/invite')).toBeVisible();
  expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(invitation);
  expect(mocks.exchange).toHaveBeenCalledTimes(1);
  expect(takeInvitationAuthReturn('/share/invite')).toBeNull();
});
it('does not animate normal login, even when the URL names an invitation', async () => {
  view(); await screen.findByText('/share/invite'); expect(mocks.resume).not.toHaveBeenCalled();
});
it('preserves the native return path across simultaneous auth event and session completion', async () => {
  window.history.replaceState(null, '', '/auth/callback'); localStorage.setItem('native-next', '/share/native');
  mocks.subscribe.mockImplementation(callback => { callback('SIGNED_IN', { user: { id: 'user' } }); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  view(); expect(await screen.findByText('/share/native')).toBeVisible();
  expect(localStorage.getItem('native-next')).toBeNull();
});
it('exposes OAuth failure instead of leaving an unrecoverable cover', async () => {
  window.history.replaceState(null, '', '/auth/callback?error=access_denied&next=%2Fshare%2Finvite');
  view(); await waitFor(() => expect(mocks.fail).toHaveBeenCalledWith('access_denied'));
  expect(screen.getByRole('button', { name: '返回並重試' })).toBeVisible();
  expect(mocks.exchange).not.toHaveBeenCalled();
});
