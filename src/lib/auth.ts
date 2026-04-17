import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthenticatedUser } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured';
const SESSION_EXPIRY_SAFETY_WINDOW_SECONDS = 30;

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

const buildAppUrl = (path: string) => (
  new URL(`${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, '/'), window.location.origin).toString()
);

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
    return null;
  }

  return isSessionUsable(refreshedData.session) ? refreshedData.session : null;
};

export const useSupabaseAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }

    let isMounted = true;

    const syncSession = async (nextSession?: Session | null) => {
      try {
        const resolvedSession = isSessionUsable(nextSession ?? null)
          ? nextSession ?? null
          : await resolveActiveSession();

        if (!isMounted) {
          return;
        }

        setSession(resolvedSession);
        setStatus(resolvedSession ? 'authenticated' : 'unauthenticated');
      } catch {
        if (!isMounted) {
          return;
        }

        setSession(null);
        setStatus('unauthenticated');
      }
    };

    void syncSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const user = useMemo(() => mapSessionUser(session), [session]);

  const signInWithGoogle = async () => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const redirectTo = buildAppUrl('auth/callback');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo
      }
    });

    if (error) {
      throw error;
    }
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  };

  return {
    session,
    user,
    status,
    isConfigured: hasSupabaseConfig,
    signInWithGoogle,
    signOut
  };
};
