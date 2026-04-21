import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChordSheet from '../components/ChordSheet';
import { APP_NAME } from '../constants/appMeta';
import { AppLanguage, SharedResourcePayload } from '../types';
import { signInWithGoogleRedirect } from '../lib/auth';
import { resolveShareLink } from '../lib/sharing';
import { supabase } from '../lib/supabase';

export default function SharedChartPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const [payload, setPayload] = useState<SharedResourcePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadSharedResource = async () => {
      try {
        setIsLoading(true);
        const response = await resolveShareLink(token);
        if (!isCancelled) {
          setPayload(response);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load shared chart.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    if (token) {
      void loadSharedResource();
      return;
    }

    setIsLoading(false);
    setErrorMessage('Missing share token.');

    return () => {
      isCancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!supabase || !authUserId || !payload?.setlist) return;

    supabase
      .from('user_setlist_memberships')
      .select('setlist_id')
      .eq('user_id', authUserId)
      .eq('setlist_id', payload.setlist.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsMember(Boolean(data));
      });
  }, [authUserId, payload?.setlist?.id]);

  const handleImport = async () => {
    if (!supabase || !token) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Please sign in first.');
      }

      const { data, error } = await supabase.rpc('join_shared_setlist', { p_token: token });
      if (error) throw error;
      const setlistId = typeof data === 'string' ? data : payload?.setlist?.id;
      navigate(setlistId ? `/?setlist=${encodeURIComponent(setlistId)}` : '/');
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      setJoinError(
        reason
          ? (language === 'zh' ? `無法導入歌單：${reason}` : `Unable to import setlist: ${reason}`)
          : (language === 'zh' ? '無法導入歌單，請稍後再試。' : 'Unable to import setlist. Please try again.')
      );
      setIsJoining(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setJoinError(null);
    try {
      await signInWithGoogleRedirect(`/share/${token}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      setJoinError(
        reason
          ? (language === 'zh' ? `無法登入：${reason}` : `Unable to sign in: ${reason}`)
          : (language === 'zh' ? '無法登入，請稍後再試。' : 'Unable to sign in. Please try again.')
      );
      setIsSigningIn(false);
    }
  };

  const isSongShare = !isLoading && !errorMessage && Boolean(payload?.song);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_transparent_36%),linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className={`mx-auto ${isSongShare ? 'max-w-6xl' : 'max-w-md'}`}>
        <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-6 shadow-[0_25px_80px_rgba(28,25,23,0.08)] backdrop-blur">

          {/* Header bar */}
          <div className="mb-6 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{APP_NAME}</div>
            <div className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 p-0.5 text-xs font-bold text-stone-500">
              <button
                type="button"
                onClick={() => setLanguage('zh')}
                className={`rounded-full px-2.5 py-1 transition-colors ${language === 'zh' ? 'bg-stone-900 text-white' : ''}`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-full px-2.5 py-1 transition-colors ${language === 'en' ? 'bg-stone-900 text-white' : ''}`}
              >
                EN
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-stone-400">
              {language === 'zh' ? '載入中...' : 'Loading...'}
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center text-sm font-medium text-rose-700">
              {errorMessage}
            </div>
          ) : payload?.setlist ? (
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {language === 'zh' ? '歌單' : 'Setlist'}
              </div>
              <h1 className="mb-5 text-2xl font-bold tracking-tight text-stone-900">
                {payload.setlist.name}
              </h1>

              <div className="mb-6 overflow-hidden rounded-xl border border-stone-100 bg-stone-50 divide-y divide-stone-100">
                {payload.setlist.songs.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 shrink-0 text-right text-xs font-bold text-stone-400">{index + 1}</span>
                    <span className="text-sm font-semibold text-stone-800">{item.title}</span>
                  </div>
                ))}
              </div>

              {authUserId ? (
                isMember ? (
                  <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-4 text-center">
                    <div className="text-sm font-semibold text-green-700">
                      {language === 'zh' ? '✓ 已在你的帳號中' : '✓ Already in your account'}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/?setlist=${encodeURIComponent(payload.setlist.id)}`)}
                      className="mt-3 inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-800"
                    >
                      {language === 'zh' ? '打開歌單' : 'Open Setlist'}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleImport()}
                      disabled={isJoining}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isJoining
                        ? (language === 'zh' ? '導入中...' : 'Importing...')
                        : (language === 'zh' ? '導入到我的帳號' : 'Import to My Account')}
                    </button>
                    {joinError && (
                      <p className="mt-2 text-center text-xs text-rose-600">{joinError}</p>
                    )}
                  </>
                )
              ) : (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4 text-center">
                  <p className="mb-3 text-sm text-stone-500">
                    {language === 'zh' ? '登入後即可導入此歌單' : 'Sign in to import this setlist'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSignIn()}
                    disabled={isSigningIn}
                    className="inline-block rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-stone-700 disabled:opacity-60"
                  >
                    {isSigningIn
                      ? (language === 'zh' ? '登入中...' : 'Signing in...')
                      : (language === 'zh' ? '前往登入' : 'Sign In')}
                  </button>
                  {joinError && (
                    <p className="mt-2 text-center text-xs text-rose-600">{joinError}</p>
                  )}
                </div>
              )}
            </>
          ) : payload?.song ? (
            <>
              <h1 className="mb-6 text-3xl font-bold tracking-tight text-stone-900">
                {payload.song.title}
              </h1>
              <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                <ChordSheet
                  song={payload.song.song}
                  language={language}
                  currentKey={payload.song.song.currentKey}
                  previewIdentity={payload.song.id}
                />
              </div>
            </>
          ) : null}

        </div>
      </div>
    </div>
  );
}
