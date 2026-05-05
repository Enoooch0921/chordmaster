import React from 'react';
import { ExternalLink, Music2, Mic2, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { AppLanguage, Key, Song, SongReferenceKind } from '../types';
import { getTransposeOffset } from '../utils/musicUtils';
import { getYouTubeEmbedUrl, parseYouTubeVideoId } from '../utils/referenceUtils';

interface ReferencePlayerProps {
  song: Song;
  currentKey: Key;
  activeKind: SongReferenceKind;
  language: AppLanguage;
  onKindChange: (kind: SongReferenceKind) => void;
  onClose: () => void;
}

const FALLBACK_RATES = [0.5, 0.75, 1, 1.25];
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 2;

const TRANSPOSE_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/transpose-%E2%96%B2%E2%96%BC-%E9%9F%B3%E9%AB%98-%E2%96%B9-%E9%80%9F%E5%BA%A6-%E2%96%B9-%E5%BE%AA%E7%92%B0/ioimlbgefgadofblnajllknopjboejda';

const getYouTubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const getKindLabel = (kind: SongReferenceKind, language: AppLanguage) => (
  language === 'zh'
    ? kind === 'band' ? '樂團' : '歌手'
    : kind === 'band' ? 'Band' : 'Vocal'
);

const formatOffset = (fromKey: Key | undefined, toKey: Key) => {
  if (!fromKey) return '—';

  const rawOffset = getTransposeOffset(fromKey, toKey);
  const normalizedOffset = rawOffset > 6 ? rawOffset - 12 : rawOffset < -6 ? rawOffset + 12 : rawOffset;

  if (normalizedOffset === 0) return '0';
  return normalizedOffset > 0 ? `+${normalizedOffset}` : `${normalizedOffset}`;
};

const ReferencePlayer: React.FC<ReferencePlayerProps> = ({
  song,
  currentKey,
  activeKind,
  language,
  onKindChange,
  onClose
}) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const currentTimeRef = React.useRef(0);
  const lastTickRef = React.useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [loadedVideoId, setLoadedVideoId] = React.useState<string | null>(null);
  const [timedOutVideoId, setTimedOutVideoId] = React.useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [availableRates, setAvailableRates] = React.useState(FALLBACK_RATES);
  const activeReference = song.references?.[activeKind];
  const videoId = parseYouTubeVideoId(activeReference?.url);
  const isFrameLoaded = videoId !== null && loadedVideoId === videoId;
  const isFrameTimedOut = videoId !== null && timedOutVideoId === videoId && !isFrameLoaded;
  const referenceBpm = activeReference?.bpm ?? song.tempo;
  const effectiveBpm = typeof referenceBpm === 'number' ? Math.round(referenceBpm * playbackRate) : null;
  const practiceBpm = typeof referenceBpm === 'number'
    ? Math.max(20, Math.min(400, Math.round(referenceBpm * playbackRate)))
    : null;

  React.useEffect(() => {
    if (!videoId) return;

    setPlaybackRate(1);
    setIsPlaying(false);
    setAvailableRates(FALLBACK_RATES);
    currentTimeRef.current = 0;
    lastTickRef.current = null;
  }, [videoId]);

  React.useEffect(() => {
    if (!videoId || loadedVideoId === videoId || timedOutVideoId === videoId) return;
    const timer = window.setTimeout(() => setTimedOutVideoId(videoId), 8000);
    return () => window.clearTimeout(timer);
  }, [videoId, loadedVideoId, timedOutVideoId]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return;

      const data = typeof event.data === 'string'
        ? (() => {
            try {
              return JSON.parse(event.data) as { event?: string; info?: Record<string, unknown> };
            } catch {
              return null;
            }
          })()
        : event.data as { event?: string; info?: Record<string, unknown> } | null;

      if (data?.event !== 'infoDelivery' || !data.info) return;

      if (typeof data.info.currentTime === 'number') {
        currentTimeRef.current = data.info.currentTime;
      }

      if (typeof data.info.playerState === 'number') {
        setIsPlaying(data.info.playerState === 1);
      }

      if (Array.isArray(data.info.availablePlaybackRates)) {
        const rates = data.info.availablePlaybackRates.filter((rate): rate is number => typeof rate === 'number');
        if (rates.length > 0) {
          setAvailableRates(rates);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  React.useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    const timer = window.setInterval(() => {
      const now = performance.now();
      if (lastTickRef.current !== null) {
        currentTimeRef.current += ((now - lastTickRef.current) / 1000) * playbackRate;
      }
      lastTickRef.current = now;
    }, 250);

    return () => window.clearInterval(timer);
  }, [isPlaying, playbackRate]);

  const postYouTubeCommand = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args
    }), 'https://www.youtube.com');
  };

  const handleRateChange = (rate: number) => {
    const nextRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
    setPlaybackRate(nextRate);
    postYouTubeCommand('setPlaybackRate', [nextRate]);
  };

  const handlePracticeBpmChange = (deltaBpm: number) => {
    if (typeof referenceBpm !== 'number') return;

    const currentPracticeBpm = practiceBpm ?? referenceBpm;
    const nextPracticeBpm = Math.max(20, Math.min(400, currentPracticeBpm + deltaBpm));
    handleRateChange(nextPracticeBpm / referenceBpm);
  };

  const handleResetPracticeBpm = () => {
    handleRateChange(1);
  };

  const handleTogglePlayback = () => {
    if (isPlaying) {
      postYouTubeCommand('pauseVideo');
      setIsPlaying(false);
      return;
    }

    postYouTubeCommand('playVideo');
    setIsPlaying(true);
  };

  const handleSeekBy = (seconds: number) => {
    const nextTime = Math.max(0, currentTimeRef.current + seconds);
    currentTimeRef.current = nextTime;
    postYouTubeCommand('seekTo', [nextTime, true]);
  };

  if (!videoId) {
    return null;
  }

  const availableReferenceKinds = (['band', 'vocal'] as SongReferenceKind[])
    .filter((kind) => parseYouTubeVideoId(song.references?.[kind]?.url));
  const referenceLabel = language === 'zh' ? '參考音源' : 'Reference';

  return (
    <div className="fixed inset-x-0 bottom-0 z-[210] border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm sm:w-60">
          {!isFrameLoaded && !isFrameTimedOut && (
            <div className="absolute inset-0">
              <img
                src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                alt=""
                className="h-full w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/35">
                <div className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm">
                  {language === 'zh' ? '載入參考音源' : 'Loading Reference'}
                </div>
              </div>
            </div>
          )}
          {isFrameTimedOut && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-gray-950/90 p-3 text-center">
              <div className="text-[11px] font-bold leading-tight text-white">
                {language === 'zh' ? '無法載入 YouTube 播放器' : "Couldn't load YouTube"}
              </div>
              <div className="text-[10px] leading-snug text-white/70">
                {language === 'zh'
                  ? '可能被瀏覽器或外掛擋住，可改用 YouTube 直接播放'
                  : 'Browser or extension may be blocking the embed'}
              </div>
              <a
                href={getYouTubeWatchUrl(videoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md bg-white px-2.5 text-[10px] font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
              >
                <ExternalLink size={11} />
                <span>{language === 'zh' ? '在 YouTube 開啟' : 'Open on YouTube'}</span>
              </a>
            </div>
          )}
          <iframe
            ref={iframeRef}
            key={videoId}
            title={`${song.title} ${getKindLabel(activeKind, language)} Reference`}
            src={getYouTubeEmbedUrl(videoId)}
            className="relative h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => setLoadedVideoId(videoId)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                {activeKind === 'band' ? <Music2 size={13} /> : <Mic2 size={13} />}
                <span>{referenceLabel}</span>
              </div>
              <div className="mt-0.5 truncate text-sm font-bold text-gray-900">
                {song.title || (language === 'zh' ? '未命名歌曲' : 'Untitled Song')} · {getKindLabel(activeKind, language)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                {availableReferenceKinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onKindChange(kind)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                      kind === activeKind
                        ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border border-transparent text-gray-600 hover:bg-gray-50 hover:text-indigo-700'
                    }`}
                  >
                    {kind === 'band' ? <Music2 size={13} /> : <Mic2 size={13} />}
                    <span>{getKindLabel(kind, language)}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                aria-label={language === 'zh' ? '關閉 Reference' : 'Close Reference'}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-grid grid-cols-[auto_auto_auto] items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <div className="flex items-center gap-1">
                {[-10, -5].map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => handleSeekBy(seconds)}
                    className="inline-flex h-9 min-w-12 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    title={language === 'zh' ? `倒退 ${Math.abs(seconds)} 秒` : `Back ${Math.abs(seconds)} seconds`}
                  >
                    <RotateCcw size={13} />
                    <span>{Math.abs(seconds)}s</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleTogglePlayback}
                className="inline-flex h-10 w-12 items-center justify-center rounded-lg bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800"
                aria-label={language === 'zh' ? isPlaying ? '暫停' : '播放' : isPlaying ? 'Pause' : 'Play'}
                title={language === 'zh' ? isPlaying ? '暫停' : '播放' : isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} />}
              </button>

              <div className="flex items-center gap-1">
                {[5, 10].map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => handleSeekBy(seconds)}
                    className="inline-flex h-9 min-w-12 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    title={language === 'zh' ? `前進 ${seconds} 秒` : `Forward ${seconds} seconds`}
                  >
                    <span>{seconds}s</span>
                    <RotateCw size={13} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {typeof referenceBpm === 'number' ? (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                {[-10, -5, -1].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => handlePracticeBpmChange(delta)}
                    className="h-7 rounded-md px-2 text-[11px] font-bold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    {delta}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleResetPracticeBpm}
                  className={`h-7 rounded-md px-2 text-[11px] font-bold transition-colors ${
                    Math.abs(playbackRate - 1) < 0.01
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  title={language === 'zh' ? '回到原 BPM' : 'Reset to original BPM'}
                >
                  {language === 'zh' ? '原 BPM' : 'Original'}
                </button>
                {[1, 5, 10].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => handlePracticeBpmChange(delta)}
                    className="h-7 rounded-md px-2 text-[11px] font-bold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                {availableRates.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleRateChange(rate)}
                    className={`h-7 rounded-md px-2 text-[11px] font-bold transition-colors ${
                      Math.abs(playbackRate - rate) < 0.01
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-1.5 px-1 text-[10.5px] text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="leading-relaxed">
              {language === 'zh' ? (
                <>
                  💡 已安裝 Transpose？先點右側「在 YouTube 開啟」，再從瀏覽器工具列啟用插件；還沒安裝可{' '}
                  <a
                    href={TRANSPOSE_EXTENSION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-indigo-600 underline-offset-2 hover:underline"
                  >
                    安裝 Transpose
                  </a>
                  。
                </>
              ) : (
                <>
                  💡 Already have Transpose? Open this video on YouTube, then enable it from the browser toolbar. If not,{' '}
                  <a
                    href={TRANSPOSE_EXTENSION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-indigo-600 underline-offset-2 hover:underline"
                  >
                    install Transpose
                  </a>
                  .
                </>
              )}
            </div>
            <a
              href={getYouTubeWatchUrl(videoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3 text-[11px] font-bold text-gray-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 sm:self-auto"
              title={language === 'zh' ? '在 YouTube 中開啟此影片' : 'Open this video on YouTube'}
            >
              <ExternalLink size={12} />
              <span>{language === 'zh' ? '在 YouTube 開啟' : 'Open on YouTube'}</span>
            </a>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-gray-600 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
              <div className="text-gray-400">{language === 'zh' ? 'Reference 調' : 'Reference Key'}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">{activeReference?.key ?? '—'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
              <div className="text-gray-400">{language === 'zh' ? '目前譜面' : 'Chart Key'}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">{currentKey}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
              <div className="text-gray-400">{language === 'zh' ? '相差半音' : 'Offset'}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">{formatOffset(activeReference?.key, currentKey)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
              <div className="text-gray-400">{language === 'zh' ? '練習 BPM' : 'Practice BPM'}</div>
              <div className="mt-0.5 text-sm font-bold text-gray-900">
                {typeof referenceBpm === 'number' && effectiveBpm !== null
                  ? `${effectiveBpm} BPM`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferencePlayer;
