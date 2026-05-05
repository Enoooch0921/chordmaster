import { Key, SongReference, SongReferences } from '../types';

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeVideoId(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0];
      return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const watchId = parsed.searchParams.get('v');
      if (watchId && YOUTUBE_ID_PATTERN.test(watchId)) {
        return watchId;
      }

      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === 'embed' || part === 'shorts');
      const candidate = embedIndex >= 0 ? parts[embedIndex + 1] : null;
      return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1'
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function normalizeReferenceBpm(bpm: unknown): number | undefined {
  if (bpm === '' || bpm === null || bpm === undefined) return undefined;
  const numericBpm = typeof bpm === 'number' ? bpm : Number(bpm);
  if (!Number.isFinite(numericBpm)) return undefined;
  return Math.min(400, Math.max(20, Math.round(numericBpm)));
}

export function normalizeSongReference(reference: unknown, validKeys: Set<string>): SongReference | undefined {
  if (!reference || typeof reference !== 'object') return undefined;

  const raw = reference as Partial<SongReference> & Record<string, unknown>;
  const normalized: SongReference = {};

  if (typeof raw.url === 'string') {
    normalized.url = raw.url;
  }

  if (typeof raw.key === 'string' && validKeys.has(raw.key)) {
    normalized.key = raw.key as Key;
  }

  normalized.bpm = normalizeReferenceBpm(raw.bpm);

  return normalized.url || normalized.key || typeof normalized.bpm === 'number'
    ? normalized
    : undefined;
}

export function normalizeSongReferences(value: unknown, validKeys: Set<string>): SongReferences | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const raw = value as Partial<SongReferences> & Record<string, unknown>;
  const band = normalizeSongReference(raw.band, validKeys);
  const vocal = normalizeSongReference(raw.vocal, validKeys);

  return band || vocal ? { band, vocal } : undefined;
}

export function hasPlayableReference(reference: SongReference | undefined): boolean {
  return Boolean(parseYouTubeVideoId(reference?.url));
}
