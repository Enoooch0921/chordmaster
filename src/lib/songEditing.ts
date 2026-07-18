/**
 * Pure immutable commands shared by the legacy editor and preview-first editor.
 * Long-lived edit targets use section/bar ids; array indexes never leave this
 * module.
 */
import type { Bar, ChordMark, Key, Section, Song } from '../types';
import {
  getChordDisplaySlotEntries,
  getChordDisplaySlotOwnership,
  getChordTokenBeatSpan,
  isFullBarChordToken
} from '../utils/chordSlots';
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

export interface SongSectionIdentity {
  sectionId: string;
}

export interface SectionMutationResult {
  song: Song;
  sectionId: string;
  firstBarId: string | null;
  created: boolean;
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

export const createEmptySection = (title = ''): Section => ({
  id: createId('section'),
  title,
  bars: [createEmptyBar()]
});

export const cloneBarForInsert = (bar: Bar): Bar => ({
  ...structuredClone(bar),
  id: createId('bar')
});

const cloneSectionForInsert = (section: Section): Section => ({
  ...structuredClone(section),
  id: createId('section'),
  bars: section.bars.map(cloneBarForInsert)
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

export const findSongSection = (song: Song, sectionId: string) => {
  const sectionIndex = song.sections.findIndex((section) => section.id === sectionId);
  return sectionIndex >= 0
    ? { sectionIndex, section: song.sections[sectionIndex] }
    : null;
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
 * Empty bars begin at beat one. Whole-bar style rests keep focus on the slot
 * that owns their token even when the user taps the visual span beside it.
 */
export const resolvePreviewChordSlotIndex = (
  bar: Bar,
  beatCount: number,
  requestedSlotIndex: number
): number => {
  const safeRequestedSlot = Math.max(0, Math.min(beatCount - 1, requestedSlotIndex));
  const ownership = getChordDisplaySlotOwnership(bar.chords, beatCount);
  if (!ownership.some(Boolean)) return 0;
  return ownership[safeRequestedSlot]?.ownerSlotIndex ?? safeRequestedSlot;
};

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
    const normalizedChord = chord.trim();
    const ownership = getChordDisplaySlotOwnership(bar.chords, beatCount);
    const requestedOwnership = ownership[target.slotIndex];
    const targetSlotIndex = isFullBarChordToken(normalizedChord)
      ? 0
      : requestedOwnership?.ownerSlotIndex ?? target.slotIndex;
    const tokenSpan = getChordTokenBeatSpan(normalizedChord, beatCount);
    if (/^0h$/i.test(normalizedChord) && targetSlotIndex + tokenSpan > beatCount) return bar;

    const slots = getChordBeatSlots(bar, beatCount).map((slot) => slot.chord);
    if (isFullBarChordToken(normalizedChord)) {
      slots.fill('');
      slots[0] = normalizedChord;
    } else {
      if (requestedOwnership) {
        const existingEntries = getChordDisplaySlotEntries(bar.chords, beatCount);
        const existingAnchorIndex = existingEntries.findIndex((entry) => entry?.rawIndex === requestedOwnership.rawIndex);
        if (existingAnchorIndex >= 0) slots[existingAnchorIndex] = '';
      }
      for (let offset = 0; offset < tokenSpan; offset += 1) {
        slots[targetSlotIndex + offset] = '';
      }
      slots[targetSlotIndex] = normalizedChord;
    }
    const chords = serializeChordBeatSlots(slots, beatCount);
    return {
      ...bar,
      chords,
      chordMarks: isFullBarChordToken(normalizedChord)
        ? undefined
        : remapChordMarksByBeat(bar, chords, beatCount)
    };
  })
);

export const getChordPlacementError = (
  song: Song,
  target: SongChordTarget,
  chord: string
): string | null => {
  if (!/^0h$/i.test(chord.trim())) return null;
  const located = findSongBar(song, target);
  if (!located) return '找不到要編輯的小節。';
  const beatCount = getBeatCount(song, located.bar);
  const safeTargetSlot = Math.max(0, Math.min(beatCount - 1, target.slotIndex));
  const slotIndex = getChordDisplaySlotOwnership(located.bar.chords, beatCount)[safeTargetSlot]?.ownerSlotIndex
    ?? safeTargetSlot;
  return slotIndex + 2 > beatCount ? '二分休止需要連續兩拍。' : null;
};

export const clearChordAtBeatSlot = (song: Song, target: SongChordTarget): Song => (
  setChordAtBeatSlot(song, target, '')
);

const MULTI_MEASURE_REST_TOKEN = /^\|\d{1,3}\|$/;

export const getMultiMeasureRestPlacementError = (
  song: Song,
  target: SongChordTarget
): string | null => {
  if (target.slotIndex !== 0) return '多小節休止只能放在第一拍。';
  const located = findSongBar(song, target);
  if (!located) return '找不到要編輯的小節。';
  const slots = getChordBeatSlots(located.bar, getBeatCount(song, located.bar));
  const hasOtherContent = slots.some((slot, slotIndex) => {
    const chord = slot.chord.trim();
    if (!chord) return false;
    return slotIndex !== 0 || !MULTI_MEASURE_REST_TOKEN.test(chord);
  });
  return hasOtherContent ? '請先清空這個小節的其他和弦。' : null;
};

export const setMultiMeasureRestAtBar = (
  song: Song,
  target: SongChordTarget,
  count: number
): { song: Song; error: string | null } => {
  const placementError = getMultiMeasureRestPlacementError(song, target);
  if (placementError) return { song, error: placementError };
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    return { song, error: '多小節休止數量必須是 1–999。' };
  }
  return {
    song: setChordAtBeatSlot(song, { ...target, slotIndex: 0 }, `|${count}|`),
    error: null
  };
};

export const normalizeChordBeatTokens = (
  tokens: string[],
  beatCount: number
): ChordTextParseResult => {
  const safeBeatCount = Math.max(1, beatCount);
  const visibleTokens = tokens.map((token) => token.trim()).filter(Boolean);
  const fullBarTokens = visibleTokens.filter((token) => isFullBarChordToken(token));
  if (fullBarTokens.length > 0 && visibleTokens.length > 1) {
    return {
      chords: [],
      error: '整小節符號不能和其他和弦放在同一小節。'
    };
  }
  const occupiedBeatCount = visibleTokens.reduce((total, token) => total + getChordTokenBeatSpan(token, safeBeatCount), 0);
  if (occupiedBeatCount > safeBeatCount) {
    return {
      chords: [],
      error: `此小節最多可使用 ${safeBeatCount} 拍，目前內容需要 ${occupiedBeatCount} 拍。`
    };
  }
  if (visibleTokens.some((token) => getChordTokenBeatSpan(token, safeBeatCount) > 1)) {
    const positioned = Array.from({ length: safeBeatCount }, () => '');
    let slotIndex = 0;
    visibleTokens.forEach((token) => {
      positioned[slotIndex] = token;
      slotIndex += getChordTokenBeatSpan(token, safeBeatCount);
    });
    return { chords: positioned, error: null };
  }
  return { chords: tokens, error: null };
};

export const parseChordBarText = (value: string, beatCount: number): ChordTextParseResult => {
  const normalized = value
    .replace(/，/g, ',')
    .replace(/、/g, '/')
    .trim();
  const chords = normalized ? normalized.split(/\s+/).map((token) => token.trim()).filter(Boolean) : [];
  return normalizeChordBeatTokens(chords, beatCount);
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
  const hasFullBarToken = chords.some((token) => isFullBarChordToken(token));
  return {
    song: replaceLocatedBar(song, located, {
      ...located.bar,
      chords,
      chordMarks: hasFullBarToken ? undefined : remapChordMarksByBeat(located.bar, chords, beatCount)
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

const getSectionActiveKeys = (song: Song) => {
  const activeKeys: Key[] = [];
  let activeKey = song.originalKey;
  song.sections.forEach((section) => {
    if (section.keyChangeTo) activeKey = section.keyChangeTo;
    activeKeys.push(activeKey);
  });
  return activeKeys;
};

const transposeSectionLetterChords = (
  section: Section,
  fromKey: Key,
  toKey: Key
): Section => {
  if (fromKey === toKey) return section;
  const offset = getTransposeOffset(fromKey, toKey);
  return {
    ...section,
    bars: section.bars.map((bar) => ({
      ...bar,
      chords: bar.chords.map((token) => (
        isFormatNeutralChord(token) || isNashville(token.trim())
          ? token
          : transposeChord(token, offset, toKey, false, fromKey)
      ))
    }))
  };
};

const normalizeSectionKeyChanges = (song: Song, sections: Section[]) => {
  let inheritedKey = song.originalKey;
  return sections.map((section) => {
    const keyChangeTo = section.keyChangeTo && section.keyChangeTo !== inheritedKey
      ? section.keyChangeTo
      : undefined;
    inheritedKey = keyChangeTo ?? inheritedKey;
    return keyChangeTo === section.keyChangeTo ? section : { ...section, keyChangeTo };
  });
};

export const updateSectionTitle = (song: Song, sectionId: string, title: string): Song => {
  const located = findSongSection(song, sectionId);
  if (!located || located.section.title === title) return song;
  const sections = [...song.sections];
  sections[located.sectionIndex] = { ...located.section, title };
  return { ...song, sections };
};

export const duplicateSection = (
  song: Song,
  sectionId: string
): SectionMutationResult => {
  const located = findSongSection(song, sectionId);
  if (!located) {
    return {
      song,
      sectionId,
      firstBarId: null,
      created: false
    };
  }

  const duplicate = cloneSectionForInsert(located.section);
  const sections = [...song.sections];
  sections.splice(located.sectionIndex + 1, 0, duplicate);
  return {
    song: { ...song, sections: normalizeSectionKeyChanges(song, sections) },
    sectionId: duplicate.id ?? sectionId,
    firstBarId: duplicate.bars[0]?.id ?? null,
    created: true
  };
};

export const deleteSection = (song: Song, sectionId: string): Song => {
  if (song.sections.length <= 1) return song;
  const located = findSongSection(song, sectionId);
  if (!located) return song;

  const previousKeys = new Map<string, Key>();
  const activeKeys = getSectionActiveKeys(song);
  song.sections.forEach((section, index) => {
    if (section.id) previousKeys.set(section.id, activeKeys[index] ?? song.originalKey);
  });

  let inheritedKey = song.originalKey;
  const sections = song.sections
    .filter((section) => section.id !== sectionId)
    .map((section) => {
      const activeKey = section.id ? previousKeys.get(section.id) ?? inheritedKey : inheritedKey;
      const keyChangeTo = activeKey !== inheritedKey ? activeKey : undefined;
      inheritedKey = activeKey;
      return keyChangeTo === section.keyChangeTo ? section : { ...section, keyChangeTo };
    });

  return { ...song, sections };
};

export const splitSectionAtBar = (
  song: Song,
  target: SongBarIdentity
): SectionMutationResult => {
  const located = findSongBar(song, target);
  if (!located || located.barIndex === 0) {
    return {
      song,
      sectionId: located?.section.id ?? target.sectionId,
      firstBarId: located?.section.bars[0]?.id ?? null,
      created: false
    };
  }
  const sectionId = createId('section');
  const leadingBars = located.section.bars.slice(0, located.barIndex);
  const trailingBars = located.section.bars.slice(located.barIndex);
  const sections = [...song.sections];
  sections[located.sectionIndex] = { ...located.section, bars: leadingBars };
  sections.splice(located.sectionIndex + 1, 0, {
    id: sectionId,
    title: '',
    bars: trailingBars
  });
  return {
    song: { ...song, sections },
    sectionId,
    firstBarId: trailingBars[0]?.id ?? null,
    created: true
  };
};

export const mergeSectionToPrevious = (
  song: Song,
  sectionId: string
): SectionMutationResult => {
  const located = findSongSection(song, sectionId);
  if (!located || located.sectionIndex <= 0) {
    return {
      song,
      sectionId,
      firstBarId: located?.section.bars[0]?.id ?? null,
      created: false
    };
  }

  const activeKeys = getSectionActiveKeys(song);
  const sourceKey = activeKeys[located.sectionIndex] ?? song.originalKey;
  const destinationKey = activeKeys[located.sectionIndex - 1] ?? song.originalKey;
  const nextExplicitKeyIndex = song.sections.findIndex((section, index) => (
    index > located.sectionIndex && Boolean(section.keyChangeTo)
  ));
  const conversionEnd = nextExplicitKeyIndex < 0 ? song.sections.length : nextExplicitKeyIndex;
  const convertedSections = song.sections.map((section, index) => (
    index >= located.sectionIndex && index < conversionEnd
      ? transposeSectionLetterChords(section, sourceKey, destinationKey)
      : section
  ));
  const previousSection = convertedSections[located.sectionIndex - 1];
  const convertedSource = convertedSections[located.sectionIndex];
  const firstBarId = convertedSource.bars[0]?.id ?? null;
  const sections = [...convertedSections];
  sections[located.sectionIndex - 1] = {
    ...previousSection,
    bars: [...previousSection.bars, ...convertedSource.bars]
  };
  sections.splice(located.sectionIndex, 1);

  return {
    song: { ...song, sections: normalizeSectionKeyChanges(song, sections) },
    sectionId: previousSection.id ?? '',
    firstBarId,
    created: false
  };
};

export const finalizeSectionTitleEdit = ({
  baseSong,
  draftSong,
  sectionId,
  title
}: {
  baseSong: Song;
  draftSong: Song;
  sectionId: string;
  title: string;
}): Song => {
  const normalizedTitle = title.trim();
  const sectionIndex = draftSong.sections.findIndex((section) => section.id === sectionId);
  const baseSection = baseSong.sections.find((section) => section.id === sectionId);
  let nextSong = updateSectionTitle(draftSong, sectionId, normalizedTitle);
  if (!baseSection?.title.trim() || normalizedTitle) return nextSong;
  return sectionIndex === 0
    ? updateSectionTitle(nextSong, sectionId, baseSection.title)
    : mergeSectionToPrevious(nextSong, sectionId).song;
};

export const reorderSection = (
  song: Song,
  sourceSectionId: string,
  targetSectionId: string,
  placement: 'before' | 'after'
): Song => {
  if (sourceSectionId === targetSectionId) return song;
  const sourceIndex = song.sections.findIndex((section) => section.id === sourceSectionId);
  const targetIndex = song.sections.findIndex((section) => section.id === targetSectionId);
  if (sourceIndex < 0 || targetIndex < 0) return song;

  const sectionIds = song.sections.map((section) => section.id).filter((id): id is string => Boolean(id));
  if (sectionIds.length !== song.sections.length) return song;
  const reorderedIds = [...sectionIds];
  reorderedIds.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = reorderedIds.indexOf(targetSectionId);
  reorderedIds.splice(targetIndexAfterRemoval + (placement === 'after' ? 1 : 0), 0, sourceSectionId);
  return reorderSongSections(song, reorderedIds);
};

export const reorderSongSections = (
  song: Song,
  orderedSectionIds: string[]
): Song => {
  if (orderedSectionIds.length !== song.sections.length) return song;
  const sectionsById = new Map(song.sections.map((section) => [section.id, section]));
  const reordered = orderedSectionIds.map((sectionId) => sectionsById.get(sectionId));
  if (reordered.some((section) => !section)) return song;
  if (reordered.every((section, index) => section === song.sections[index])) return song;

  const activeKeys = getSectionActiveKeys(song);
  const previousKeys = new Map<string, Key>();
  song.sections.forEach((section, index) => {
    if (section.id) previousKeys.set(section.id, activeKeys[index] ?? song.originalKey);
  });

  let inheritedKey = song.originalKey;
  const aligned = (reordered as Section[]).map((section) => {
    const previousKey = section.id ? previousKeys.get(section.id) ?? inheritedKey : inheritedKey;
    if (section.keyChangeTo) {
      inheritedKey = section.keyChangeTo;
      return section;
    }
    return transposeSectionLetterChords(section, previousKey, inheritedKey);
  });
  return { ...song, sections: normalizeSectionKeyChanges(song, aligned) };
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
  const normalizedInput = normalizeChordTextInput(trimmed, inputMode);
  const inverseOffset = getTransposeOffset(displayedKey, storedKey);
  // When no inverse transposition is needed, preserve the spelling the user
  // explicitly entered (Cb, Fb, B#, E#) instead of collapsing it to an
  // enharmonic pitch such as B or E.
  if (inputMode === 'letters' && storageMode === 'letters' && inverseOffset === 0) {
    return normalizedInput;
  }
  const displayedLetterChord = inputMode === 'nashville'
    ? parseNashvilleToChord(normalizedInput, displayedKey)
    : normalizeChordEnharmonic(normalizedInput);
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
  const displayOffset = getTransposeOffset(storedKey, displayedKey);
  if (storageMode === 'letters' && outputMode === 'letters' && displayOffset === 0) {
    return normalizeChordTextInput(trimmed, 'letters');
  }
  const storedLetterChord = storageMode === 'nashville'
    ? parseNashvilleToChord(trimmed, storedKey)
    : normalizeChordEnharmonic(trimmed);
  const displayedLetterChord = transposeChord(
    storedLetterChord,
    displayOffset,
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
