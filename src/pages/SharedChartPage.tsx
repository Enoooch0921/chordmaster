import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChordSheet from '../components/ChordSheet';
import LyricsSheet from '../components/LyricsSheet';
import { APP_NAME } from '../constants/appMeta';
import {
  AppLanguage,
  SharedResourcePayload,
  SharedSetlistPayload,
  SharedSongImportInspection,
  SharedSongImportResult,
  SongImportResolution
} from '../types';
import { signInWithGoogleRedirect } from '../lib/auth';
import { importSharedSongs, inspectSharedSongImport, resolveShareLink } from '../lib/sharing';
import { supabase } from '../lib/supabase';

const WORKSPACE_MODE_STORAGE_KEY = 'chordmaster.workspace-mode.v1';
const SELECTED_SETLIST_STORAGE_KEY = 'chordmaster.selected-setlist-id.v1';
const SELECTED_SETLIST_SONG_STORAGE_KEY = 'chordmaster.selected-setlist-song-id.v1';

type SharedSetlistSong = SharedSetlistPayload['songs'][number];

const getSharedSongMeta = (item: SharedSetlistSong) => {
  const key = item.overrideKey ?? item.song.currentKey;
  const tempo = typeof item.song.tempo === 'number' && Number.isFinite(item.song.tempo)
    ? `${item.song.tempo} BPM`
    : null;
  return [key, tempo].filter(Boolean).join(' · ');
};

const SharedSetlistSongRow = ({
  item,
  index,
  language
}: {
  key?: string;
  item: SharedSetlistSong;
  index: number;
  language: AppLanguage;
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <span className="w-5 shrink-0 text-right text-xs font-bold text-stone-400">{index + 1}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-stone-800">{item.title}</span>
      <span className="mt-0.5 block text-xs font-semibold text-stone-500">
        {getSharedSongMeta(item)}
      </span>
    </span>
    {item.archivedAt ? (
      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
        {language === 'zh' ? '已封存' : 'Archived'}
      </span>
    ) : null}
  </div>
);

const rememberSetlistLanding = (setlistId: string, firstSetlistSongId?: string | null) => {
  try {
    window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, 'setlists');
    window.localStorage.setItem(SELECTED_SETLIST_STORAGE_KEY, setlistId);
    if (firstSetlistSongId) {
      window.localStorage.setItem(SELECTED_SETLIST_SONG_STORAGE_KEY, firstSetlistSongId);
    } else {
      window.localStorage.removeItem(SELECTED_SETLIST_SONG_STORAGE_KEY);
    }
  } catch {
    // Landing still works through the URL query even if storage is unavailable.
  }
};

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
  const [showSharedLyrics, setShowSharedLyrics] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedBundleSongId, setSelectedBundleSongId] = useState<string | null>(null);
  const [importInspection, setImportInspection] = useState<SharedSongImportInspection | null>(null);
  const [defaultImportResolution, setDefaultImportResolution] = useState<SongImportResolution>('duplicate');
  const [perSongResolutions, setPerSongResolutions] = useState<Record<string, SongImportResolution>>({});
  const [songImportResult, setSongImportResult] = useState<SharedSongImportResult | null>(null);

  // In-app browsers (LINE, Facebook, Instagram) block Google OAuth as "unsafe".
  // Detect them so we can prompt the user to open the page in a real browser.
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isLineBrowser = /\bLine\//i.test(userAgent);
  const isInAppBrowser = isLineBrowser || /FBAN|FBAV|Instagram/i.test(userAgent);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard unavailable; the user can still copy the URL manually.
    }
  };

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
    const firstBundleSongId = payload?.songBundle?.songs[0]?.id ?? null;
    setSelectedBundleSongId((current) => (
      current && payload?.songBundle?.songs.some((item) => item.id === current)
        ? current
        : firstBundleSongId
    ));
    setShowSharedLyrics(false);
  }, [payload?.songBundle?.id]);

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

  useEffect(() => {
    if (!supabase || !authUserId || !payload?.project) return;

    supabase
      .from('user_project_memberships')
      .select('project_id')
      .eq('user_id', authUserId)
      .eq('project_id', payload.project.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsMember(Boolean(data));
      });
  }, [authUserId, payload?.project?.id]);

  const handleImport = async () => {
    if (!supabase || !token) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Please sign in first.');
      }

      const isProjectShare = Boolean(payload?.project);
      const rpcName = isProjectShare ? 'join_shared_project' : 'join_shared_setlist';

      // Right after sign-in the auth token isn't always attached to the very
      // first RPC call, so the first import can fail while a second succeeds.
      // Retry once after a short delay so a single tap is enough.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data, error } = await supabase.rpc(rpcName, { p_token: token });
        if (!error) {
          if (isProjectShare) {
            const projectId = typeof data === 'string' ? data : payload?.project?.id;
            navigate(projectId ? `/?project=${encodeURIComponent(projectId)}` : '/');
          } else {
            const setlistId = typeof data === 'string' ? data : payload?.setlist?.id;
            if (setlistId) {
              rememberSetlistLanding(setlistId, payload?.setlist?.songs[0]?.id ?? null);
            }
            navigate(setlistId ? `/?setlist=${encodeURIComponent(setlistId)}` : '/');
          }
          return;
        }
        lastError = error;
        if (attempt === 0) {
          await supabase.auth.getSession();
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
      throw lastError;
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      const resourceLabel = payload?.project
        ? (language === 'zh' ? '專案' : 'project')
        : (language === 'zh' ? '歌單' : 'setlist');
      setJoinError(
        reason
          ? (language === 'zh' ? `無法導入${resourceLabel}：${reason}` : `Unable to import ${resourceLabel}: ${reason}`)
          : (language === 'zh' ? `無法導入${resourceLabel}，請稍後再試。` : `Unable to import ${resourceLabel}. Please try again.`)
      );
      setIsJoining(false);
    }
  };

  const retryAfterFreshSession = async <T,>(operation: () => Promise<T>) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === 0 && supabase) {
          await supabase.auth.getSession();
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
    }
    throw lastError;
  };

  const completeSongImport = async (
    defaultResolution: SongImportResolution,
    resolutions: Record<string, SongImportResolution>
  ) => {
    setIsJoining(true);
    setJoinError(null);
    try {
      const result = await retryAfterFreshSession(() => (
        importSharedSongs(token, defaultResolution, resolutions)
      ));
      setSongImportResult(result);
      setImportInspection(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      setJoinError(
        reason
          ? (language === 'zh' ? `無法導入歌曲：${reason}` : `Unable to import songs: ${reason}`)
          : (language === 'zh' ? '無法導入歌曲，請稍後再試。' : 'Unable to import songs. Please try again.')
      );
    } finally {
      setIsJoining(false);
    }
  };

  const handleSongImport = async () => {
    if (!supabase || !token) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Please sign in first.');
      const inspection = await retryAfterFreshSession(() => inspectSharedSongImport(token));
      if (inspection.conflictCount > 0) {
        setDefaultImportResolution('duplicate');
        setPerSongResolutions({});
        setImportInspection(inspection);
        setIsJoining(false);
        return;
      }
      await completeSongImport('duplicate', {});
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      setJoinError(
        reason
          ? (language === 'zh' ? `無法檢查歌曲：${reason}` : `Unable to check songs: ${reason}`)
          : (language === 'zh' ? '無法檢查歌曲，請稍後再試。' : 'Unable to check songs. Please try again.')
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

  const isSongShare = !isLoading && !errorMessage && Boolean(payload?.song || payload?.songBundle);
  const selectedBundleSong = payload?.songBundle?.songs.find((item) => item.id === selectedBundleSongId)
    ?? payload?.songBundle?.songs[0]
    ?? null;
  const conflictingSongs = importInspection?.songs.filter((item) => item.existingSongId) ?? [];

  const renderSongImportControls = () => {
    if (songImportResult) {
      const firstSongId = songImportResult.songs[0]?.songId;
      return (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
          <div className="text-base font-black text-emerald-800">
            {language === 'zh' ? '歌曲已導入個人歌庫' : 'Songs imported to your personal library'}
          </div>
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            {language === 'zh'
              ? `新增 ${songImportResult.createdCount} 首、另存副本 ${songImportResult.duplicatedCount} 首、覆蓋 ${songImportResult.overwrittenCount} 首`
              : `${songImportResult.createdCount} added, ${songImportResult.duplicatedCount} duplicated, ${songImportResult.overwrittenCount} overwritten`}
          </p>
          {firstSongId && (
            <button
              type="button"
              onClick={() => navigate(`/?song=${encodeURIComponent(firstSongId)}`)}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800"
            >
              {language === 'zh' ? '打開我的歌庫' : 'Open My Library'}
            </button>
          )}
        </div>
      );
    }

    if (importInspection && conflictingSongs.length > 0) {
      return (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="text-base font-black text-amber-900">
            {language === 'zh' ? `發現 ${conflictingSongs.length} 首已導入歌曲` : `${conflictingSongs.length} previously imported song(s)`}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">
            {language === 'zh' ? '先選整批預設，再視需要逐首調整。' : 'Choose a default for the batch, then adjust individual songs if needed.'}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(['duplicate', 'overwrite'] as SongImportResolution[]).map((resolution) => (
              <button
                key={resolution}
                type="button"
                onClick={() => {
                  setDefaultImportResolution(resolution);
                  setPerSongResolutions({});
                }}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition-colors ${defaultImportResolution === resolution ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-amber-200 bg-white text-stone-700 hover:border-indigo-300'}`}
              >
                {resolution === 'duplicate'
                  ? (language === 'zh' ? '保留我的版本，另存新副本' : 'Keep mine and create a copy')
                  : (language === 'zh' ? '使用分享版本覆蓋' : 'Overwrite with shared version')}
              </button>
            ))}
          </div>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {conflictingSongs.map((item) => {
              const resolution = perSongResolutions[item.sourceSongId] ?? defaultImportResolution;
              return (
                <label key={item.sourceSongId} className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white px-3 py-3 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-800">{item.title}</span>
                  <select
                    value={resolution}
                    onChange={(event) => setPerSongResolutions((current) => ({
                      ...current,
                      [item.sourceSongId]: event.target.value as SongImportResolution
                    }))}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs font-bold text-stone-700"
                  >
                    <option value="duplicate">{language === 'zh' ? '另存新副本' : 'Create copy'}</option>
                    <option value="overwrite">{language === 'zh' ? '覆蓋既有歌曲' : 'Overwrite existing'}</option>
                  </select>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setImportInspection(null)} className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600">
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void completeSongImport(defaultImportResolution, perSongResolutions)}
              disabled={isJoining}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {isJoining ? (language === 'zh' ? '導入中...' : 'Importing...') : (language === 'zh' ? '確認並導入' : 'Confirm Import')}
            </button>
          </div>
          {joinError && <p className="mt-3 text-center text-xs text-rose-600">{joinError}</p>}
        </div>
      );
    }

    if (authUserId) {
      return (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void handleSongImport()}
            disabled={isJoining}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 sm:w-auto sm:min-w-64"
          >
            {isJoining
              ? (language === 'zh' ? '檢查中...' : 'Checking...')
              : (language === 'zh' ? '導入到我的個人歌庫' : 'Import to My Personal Library')}
          </button>
          {joinError && <p className="mt-2 text-center text-xs text-rose-600">{joinError}</p>}
        </div>
      );
    }

    return (
      <div className="mt-6 rounded-xl border border-stone-100 bg-stone-50 px-4 py-4 text-center">
        <p className="mb-3 text-sm text-stone-500">
          {language === 'zh' ? '登入後即可導入到你的個人歌庫' : 'Sign in to import these songs to your personal library'}
        </p>
        <button type="button" onClick={() => void handleSignIn()} disabled={isSigningIn} className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {isSigningIn ? (language === 'zh' ? '登入中...' : 'Signing in...') : (language === 'zh' ? '前往登入' : 'Sign In')}
        </button>
        {joinError && <p className="mt-2 text-center text-xs text-rose-600">{joinError}</p>}
      </div>
    );
  };

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

          {isInAppBrowser && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-sm font-bold text-amber-800">
                {language === 'zh' ? '請用系統瀏覽器開啟' : 'Open in your browser'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-amber-700">
                {language === 'zh'
                  ? (isLineBrowser
                      ? '偵測到你正在 LINE 內建瀏覽器開啟，Google 登入會被視為不安全而失敗。請點右上角「⋯」選單 →「用其他瀏覽器開啟」，或複製連結到 Safari／Chrome 開啟。'
                      : '偵測到你正在 App 內建瀏覽器開啟，Google 登入可能會失敗。請複製連結到 Safari／Chrome 等系統瀏覽器開啟。')
                  : (isLineBrowser
                      ? 'You are in LINE’s in-app browser, which blocks Google sign-in. Tap the “⋯” menu → “Open in other browser”, or copy the link into Safari/Chrome.'
                      : 'You are in an in-app browser that can block Google sign-in. Copy the link and open it in Safari/Chrome.')}
              </p>
              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="mt-2 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
              >
                {linkCopied
                  ? (language === 'zh' ? '已複製連結 ✓' : 'Link copied ✓')
                  : (language === 'zh' ? '複製連結' : 'Copy link')}
              </button>
            </div>
          )}

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
                  <SharedSetlistSongRow key={item.id} item={item} index={index} language={language} />
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
                      onClick={() => {
                        rememberSetlistLanding(payload.setlist!.id, payload.setlist!.songs[0]?.id ?? null);
                        navigate(`/?setlist=${encodeURIComponent(payload.setlist!.id)}`);
                      }}
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
          ) : payload?.project ? (
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {language === 'zh' ? '專案' : 'Project'}
              </div>
              <h1 className="mb-5 text-2xl font-bold tracking-tight text-stone-900">
                {payload.project.name}
              </h1>

              <div className="mb-6 space-y-3">
                {payload.project.setlists.length === 0 ? (
                  <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-center text-sm text-stone-500">
                    {language === 'zh' ? '這個專案目前沒有歌單。' : 'This project has no setlists yet.'}
                  </div>
                ) : (
                  payload.project.setlists.map((sl) => (
                    <div key={sl.id} className="rounded-xl border border-stone-100 bg-stone-50">
                      <div className="border-b border-stone-100 px-4 py-2 text-sm font-bold text-stone-800">
                        {sl.name}
                      </div>
                      {sl.songs.length === 0 ? (
                        <div className="px-4 py-2 text-xs text-stone-400">
                          {language === 'zh' ? '無歌曲' : 'No songs'}
                        </div>
                      ) : (
                        <div className="divide-y divide-stone-100">
                          {sl.songs.map((item, index) => (
                            <SharedSetlistSongRow key={item.id} item={item} index={index} language={language} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {authUserId ? (
                isMember ? (
                  <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-4 text-center">
                    <div className="text-sm font-semibold text-green-700">
                      {language === 'zh' ? '✓ 已在你的帳號中' : '✓ Already in your account'}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/?project=${encodeURIComponent(payload.project!.id)}`)}
                      className="mt-3 inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-800"
                    >
                      {language === 'zh' ? '打開專案' : 'Open Project'}
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
                        : (language === 'zh' ? '加入專案' : 'Join Project')}
                    </button>
                    {joinError && (
                      <p className="mt-2 text-center text-xs text-rose-600">{joinError}</p>
                    )}
                  </>
                )
              ) : (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-4 text-center">
                  <p className="mb-3 text-sm text-stone-500">
                    {language === 'zh' ? '登入後即可加入此專案' : 'Sign in to join this project'}
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
          ) : payload?.songBundle && selectedBundleSong ? (
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {language === 'zh' ? '歌曲分享' : 'Shared Songs'}
              </div>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-stone-900">
                    {language === 'zh' ? `${payload.songBundle.songs.length} 首歌曲` : `${payload.songBundle.songs.length} Songs`}
                  </h1>
                  <p className="mt-1 text-sm text-stone-500">
                    {language === 'zh' ? '點選歌曲即可先預覽，再一次導入全部。' : 'Select a song to preview, then import the whole bundle.'}
                  </p>
                </div>
                {(selectedBundleSong.song.lyricsDoc?.chinese?.trim() || selectedBundleSong.song.lyricsDoc?.english?.trim()) ? (
                  <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm font-semibold shadow-sm">
                    <button type="button" onClick={() => setShowSharedLyrics(false)} className={`rounded-lg px-3 py-1.5 ${!showSharedLyrics ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>
                      {language === 'zh' ? '和弦譜' : 'Chart'}
                    </button>
                    <button type="button" onClick={() => setShowSharedLyrics(true)} className={`rounded-lg px-3 py-1.5 ${showSharedLyrics ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>
                      {language === 'zh' ? '歌詞' : 'Lyrics'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-2">
                  {payload.songBundle.songs.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedBundleSongId(item.id);
                        setShowSharedLyrics(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${item.id === selectedBundleSong.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-stone-800 hover:bg-indigo-50'}`}
                    >
                      <span className={`w-5 shrink-0 text-right text-xs font-black ${item.id === selectedBundleSong.id ? 'text-indigo-200' : 'text-stone-400'}`}>{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</span>
                    </button>
                  ))}
                </div>
                <div className="min-w-0">
                  <h2 className="mb-3 text-xl font-black text-stone-900">{selectedBundleSong.title}</h2>
                  <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                    {showSharedLyrics ? (
                      <LyricsSheet song={selectedBundleSong.song} language={language} />
                    ) : (
                      <ChordSheet
                        song={selectedBundleSong.song}
                        language={language}
                        currentKey={selectedBundleSong.song.currentKey}
                        previewIdentity={selectedBundleSong.id}
                      />
                    )}
                  </div>
                </div>
              </div>
              {renderSongImportControls()}
            </>
          ) : payload?.song ? (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-stone-900">
                  {payload.song.title}
                </h1>
                {(payload.song.song.lyricsDoc?.chinese?.trim() || payload.song.song.lyricsDoc?.english?.trim()) ? (
                  <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm font-semibold shadow-sm">
                    <button
                      type="button"
                      onClick={() => setShowSharedLyrics(false)}
                      className={`rounded-lg px-3 py-1.5 transition-colors ${!showSharedLyrics ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      {language === 'zh' ? '和弦譜' : 'Chart'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSharedLyrics(true)}
                      className={`rounded-lg px-3 py-1.5 transition-colors ${showSharedLyrics ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      {language === 'zh' ? '歌詞' : 'Lyrics'}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                {showSharedLyrics ? (
                  <LyricsSheet song={payload.song.song} language={language} />
                ) : (
                  <ChordSheet
                    song={payload.song.song}
                    language={language}
                    currentKey={payload.song.song.currentKey}
                    previewIdentity={payload.song.id}
                  />
                )}
              </div>
              {renderSongImportControls()}
            </>
          ) : null}

        </div>
      </div>
    </div>
  );
}
