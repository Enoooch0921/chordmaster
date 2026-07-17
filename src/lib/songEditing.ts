/**
 * Pure immutable commands shared by the legacy editor and preview-first editor.
 * Long-lived edit targets use section/bar ids; array indexes never leave this
 * module.
 */
import type { Bar, ChordMark, Key, Section, Song } from '../types';
import { getChordDisplaySlotEntries } from '../utils/chordSlots';
import {
  getNashvilleNumber,
  getTransposeOffset,
  isNashville,
  normalizeChordEnharmonic,
  parseNashvilleToChord,
  transposeChord
} from '../utils/musicUtils';

export type ChordInputMode = 'letters' | 'nashville';

export interface SongBarIdentity {
  sectionId: string;
  barId: string;
}

export interface SongChordTarget extends SongBarIdentity {
  slotIndex: number;
}

export interface LocatedSongBar {
  sectionIndex: number;
  barIndex: number;
  section: Section;
  bar: Bar;
}

export interface ChordBeatSlot {
  chord: string;
  rawChordIndex: number | null;
}

export interface ChordTextParseResult {
  chords: string[];
  error: string | null;
}

export type EditableBarFields = Pick<
  Bar,
  | 'timeSignature'
  | 'label'
  | 'annotation'
  | 'leftMarker'
  | 'rightMarker'
  | 'leftText'
  | 'rightText'
  | 'repeatStart'
  | 'repeatEnd'
  | 'finalBar'
  | 'ending'
>;

const createId = (prefix: 'section' | 'bar') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix === 'section' ? `section-${crypto.randomUUID()}` : crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyBar = (): Bar => ({
  id: createId('bar'),
  chords: []
});

export const cloneBarForInsert = (bar: Bar): Bar => ({
  ...structuredClone(bar),
  id: createId('bar')
});

export const ensureSongEditingIds = (song: Song): Song => {
  let changed = false;
  const sections = song.sections.map((section, sectionIndex) => {
    const sectionId = section.id || `s-init-${sectionIndex}`;
    const bars = section.bars.map((bar) => {
      if (bar.id) return bar;
      changed = true;
      return { ...bar, id: createId('bar') };
    });
    if (section.id && bars === section.bars) return section;
    if (!section.id) changed = true;
    return { ...section, id: sectionId, bars };
  });
  return changed ? { ...song, sections } : song;
};

export const getBeatCount = (song: Song, bar: Bar) => {
  const numerator = Number.parseInt((bar.timeSignature || song.timeSignature || '4/4').split('/')[0], 10);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
};

export const findSongBar = (song: Song, target: SongBarIdentity): LocatedSongBar | null => {
  const sectionIndex = song.sections.findIndex((section) => section.id === target.sectionId);
  if (sectionIndex < 0) return null;
  const section = song.sections[sectionIndex];
  const barIndex = section.bars.findIndex((bar) => bar.id === target.barId);
  if (barIndex < 0) return null;
  return { sectionIndex, barIndex, section, bar: section.bars[barIndex] };
};

const replaceLocatedBar = (song: Song, located: LocatedSongBar, bar: Bar): Song => {
  const bars = [...located.section.bars];
  bars[located.barIndex] = bar;
  const sections = [...song.sections];
  sections[located.sectionIndex] = { ...located.section, bars };
  return { ...song, sections };
};

export const updateBarById = (
  song: Song,
  target: SongBarIdentity,
  updater: (bar: Bar, located: LocatedSongBar) => Bar
): Song => {
  const located = findSongBar(song, target);
  if (!located) return song;
  const nextBar = updater(located.bar, located);
  return nextBar === located.bar ? song : replaceLocatedBar(song, located, nextBar);
};

export const getChordBeatSlots = (bar: Bar, beatCount: number): ChordBeatSlot[] => (
  getChordDisplaySlotEntries(bar.chords, beatCount).map((entry) => ({
    chord: entry?.chord ?? '',
    rawChordIndex: entry?.rawIndex ?? null
  }))
);

/**
 * Edited bars use a beat-count-wide array. This is still the existing chords
 * JSON array, but its trailing empty strings distinguish explicit positioning
 * from legacy compact two-chord auto-distribution.
 */
export const serializeChordBeatSlots = (slots: Array<string | ChordBeatSlot>, beatCount = slots.length): string[] => {
  const safeBeatCount = Math.max(1, beatCount);
  return Array.from({ length: safeBeatCount }, (_, index) => {
    const slot = slots[index];
    return (typeof slot === 'string' ? slot : slot?.chord ?? '').trim();
  });
};

const remapChordMarksByBeat = (
  oldBar: Bar,
  nextChords: string[],
  beatCount: number
): Record<number, ChordMark> | undefined => {
  if (!oldBar.chordMarks) return undefined;
  const oldEntries = getChordDisplaySlotEntries(oldBar.chords, beatCount);
  const nextEntries = getChordDisplaySlotEntries(nextChords, beatCount);
  const nextMarks: Record<number, ChordMark> = {};
  oldEntries.forEach((oldEntry, slotIndex) => {
    if (!oldEntry) return;
    const mark = oldBar.chordMarks?.[oldEntry.rawIndex];
    const nextEntry = nextEntries[slotIndex];
    if (mark && nextEntry) nextMarks[nextEntry.rawIndex] = mark;
  });
  return Object.keys(nextMarks).length > 0 ? nextMarks : undefined;
};

export const setChordAtBeatSlot = (song: Song, target: SongChordTarget, chord: string): Song => (
  updateBarById(song, target, (bar) => {
    const beatCount = getBeatCount(song, bar);
    if (target.slotIndex < 0 || target.slotIndex >= beatCount) return bar;
    const slots = getChordBeatSlots(bar, beatCount).map((slot) => slot.chord);
    slots[target.slotIndex] = chord.trim();
    const chords = serializeChordBeatSlots(slots, beatCount);
    return {
      ...bar,
      chords,
      chordMarks: remapChordMarksByBeat(bar, chords, beatCount)
    };
  })
);

export const clearChordAtBeatSlot = (song: Song, target: SongChordTarget): Song => (
  setChordAtBeatSlot(song, target, '')
);

export const parseChordBarText = (value: string, beatCount: number): ChordTextParseResult => {
  const normalized = value
    .replace(/，/g, ',')
    .replace(/、/g, '/')
    .trim();
  const chords = normalized ? normalized.split(/\s+/).map((token) => token.trim()).filter(Boolean) : [];
  if (chords.length > beatCount) {
    return {
      chords: [],
      error: `此小節最多可放 ${beatCount} 個和弦，目前輸入 ${chords.length} 個。`
    };
  }
  return { chords, error: null };
};

export const setBarChordText = (song: Song, target: SongBarIdentity, value: string): ChordTextParseResult & { song: Song } => {
  const located = findSongBar(song, target);
  if (!located) return { song, chords: [], error: '找不到要編輯的小節。' };
  const beatCount = getBeatCount(song, located.bar);
  const parsed = parseChordBarText(value, beatCount);
  if (parsed.error) return { ...parsed, song };
  const normalized = parsed.chords.map((token) => (
    isNashville(token) ? token : normalizeChordEnharmonic(token)
  ));
  const chords = normalized.length === 0 ? [] : normalized;
  return {
    song: replaceLocatedBar(song, located, {
      ...located.bar,
      chords,
      chordMarks: remapChordMarksByBeat(located.bar, chords, beatCount)
    }),
    chords,
    error: null
  };
};

export const updateEditableBarFields = (
  song: Song,
  target: SongBarIdentity,
  patch: Partial<EditableBarFields>
): Song => updateBarById(song, target, (bar) => {
  const next = { ...bar, ...patch };
  if (patch.repeatEnd === true) next.finalBar = false;
  if (patch.finalBar === true) next.repeatEnd = false;
  return next;
});

export const insertBar = (
  song: Song,
  target: SongBarIdentity,
  side: 'before' | 'after',
  bar: Bar = createEmptyBar()
): Song => {
  const located = findSongBar(song, target);
  if (!located) return song;
  const bars = [...located.section.bars];
  bars.splice(located.barIndex + (side === 'after' ? 1 : 0), 0, bar);
  const sections = [...song.sections];
  sections[located.sectionIndex] = { ...located.section, bars };
  return { ...song, sections };
};

export const duplicateBar = (song: Song, target: SongBarIdentity): Song => {
  const located = findSongBar(song, target);
  return located ? insertBar(song, target, 'after', cloneBarForInsert(located.bar)) : song;
};

export const deleteBar = (song: Song, target: SongBarIdentity): Song => {
  const located = findSongBar(song, target);
  if (!located) return song;
  const bars = located.section.bars.filter((_, index) => index !== located.barIndex);
  const sections = [...song.sections];
  sections[located.sectionIndex] = { ...located.section, bars };
  return { ...song, sections };
};

const isFormatNeutralChord = (chord: string) => {
  const trimmed = chord.trim();
  return !trimmed
    || ['%', '/', 'N.C.'].includes(trimmed)
    || /^\|\d+\|$/.test(trimmed)
    || /^0(?:_|h|w)?$/i.test(trimmed);
};

export const detectSectionChordInputMode = (section: Section): ChordInputMode => {
  let letterCount = 0;
  let nashvilleCount = 0;
  section.bars.forEach((bar) => bar.chords.forEach((chord) => {
    if (isFormatNeutralChord(chord)) return;
    if (isNashville(chord.trim())) nashvilleCount += 1;
    else letterCount += 1;
  }));
  return nashvilleCount > letterCount ? 'nashville' : 'letters';
};

export const detectChordStorageMode = (
  chord: string,
  fallback: ChordInputMode = 'letters'
): ChordInputMode => (
  isFormatNeutralChord(chord) ? fallback : isNashville(chord.trim()) ? 'nashville' : 'letters'
);

export const getChordStorageModeForTarget = (
  song: Song,
  target: SongChordTarget
): ChordInputMode => {
  const located = findSongBar(song, target);
  if (!located) return 'letters';
  const fallback = detectSectionChordInputMode(located.section);
  const chord = getChordBeatSlots(located.bar, getBeatCount(song, located.bar))[target.slotIndex]?.chord ?? '';
  return detectChordStorageMode(chord, fallback);
};

/** Normalize only chord roots while preserving user-defined quality text. */
export const normalizeChordTextInput = (
  input: string,
  inputMode: ChordInputMode
): string => {
  if (inputMode !== 'letters') return input;
  return input
    .replace(/^([a-g])/, (_, root: string) => root.toUpperCase())
    .replace(/\/([a-g])/g, (_, root: string) => `/${root.toUpperCase()}`);
};

export const convertDisplayedChordToStoredChord = ({
  input,
  inputMode,
  storageMode,
  displayedKey,
  storedKey
}: {
  input: string;
  inputMode: ChordInputMode;
  storageMode: ChordInputMode;
  displayedKey: Key;
  storedKey: Key;
}): string => {
  const trimmed = input.trim();
  if (!trimmed || ['%', '/', 'N.C.'].includes(trimmed) || /^\|\d+\|$/.test(trimmed)) return trimmed;
  const displayedLetterChord = inputMode === 'nashville'
    ? parseNashvilleToChord(trimmed, displayedKey)
    : normalizeChordEnharmonic(trimmed);
  const inverseOffset = getTransposeOffset(displayedKey, storedKey);
  const storedLetterChord = transposeChord(
    displayedLetterChord,
    inverseOffset,
    storedKey,
    false,
    displayedKey
  );
  return storageMode === 'nashville'
    ? getNashvilleNumber(storedLetterChord, storedKey)
    : storedLetterChord;
};

export const convertStoredChordToDisplayedChord = ({
  chord,
  storageMode,
  outputMode,
  storedKey,
  displayedKey
}: {
  chord: string;
  storageMode: ChordInputMode;
  outputMode: ChordInputMode;
  storedKey: Key;
  displayedKey: Key;
}): string => {
  const trimmed = chord.trim();
  if (!trimmed || ['%', '/', 'N.C.'].includes(trimmed) || /^\|\d*\|$/.test(trimmed) || /^0(?:_|h|w)?$/i.test(trimmed)) {
    return trimmed;
  }
  const storedLetterChord = storageMode === 'nashville'
    ? parseNashvilleToChord(trimmed, storedKey)
    : normalizeChordEnharmonic(trimmed);
  const displayedLetterChord = transposeChord(
    storedLetterChord,
    getTransposeOffset(storedKey, displayedKey),
    displayedKey,
    false,
    storedKey
  );
  return outputMode === 'nashville'
    ? getNashvilleNumber(displayedLetterChord, displayedKey)
    : displayedLetterChord;
};

export const getSectionStoredKey = (song: Song, sectionId: string): Key => {
  let activeKey = song.originalKey;
  for (const section of song.sections) {
    if (section.keyChangeTo) activeKey = section.keyChangeTo;
    if (section.id === sectionId) return activeKey;
  }
  return activeKey;
};
