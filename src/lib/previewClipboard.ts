import { transposeChordSubdivisions, getChordEvents, chordEventLabel } from '../utils/chordSubdivisions';
import type { Bar, Key, Song } from '../types';
import { getTransposeOffset, transposeChord } from '../utils/musicUtils';
import {
  findSongBar, getBarsByIdentities, getBarStoredKey, getEffectiveTimeSignatureForBar, getStructuralTimeSignatureForBar,
  isBarCompletelyEmpty, pasteBarsAtBar, type SongBarIdentity
} from './songEditing';

export type PreviewClipboardKind = 'bars' | 'chords' | 'rhythm' | 'jianpu' | 'label' | 'annotation' | 'marker';
export interface PreviewClipboard {
  kind: PreviewClipboardKind;
  items: Array<{ bar: Bar; timeSignature: string; structuralTimeSignature?: string; key: Key; absoluteJianpu: boolean }>;
}

export function copyPreviewContent(song: Song, targets: SongBarIdentity[], kind: PreviewClipboardKind): PreviewClipboard | null {
  const items = getBarsByIdentities(song, targets).map(({ bar, target }) => ({
    bar: structuredClone(bar),
    timeSignature: getEffectiveTimeSignatureForBar(song, bar),
    structuralTimeSignature: getStructuralTimeSignatureForBar(song, bar),
    key: getBarStoredKey(song, target),
    absoluteJianpu: Boolean(song.jianpuInputAbsolute)
  }));
  return items.length ? { kind, items } : null;
}

const markerFields = ['leftMarker', 'rightMarker', 'leftText', 'rightText', 'repeatStart', 'repeatEnd', 'finalBar', 'ending'] as const;

export function previewClipboardText(clipboard: PreviewClipboard): string {
  return clipboard.items.map(({ bar, timeSignature }) => {
    const chordText = bar.chordSubdivisions?.length ? getChordEvents(bar, Number(timeSignature.split('/')[0]) || 4).map(e => `${chordEventLabel(e.beat,e.offset)}: ${e.chord}`).join(' · ') : bar.chords.join(' ');
    switch (clipboard.kind) {
      case 'bars': return `| ${chordText} |${bar.rhythm ? `\n${bar.rhythm}` : ''}${bar.riff ? `\n${bar.riff}` : ''}`;
      case 'chords': return chordText;
      case 'rhythm': return bar.rhythm ?? '';
      case 'jianpu': return bar.riff ?? '';
      case 'label': return bar.label ?? bar.rhythmLabel ?? bar.riffLabel ?? '';
      case 'annotation': return bar.annotation ?? '';
      case 'marker': return markerFields.map((key) => bar[key]).filter(Boolean).join(' ');
    }
  }).join('\n');
}

export type PreviewPasteError = 'missing-target' | 'count-mismatch' | 'time-signature' | 'jianpu-mode';
export interface PreviewPasteResult {
  song: Song;
  targets: SongBarIdentity[];
  error?: PreviewPasteError;
  inserted?: boolean;
}

// Build the destination and paste in a single history change. On failure,
// discard the temporary bars so a rejected paste never leaves empty measures.
export function appendPreviewContent(song: Song, sectionId: string, clipboard: PreviewClipboard): PreviewPasteResult {
  if (!song.sections.some((section) => section.id === sectionId) || !clipboard.items.length) {
    return { song, targets: [], error: 'missing-target' };
  }
  const blanks: Bar[] = Array.from({ length: clipboard.kind === 'bars' ? 1 : clipboard.items.length }, () => ({ id: crypto.randomUUID(), chords: [] }));
  const prepared = {
    ...song,
    sections: song.sections.map((section) => section.id === sectionId ? { ...section, bars: [...section.bars, ...blanks] } : section)
  };
  const result = pastePreviewContent(prepared, blanks.map((bar) => ({ sectionId, barId: bar.id! })), clipboard);
  return result.error ? { song, targets: [], error: result.error } : { ...result, inserted: true };
}

export function pastePreviewContent(song: Song, targets: SongBarIdentity[], clipboard: PreviewClipboard): PreviewPasteResult {
  const located = getBarsByIdentities(song, targets);
  const failure = (error: PreviewPasteError): PreviewPasteResult => ({ song, targets: [], error });
  if (!located.length || !clipboard.items.length) return failure('missing-target');

  if (clipboard.kind === 'bars') {
    if (clipboard.items.some((item) => item.bar.riff?.trim() && item.absoluteJianpu !== Boolean(song.jianpuInputAbsolute))) return failure('jianpu-mode');
    const destination = located[0];
    const mode = isBarCompletelyEmpty(destination.bar) ? 'replace-empty' : 'after';
    let meter = getStructuralTimeSignatureForBar(song, destination.bar);
    let key = getBarStoredKey(song, destination.target);
    const bars = clipboard.items.map((item) => {
      const bar = structuredClone(item.bar);
      if (bar.partialMeasure) {
        if ((item.structuralTimeSignature ?? item.timeSignature) !== meter) return null;
      } else if (item.timeSignature !== meter) {
        bar.timeSignature = item.timeSignature;
      }
      if (item.key !== key) bar.keyChangeTo = item.key;
      if (!bar.partialMeasure) meter = item.timeSignature;
      key = item.key;
      return bar;
    });
    if (bars.some((bar) => bar === null)) return failure('time-signature');
    const result = pasteBarsAtBar(song, destination.target, bars as Bar[], mode);
    // Preserve inherited meter/key at the copy boundary, including when a
    // copied modulation would otherwise alter the untouched following bars.
    const allTargets = song.sections.flatMap((section) => section.bars.flatMap((bar) => (
      section.id && bar.id ? [{ sectionId: section.id, barId: bar.id }] : []
    )));
    const nextTarget = allTargets[allTargets.findIndex((target) => target.sectionId === destination.target.sectionId && target.barId === destination.target.barId) + 1];
    const nextOriginal = nextTarget && findSongBar(song, nextTarget);
    const nextPasted = nextTarget && findSongBar(result.song, nextTarget);
    if (nextOriginal && nextPasted) {
      const nextMeter = getStructuralTimeSignatureForBar(song, nextOriginal.bar);
      const nextKey = getBarStoredKey(song, nextTarget);
      const restoreMeter = getStructuralTimeSignatureForBar(result.song, nextPasted.bar) !== nextMeter;
      const restoreKey = getBarStoredKey(result.song, nextTarget) !== nextKey;
      if (restoreMeter || restoreKey) {
        result.song = {
          ...result.song,
          sections: result.song.sections.map((section) => section.id !== nextTarget.sectionId ? section : {
            ...section,
            bars: section.bars.map((bar) => bar.id !== nextTarget.barId ? bar : {
              ...bar, ...(restoreMeter ? { timeSignature: nextMeter } : {}), ...(restoreKey ? { keyChangeTo: nextKey } : {})
            })
          })
        };
      }
    }
    return {
      song: result.song,
      targets: result.pastedBarIds.map((barId) => ({ sectionId: destination.target.sectionId, barId })),
      inserted: mode === 'after'
    };
  }

  if (clipboard.items.length !== 1 && clipboard.items.length !== located.length) return failure('count-mismatch');
  const patches = new Map<string, Bar>();
  for (const [index, destination] of located.entries()) {
    const source = clipboard.items[clipboard.items.length === 1 ? 0 : index];
    if (['chords', 'rhythm', 'jianpu'].includes(clipboard.kind)
      && source.timeSignature !== getEffectiveTimeSignatureForBar(song, destination.bar)) return failure('time-signature');
    if (clipboard.kind === 'jianpu' && source.absoluteJianpu !== Boolean(song.jianpuInputAbsolute)) return failure('jianpu-mode');
    const bar = { ...destination.bar };
    switch (clipboard.kind) {
      case 'chords': {
        const key = getBarStoredKey(song, destination.target);
        const offset = getTransposeOffset(source.key, key);
        bar.chords = source.bar.chords.map((chord) => offset ? transposeChord(chord, offset, key, false, source.key) : chord);
        bar.chordMarks = structuredClone(source.bar.chordMarks);
        bar.chordSubdivisions = transposeChordSubdivisions(source.bar.chordSubdivisions, offset, key, source.key);
        break;
      }
      case 'rhythm':
        bar.rhythm = source.bar.rhythm;
        bar.rhythmMark = structuredClone(source.bar.rhythmMark);
        break;
      case 'jianpu': bar.riff = source.bar.riff; break;
      case 'label':
        bar.label = source.bar.label;
        bar.labelLane = source.bar.labelLane;
        bar.rhythmLabel = source.bar.rhythmLabel;
        bar.riffLabel = source.bar.riffLabel;
        break;
      case 'annotation': bar.annotation = source.bar.annotation; break;
      case 'marker':
        for (const key of markerFields) delete bar[key];
        Object.assign(bar, Object.fromEntries(markerFields.filter((key) => source.bar[key] !== undefined).map((key) => [key, source.bar[key]])));
        break;
    }
    if (JSON.stringify(bar) !== JSON.stringify(destination.bar)) patches.set(`${destination.target.sectionId}\0${destination.target.barId}`, bar);
  }
  return {
    song: patches.size ? {
      ...song,
      sections: song.sections.map((section) => ({
        ...section,
        bars: section.bars.map((bar) => patches.get(`${section.id}\0${bar.id}`) ?? bar)
      }))
    } : song,
    targets: located.map(({ target }) => target)
  };
}
