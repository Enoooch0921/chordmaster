import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  isNativePlatform: vi.fn(),
  open: vi.fn()
}));

vi.mock('./supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { auth: { signInWithOAuth: auth.signInWithOAuth } }
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: auth.isNativePlatform } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: auth.open } }));

import { takeInvitationAuthReturn, rememberInvitationAuthReturn } from './invitationJourney';
import { NATIVE_AUTH_NEXT_PATH_STORAGE_KEY, signInWithGoogleRedirect } from './auth';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.isNativePlatform.mockReturnValue(false);
  auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/example' }, error: null });
});

describe('Google account selection', () => {
  it('requests the account chooser on every web sign-in and preserves the return path', async () => {
    await signInWithGoogleRedirect('/');
    await signInWithGoogleRedirect('/share/example');

    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2);
    for (const [request] of auth.signInWithOAuth.mock.calls) {
      expect(request).toMatchObject({
        provider: 'google',
        options: { queryParams: { prompt: 'select_account' }, skipBrowserRedirect: false }
      });
    }
    const callback = new URL(auth.signInWithOAuth.mock.lastCall![0].options.redirectTo);
    expect(callback.pathname).toMatch(/\/auth\/callback$/);
    expect(callback.searchParams.get('next')).toBe('/share/example');
    expect(auth.open).not.toHaveBeenCalled();
  });

  it('also requests the account chooser in the native browser and keeps the native callback', async () => {
    auth.isNativePlatform.mockReturnValue(true);

    await signInWithGoogleRedirect('/team/invite/example');

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'chordmaster://auth/callback',
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true
      }
    });
    expect(localStorage.getItem(NATIVE_AUTH_NEXT_PATH_STORAGE_KEY)).toBe('/team/invite/example');
    expect(auth.open).toHaveBeenCalledWith({ url: 'https://accounts.google.com/example' });
  });

  it('propagates a failed sign-in without opening a browser', async () => {
    auth.isNativePlatform.mockReturnValue(true);
    const error = new Error('Sign-in unavailable');
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error });

    await expect(signInWithGoogleRedirect()).rejects.toThrow(error);
    expect(auth.open).not.toHaveBeenCalled();
  });
});

it('reserves the return animation for an explicit invitation and clears it on ordinary sign-in or failure', async () => {
  const invitation = { kind: 'project' as const, id: 'p', name: 'Sunday', token: 'invite', language: 'zh' as const, motion: 'full' as const };
  await signInWithGoogleRedirect('/share/invite', invitation);
  expect(takeInvitationAuthReturn('/share/invite')).toEqual(invitation);
  rememberInvitationAuthReturn(invitation);
  await signInWithGoogleRedirect('/');
  expect(takeInvitationAuthReturn('/share/invite')).toBeNull();
  auth.signInWithOAuth.mockRejectedValue(new Error('Offline'));
  await expect(signInWithGoogleRedirect('/share/invite', invitation)).rejects.toThrow('Offline');
  expect(takeInvitationAuthReturn('/share/invite')).toBeNull();
});
