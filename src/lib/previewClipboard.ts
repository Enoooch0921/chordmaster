import { hasUnmeteredChords, unmeteredChordText, transposeUnmeteredChordLines } from '../utils/unmeteredChords';
import { getChordPassEvents, transposeChordPassVariants } from '../utils/chordPassVariants';
import { transposeChordSubdivisions, getChordEvents, chordEventLabel } from '../utils/chordSubdivisions';
import type { Bar, Key, Song } from '../types';
import { getTransposeOffset, transposeChord } from '../utils/musicUtils';
import {
  getBarsByIdentities, getBarStoredKey, getEffectiveTimeSignatureForBar, getStructuralTimeSignatureForBar,
  getSongKeyStates, getSongTimeSignatureStates, type SongBarIdentity
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

const markerFields = ['leftMarker', 'rightMarker', 'leftText', 'rightText', 'repeatStart', 'repeatEnd', 'doubleBar', 'doubleBarStart', 'finalBar', 'ending'] as const;

export function previewClipboardText(clipboard: PreviewClipboard): string {
  return clipboard.items.map(({ bar, timeSignature }) => {
    const chordText = hasUnmeteredChords(bar) ? unmeteredChordText(bar.unmeteredChordLines!) : !bar.chordTimingUnspecified && bar.chordSubdivisions?.length ? getChordEvents(bar, Number(timeSignature.split('/')[0]) || 4).map(e => `${chordEventLabel(e.beat,e.offset)}: ${e.chord}`).join(' · ') : bar.chords.join(' ');
    const alternatives = (bar.chordPassVariants ?? []).map(variant => `Pass ${variant.pass}: ${bar.chordTimingUnspecified ? variant.chords.join(' ') : getChordPassEvents(bar, Number(timeSignature.split('/')[0]) || 4, variant.pass).map(e => `${chordEventLabel(e.beat, e.offset)}: ${e.chord}`).join(' · ')}`).join('\n');
    const allChordText = alternatives ? `${chordText}\n${alternatives}` : chordText;
    switch (clipboard.kind) {
      case 'bars': return `${hasUnmeteredChords(bar) ? allChordText : `| ${allChordText} |`}${bar.rhythm ? `\n${bar.rhythm}` : ''}${bar.riff ? `\n${bar.riff}` : ''}`;
      case 'chords': return allChordText;
      case 'rhythm': return bar.rhythm ?? '';
      case 'jianpu': return bar.riff ?? '';
      case 'label': return bar.label ?? bar.rhythmLabel ?? bar.riffLabel ?? '';
      case 'annotation': return bar.annotation ?? '';
      case 'marker': return markerFields.map((key) => bar[key]).filter(Boolean).join(' ');
    }
  }).join('\n');
}

export type PreviewPasteError = 'missing-target' | 'count-mismatch' | 'time-signature' | 'jianpu-mode' | 'unmetered-content';
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
    if (located.length > 1 && clipboard.items.length !== 1 && clipboard.items.length !== located.length) return failure('count-mismatch');
    const first = located[0];
    // A single destination is the start of an overwrite range. Extend only
    // its own section when the copied range runs past its final measure.
    const missing = located.length === 1
      ? Math.max(0, clipboard.items.length - (first.section.bars.length - first.barIndex)) : 0;
    const blanks: Bar[] = Array.from({ length: missing }, () => ({ id: crypto.randomUUID(), chords: [] }));
    const preparedSections = song.sections.map((section, index) => index === first.sectionIndex && missing
      ? { ...section, bars: [...section.bars, ...blanks] } : section);
    const destinations = located.length > 1 ? located.map(({ target }) => target)
      : preparedSections[first.sectionIndex].bars.slice(first.barIndex, first.barIndex + clipboard.items.length)
        .map((bar) => ({ sectionId: first.target.sectionId, barId: bar.id! }));
    const identity = (target: SongBarIdentity) => `${target.sectionId}\0${target.barId}`;
    const replacements = new Map(destinations.map((target, index) => [identity(target), clipboard.items[clipboard.items.length === 1 ? 0 : index]]));
    const meters = getSongTimeSignatureStates(song);
    const keys = getSongKeyStates(song);
    let meter = meters.sectionBaseTimeSignatures[0] ?? song.timeSignature;
    let key = song.originalKey;
    let incompatibleMeter = false;
    const sections = preparedSections.map((section, sectionIndex) => {
      if (section.keyChangeTo) key = section.keyChangeTo;
      const bars = section.bars.map((original, barIndex) => {
        const source = replacements.get(identity({ sectionId: section.id!, barId: original.id! }));
        let bar = source ? { ...structuredClone(source.bar), id: original.id } : original;
        if (source) {
          if (bar.partialMeasure) {
            if ((source.structuralTimeSignature ?? source.timeSignature) !== meter) incompatibleMeter = true;
          } else if (source.timeSignature !== meter) bar.timeSignature = source.timeSignature;
          if (!bar.chordKeyUnspecified && source.key !== key) bar.keyChangeTo = source.key;
        } else {
          // Restore inherited context after every overwritten range, including
          // non-contiguous selections and the next section's first measure.
          const expectedMeter = meters.barActiveTimeSignatures[sectionIndex][barIndex];
          if (bar.partialMeasure) {
            if (meter !== meters.barBaseTimeSignatures[sectionIndex][barIndex]) incompatibleMeter = true;
          } else if ((bar.timeSignature || meter) !== expectedMeter) bar = { ...bar, timeSignature: expectedMeter };
          const expectedKey = keys.barActiveKeys[sectionIndex][barIndex];
          if ((bar.keyChangeTo || key) !== expectedKey) bar = { ...bar, keyChangeTo: expectedKey };
        }
        if (!bar.partialMeasure && bar.timeSignature) meter = bar.timeSignature;
        if (bar.keyChangeTo) key = bar.keyChangeTo;
        return bar;
      });
      return { ...section, bars };
    });
    if (incompatibleMeter) return failure('time-signature');
    return { song: { ...song, sections }, targets: destinations };
  }

  if (located.length === 1 && clipboard.items.length > 1 && ['chords', 'rhythm', 'jianpu'].includes(clipboard.kind)) {
    const first = located[0];
    const missing = Math.max(0, clipboard.items.length - (first.section.bars.length - first.barIndex));
    const blanks: Bar[] = Array.from({ length: missing }, () => ({ id: crypto.randomUUID(), chords: [] }));
    const bars = [...first.section.bars, ...blanks];
    const prepared = missing ? { ...song, sections: song.sections.map((section, index) => (
      index === first.sectionIndex ? { ...section, bars } : section
    )) } : song;
    const destinations = bars.slice(first.barIndex, first.barIndex + clipboard.items.length)
      .map((bar) => ({ sectionId: first.target.sectionId, barId: bar.id! }));
    const result = pastePreviewContent(prepared, destinations, clipboard);
    return result.error ? failure(result.error) : result;
  }
  if (clipboard.items.length !== 1 && clipboard.items.length !== located.length) return failure('count-mismatch');
  const patches = new Map<string, Bar>();
  for (const [index, destination] of located.entries()) {
    const source = clipboard.items[clipboard.items.length === 1 ? 0 : index];
    // A chord-only paste must not turn existing measured notation/navigation
    // into hidden data. Whole-block paste remains available as an insertion.
    if (clipboard.kind === 'chords' && hasUnmeteredChords(source.bar) !== hasUnmeteredChords(destination.bar)
      && (destination.bar.rhythm?.trim() || destination.bar.riff?.trim()
        || destination.bar.rhythmVoices?.length || destination.bar.riffVoices?.length
        || destination.bar.leftMarker || destination.bar.rightMarker || destination.bar.leftText?.trim()
        || destination.bar.rightText?.trim() || destination.bar.repeatStart || destination.bar.repeatEnd
        || destination.bar.doubleBar || destination.bar.doubleBarStart || destination.bar.finalBar || destination.bar.ending?.trim())) return failure('unmetered-content');
    if (hasUnmeteredChords(destination.bar) && ['rhythm', 'jianpu', 'marker'].includes(clipboard.kind)) return failure('unmetered-content');
    if (['chords', 'rhythm', 'jianpu'].includes(clipboard.kind)
      && !(clipboard.kind === 'chords' && (hasUnmeteredChords(source.bar) || source.bar.chordTimingUnspecified))
      && source.timeSignature !== getEffectiveTimeSignatureForBar(song, destination.bar)) return failure('time-signature');
    if (clipboard.kind === 'jianpu' && source.absoluteJianpu !== Boolean(song.jianpuInputAbsolute)) return failure('jianpu-mode');
    const bar = { ...destination.bar };
    switch (clipboard.kind) {
      case 'chords': {
        const key = getBarStoredKey(song, destination.target);
        const offset = getTransposeOffset(source.key, key);
        bar.chords = source.bar.chords.map((chord) => !source.bar.chordKeyUnspecified && offset ? transposeChord(chord, offset, key, false, source.key) : chord);
        bar.chordTimingUnspecified = source.bar.chordTimingUnspecified;
        bar.chordKeyUnspecified = source.bar.chordKeyUnspecified;
        bar.chordMarks = structuredClone(source.bar.chordMarks);
        bar.chordSubdivisions = source.bar.chordKeyUnspecified ? structuredClone(source.bar.chordSubdivisions) : transposeChordSubdivisions(source.bar.chordSubdivisions, offset, key, source.key);
        bar.chordPassVariants = source.bar.chordKeyUnspecified ? structuredClone(source.bar.chordPassVariants) : transposeChordPassVariants(source.bar.chordPassVariants, offset, key, source.key);
        bar.unmeteredChordLines = source.bar.chordKeyUnspecified ? structuredClone(source.bar.unmeteredChordLines) : transposeUnmeteredChordLines(source.bar.unmeteredChordLines, offset, key, source.key);
        break;
      }
      case 'rhythm':
        bar.rhythm = source.bar.rhythm;
        bar.rhythmVoices = structuredClone(source.bar.rhythmVoices);
        bar.rhythmMark = structuredClone(source.bar.rhythmMark);
        break;
      case 'jianpu':
        bar.riff = source.bar.riff;
        bar.riffVoices = structuredClone(source.bar.riffVoices);
        break;
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
