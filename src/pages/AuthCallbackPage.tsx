import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const finalizeAuth = async () => {
      if (!supabase) {
        setErrorMessage('Supabase is not configured.');
        return;
      }

      const url = new URL(window.location.href);
      const authError = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (authError) {
        if (!isCancelled) {
          setErrorMessage(authError);
        }
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (!isCancelled) {
          setErrorMessage(error.message);
        }
        return;
      }

      if (!isCancelled && data.session) {
        navigate('/', { replace: true });
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (isCancelled) {
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        navigate('/', { replace: true });
      }
    });

    void finalizeAuth();

    return () => {
      isCancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Signing you in</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {errorMessage ?? 'Please wait while ChordMaster finishes the authentication flow.'}
        </p>
      </div>
    </div>
  );
}
