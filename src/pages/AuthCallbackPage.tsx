import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NATIVE_AUTH_NEXT_PATH_STORAGE_KEY, resolveActiveSession } from '../lib/auth';
import { safeAuthNextPath, takeInvitationAuthReturn } from '../lib/invitationJourney';
import { useInvitationTransition } from '../components/InvitationTransition';
import { supabase } from '../lib/supabase';
import { useThemeMode } from '../hooks/useThemeMode';

const getCallbackNextPath = (url: URL) => {
  const nextPath = url.searchParams.get('next');
  try {
    const storedNextPath = window.localStorage.getItem(NATIVE_AUTH_NEXT_PATH_STORAGE_KEY);
    window.localStorage.removeItem(NATIVE_AUTH_NEXT_PATH_STORAGE_KEY);
    return safeAuthNextPath(nextPath || storedNextPath);
  } catch { return safeAuthNextPath(nextPath); }
};

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  useThemeMode();
  const { resume, fail } = useInvitationTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nextPath = useRef<string | null>(null);
  const navigated = useRef(false);
  const completion = useRef<ReturnType<typeof resolveActiveSession> | null>(null);

  useLayoutEffect(() => {
    // Capture and consume once, including React StrictMode's effect replay.
    if (nextPath.current !== null) return;
    nextPath.current = getCallbackNextPath(new URL(window.location.href));
    const invitation = takeInvitationAuthReturn(nextPath.current);
    if (invitation) resume(invitation);
  }, [resume]);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      navigate(nextPath.current || '/', { replace: true });
    };
    const showError = (error: unknown) => {
      if (cancelled || navigated.current) return;
      const message = error instanceof Error ? error.message : '無法完成登入，請返回邀請後重試。';
      setErrorMessage(message); fail(message);
    };
    if (!supabase) { showError(new Error('登入服務尚未設定。')); return; }
    const url = new URL(window.location.href);
    const authError = url.searchParams.get('error_description') || url.searchParams.get('error');
    if (authError) { showError(new Error(authError)); return; }
    const client = supabase;
    // Exchange a single-use code only once; both auth events and the promise
    // use the same captured return path and navigation guard.
    if (!completion.current) completion.current = (async () => {
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      return resolveActiveSession();
    })();
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) finish();
    });
    void completion.current.then(session => {
      if (session) finish();
      else showError(new Error('無法完成登入，請返回後重試。'));
    }, showError);
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, [navigate, fail]);

  return <main className="invitation-page">
    <div className="invitation-sheet"><div className="invitation-body">
      <h1>{errorMessage ? '無法完成登入' : '正在登入 ChordMaster'}</h1>
      <p className="invitation-description" role={errorMessage ? 'alert' : 'status'}>{errorMessage || '正在確認帳號，完成後會自動返回。'}</p>
      {errorMessage && <button className="invitation-primary invitation-action" type="button" onClick={() => navigate(nextPath.current || '/', { replace: true })}>返回並重試</button>}
    </div></div>
  </main>;
}
