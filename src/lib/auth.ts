import { useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { AuthenticatedUser } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';
import { clearInvitationAuthReturn, invitationPath, rememberInvitationAuthReturn, type InvitationAuthReturn } from './invitationJourney';
import { clearCloudStartupPointer } from './cloudWorkspaceCache';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured' | 'offline';
const SESSION_EXPIRY_SAFETY_WINDOW_SECONDS = 30;
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
  if (!session?.access_token?.trim()) {
    return false;
  }

  if (!session.expires_at) {
    return true;
  }

  return session.expires_at > (Date.now() / 1000) + SESSION_EXPIRY_SAFETY_WINDOW_SECONDS;
};

export const resolveActiveSession = async (): Promise<Session | null> => {
  if (!supabase) {
    return null;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  if (isSessionUsable(sessionData.session)) {
    return sessionData.session;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    if (isAuthRetryableFetchError(refreshError)) throw refreshError;
    return null;
  }

  return isSessionUsable(refreshedData.session) ? refreshedData.session : null;
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
    let timer: ReturnType<typeof setTimeout> | undefined;

    const syncSession = async (nextSession?: Session | null) => {
      const request = ++generation;
      try {
        const localSession = nextSession ?? knownSession.current;
        if (navigator.onLine === false && !isSessionUsable(localSession)) {
          setStatus(knownSession.current ? 'authenticated' : 'offline');
          return;
        }
        const resolvedSession = isSessionUsable(localSession)
          ? localSession
          : await resolveActiveSession();

        if (!isMounted || request !== generation) {
          return;
        }

        knownSession.current = resolvedSession;
        if (!resolvedSession) clearCloudStartupPointer();
        setSession(resolvedSession);
        setStatus(resolvedSession ? 'authenticated' : 'unauthenticated');
      } catch (error) {
        if (!isMounted || request !== generation) {
          return;
        }

        const networkError = navigator.onLine === false || isAuthRetryableFetchError(error) || error instanceof TypeError;
        if (networkError && knownSession.current) return;
        knownSession.current = null;
        setSession(null);
        setStatus(networkError ? 'offline' : 'unauthenticated');
      }
    };

    void syncSession();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        generation += 1;
        clearTimeout(timer);
        clearCloudStartupPointer();
        knownSession.current = null;
        setSession(null);
        setStatus('unauthenticated');
        return;
      }
      // Supabase holds its auth lock while invoking this callback. Resolve or
      // refresh only after returning, so a weak connection cannot deadlock it.
      clearTimeout(timer);
      timer = setTimeout(() => { void syncSession(nextSession); }, 0);
    });
    const reconnect = () => { void syncSession(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);

    return () => {
      isMounted = false;
      generation += 1;
      clearTimeout(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
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
