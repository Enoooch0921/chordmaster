import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthenticatedUser } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured';

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

export const useSupabaseAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
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
