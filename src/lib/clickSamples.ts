import regularClickUrl from '../assets/audio/ableton-classic/Metronome.wav?url';
import accentClickUrl from '../assets/audio/ableton-classic/MetronomeUp.wav?url';
import multitracksRegularUrl from '../assets/audio/multitracks-click/regular.wav?url';
import multitracksAccentUrl from '../assets/audio/multitracks-click/accent.wav?url';
import driveRegularUrl from '../assets/audio/drive-click/regular.wav?url';
import driveAccentUrl from '../assets/audio/drive-click/accent.wav?url';

export type ClickSamples = { regular: AudioBuffer; accent: AudioBuffer };
export type ClickSound = 'multitracks' | 'drive' | 'ableton-classic';
export const CLICK_SOUNDS: Record<ClickSound, string> = { multitracks: 'MultiTracks Click', drive: 'Drive Click', 'ableton-classic': 'Ableton Live Classic' };
const SAMPLE_URLS: Record<ClickSound, [string, string]> = {
  multitracks: [multitracksRegularUrl, multitracksAccentUrl],
  drive: [driveRegularUrl, driveAccentUrl],
  'ableton-classic': [regularClickUrl, accentClickUrl],
};
// Match regular/accent loudness separately to the original Ableton samples.
// Measured on 120 BPM click trains with EBU R128 K weighting; no EQ/limiting.
export const CLICK_SAMPLE_GAIN_DB: Record<ClickSound, { regular: number; accent: number }> = {
  'ableton-classic': { regular: 0, accent: 0 },
  multitracks: { regular: 1.3, accent: 6.3 },
  drive: { regular: -5.5, accent: -5.5 },
};
type Decoder = Pick<BaseAudioContext, 'decodeAudioData'>;
const bytes = new Map<string, Promise<ArrayBuffer>>();
const decoded = new Map<ClickSound, Promise<ClickSamples>>();
let warmup: Promise<void> | null = null;
const TIMEOUT_MS = 8000;

function decodeWithDeadline(context: Decoder, data: ArrayBuffer) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('click-decode-timeout')), TIMEOUT_MS);
    // decodeAudioData may detach the input; keep the cached bytes reusable.
    Promise.resolve().then(() => context.decodeAudioData(data.slice(0))).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
function fetchBytes(url: string) {
  let request = bytes.get(url);
  if (!request) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('click-fetch-timeout')); }, TIMEOUT_MS);
    });
    const download = Promise.resolve().then(() => fetch(url, { signal: controller.signal })).then(response => {
      if (!response.ok) throw new Error('click-samples-unavailable');
      return response.arrayBuffer();
    });
    request = Promise.race([download, timeout])
      .catch(error => { if (bytes.get(url) === request) bytes.delete(url); throw error; })
      .finally(() => clearTimeout(timer));
    bytes.set(url, request);
  }
  return request;
}
function balance(buffer: AudioBuffer, db: number) {
  if (db === 0) return buffer;
  const gain = 10 ** (db / 20);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let frame = 0; frame < data.length; frame++) data[frame] *= gain;
  }
  return buffer;
}

/** Shared decoded samples survive closing/rebuilding a playback context. */
export function loadClickSamples(context: Decoder, sound: ClickSound): Promise<ClickSamples> {
  let request = decoded.get(sound);
  if (!request) {
    const gains = CLICK_SAMPLE_GAIN_DB[sound];
    request = Promise.all(SAMPLE_URLS[sound].map(async (url, index) =>
      balance(await decodeWithDeadline(context, await fetchBytes(url)), index === 0 ? gains.regular : gains.accent)
    )).then(([regular, accent]) => ({ regular, accent }))
      .catch(error => { if (decoded.get(sound) === request) decoded.delete(sound); throw error; });
    decoded.set(sound, request);
  }
  return request;
}

/** Download/decode without starting audio, claiming a session, or blocking startup. */
export function preloadClickSounds(): Promise<void> {
  if (warmup) return warmup;
  warmup = (async () => {
    const Offline = window.OfflineAudioContext
      ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    let context: OfflineAudioContext | undefined;
    try { if (Offline) context = new Offline(1, 1, 48000); } catch { /* Fetch-only fallback. */ }
    const jobs = context
      ? (Object.keys(SAMPLE_URLS) as ClickSound[]).map(sound => loadClickSamples(context!, sound))
      : Object.values(SAMPLE_URLS).flat().map(fetchBytes);
    await Promise.allSettled(jobs);
  })().finally(() => { warmup = null; });
  return warmup;
}
