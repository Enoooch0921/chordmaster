import { useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { isAuthRefreshDiscardedError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { AuthenticatedUser } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';
import { clearInvitationAuthReturn, invitationPath, rememberInvitationAuthReturn, type InvitationAuthReturn } from './invitationJourney';
import { clearCloudStartupPointer } from './cloudWorkspaceCache';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured' | 'offline';
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;
export const NATIVE_AUTH_NEXT_PATH_STORAGE_KEY = 'chordmaster.native-auth-next-path.v1';

const mapSessionUser = (session: Session | null): AuthenticatedUser | null => {
  const user = session?.user;
  if (!user?.email) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === 'string'
    ? metadata.full_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : user.email;
  const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined;

  return {
    id: user.id,
    email: user.email,
    name: fullName,
    picture: avatarUrl
  };
};

export const buildAppUrl = (path: string) => (
  new URL(path.replace(/^\//, ''), new URL(import.meta.env.BASE_URL, window.location.origin)).toString()
);

const buildNativeAppUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `chordmaster://${normalizedPath.replace(/^\//, '')}`;
};

export const signInWithGoogleRedirect = async (nextPath = '/', invitation?: InvitationAuthReturn) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const isNative = Capacitor.isNativePlatform();
  const normalizedNextPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  const callbackUrl = new URL(isNative ? buildNativeAppUrl('auth/callback') : buildAppUrl('auth/callback'));

  if (isNative) {
    window.localStorage.setItem(NATIVE_AUTH_NEXT_PATH_STORAGE_KEY, normalizedNextPath);
  } else {
    callbackUrl.searchParams.set('next', normalizedNextPath);
  }

  clearInvitationAuthReturn();
  if (invitation && normalizedNextPath === invitationPath(invitation.token)) rememberInvitationAuthReturn(invitation);
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: isNative
      }
    });

    if (error) {
      throw error;
    }

    if (isNative && data.url) {
      await Browser.open({ url: data.url });
    }
  } catch (error) {
    clearInvitationAuthReturn();
    throw error;
  }
};

const isSessionUsable = (session: Session | null) => {
  return Boolean(session?.access_token?.trim() && (!session.expires_at || session.expires_at * 1000 > Date.now()));
};

export const resolveActiveSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  // getSession already renews near-expiry tokens under the SDK's auth lock.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token?.trim()) return null;
  if (isSessionUsable(data.session)) return data.session;
  // The access token can expire as getSession returns a proactive fallback.
  const renewed = await supabase.auth.refreshSession();
  if (renewed.error) throw renewed.error;
  return renewed.data.session;
};

export const useSupabaseAuth = () => {
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const knownSession = useRef<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }

    let isMounted = true;
    let generation = 0;
    let checking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextDelay = INITIAL_RETRY_MS;

    const cancelRetry = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const applySession = (value: Session | null) => {
      generation += 1;
      cancelRetry();
      nextDelay = INITIAL_RETRY_MS;
      knownSession.current = value;
      if (!value) clearCloudStartupPointer();
      setSession(value);
      setStatus(value ? 'authenticated' : 'unauthenticated');
    };
    const isVisible = () => document.visibilityState !== 'hidden';
    const syncSession = async () => {
      if (!isMounted || checking || !isVisible()) return;
      cancelRetry();
      if (navigator.onLine === false) {
        setStatus(knownSession.current ? 'authenticated' : 'offline');
        return;
      }
      const request = generation;
      checking = true;
      try {
        const value = await resolveActiveSession();
        if (isMounted && request === generation) applySession(value);
      } catch (error) {
        if (!isMounted || request !== generation) return;
        if (isAuthRetryableFetchError(error) || isAuthRefreshDiscardedError(error)
          || error instanceof TypeError) {
          setStatus(knownSession.current ? 'authenticated' : 'offline');
          if (navigator.onLine && isVisible()) {
            timer = setTimeout(syncSession, nextDelay);
            nextDelay = Math.min(nextDelay * 2, MAX_RETRY_MS);
          }
        } else {
          applySession(null);
        }
      } finally {
        checking = false;
      }
    };

    void syncSession();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT') applySession(null);
      else if (nextSession && isSessionUsable(nextSession)) applySession(nextSession);
      // INITIAL_SESSION can be null when a renewal times out. The separate
      // getSession call distinguishes that from an empty session store.
    });
    const reconnect = () => { void syncSession(); };
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') cancelRetry();
      else reconnect();
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    window.addEventListener('pageshow', reconnect);
    document.addEventListener('visibilitychange', visibilityChanged);

    return () => {
      isMounted = false;
      cancelRetry();
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
      window.removeEventListener('pageshow', reconnect);
      document.removeEventListener('visibilitychange', visibilityChanged);
      data.subscription.unsubscribe();
    };
  }, [retryAttempt]);

  const user = useMemo(() => mapSessionUser(session), [session]);

  const signInWithGoogle = async () => {
    await signInWithGoogleRedirect('/');
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    clearCloudStartupPointer();
  };

  return {
    session,
    user,
    status,
    isConfigured: hasSupabaseConfig,
    signInWithGoogle,
    signOut,
    retry: () => setRetryAttempt(attempt => attempt + 1)
  };
};
