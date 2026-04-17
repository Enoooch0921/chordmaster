import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ChordSheet from '../components/ChordSheet';
import { APP_NAME } from '../constants/appMeta';
import { AppLanguage, SharedResourcePayload } from '../types';
import { resolveShareLink } from '../lib/sharing';
import { applySetlistSongOverrides } from '../utils/setlistUtils';

export default function SharedChartPage() {
  const { token = '' } = useParams();
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const [payload, setPayload] = useState<SharedResourcePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const sharedSetlistSongs = useMemo(() => {
    if (!payload?.setlist) {
      return [];
    }

    return payload.setlist.songs.map((item) => ({
      ...item,
      song: applySetlistSongOverrides(item.song, {
        id: payload.setlist!.id,
        name: payload.setlist!.name,
        displayMode: payload.setlist!.displayMode,
        showLyrics: payload.setlist!.showLyrics,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        songs: []
      }, {
        id: item.id,
        setlistId: payload.setlist!.id,
        songId: item.id,
        order: 0,
        sectionOrder: item.song.sections.map((section) => section.id || ''),
        songData: item.song
      })
    }));
  }, [payload]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_transparent_36%),linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-6 shadow-[0_25px_80px_rgba(28,25,23,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-400">{APP_NAME}</div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
                {payload?.song?.title ?? payload?.setlist?.name ?? 'Shared chart'}
              </h1>
            </div>
            <div className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 p-1 text-xs font-bold text-stone-500">
              <button
                type="button"
                onClick={() => setLanguage('zh')}
                className={`rounded-full px-3 py-1 transition-colors ${language === 'zh' ? 'bg-stone-900 text-white' : ''}`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-full px-3 py-1 transition-colors ${language === 'en' ? 'bg-stone-900 text-white' : ''}`}
              >
                EN
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center text-sm font-medium text-stone-500">
              Loading shared chart...
            </div>
          ) : errorMessage ? (
            <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
              {errorMessage}
            </div>
          ) : payload?.song ? (
            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
              <ChordSheet
                song={payload.song.song}
                language={language}
                currentKey={payload.song.song.currentKey}
                previewIdentity={payload.song.id}
              />
            </div>
          ) : payload?.setlist ? (
            <div className="mt-8 space-y-6">
              {sharedSetlistSongs.map((item) => (
                <section key={item.id} className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-4 text-lg font-bold text-stone-900">{item.title}</div>
                  <ChordSheet
                    song={item.song}
                    language={language}
                    currentKey={item.song.currentKey}
                    previewIdentity={item.id}
                  />
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
