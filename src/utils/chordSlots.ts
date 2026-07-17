import { normalizeBarChords } from './barUtils';

const FULL_BAR_CHORD_TOKEN = /^(?:%|0w|\|\d{1,3}\|)$/i;
const HALF_REST_CHORD_TOKEN = /^0h$/i;

export const getChordTokenBeatSpan = (chord: string, beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);
  const token = chord.trim();
  if (FULL_BAR_CHORD_TOKEN.test(token)) return beatCount;
  if (HALF_REST_CHORD_TOKEN.test(token)) return 2;
  return 1;
};

export const isFullBarChordToken = (chord: string) => FULL_BAR_CHORD_TOKEN.test(chord.trim());

export interface ChordDisplaySlotOwnership {
  chord: string;
  rawIndex: number;
  ownerSlotIndex: number;
  span: number;
  covered: boolean;
}

// Chord slot-placement helpers: given a bar's chords and its beats-per-bar,
// work out which beat slot each chord sits in for the chord-sheet grid. These
// are purely about chord layout (no lyrics involved).

export const getTwoChordSplitSlotIndex = (beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);

  if (beatCount <= 1) {
    return 0;
  }

  if (beatCount === 3) {
    return 2;
  }

  return Math.min(beatCount - 1, Math.ceil(beatCount / 2));
};

export const getChordAnchorSlotIndexes = (chords: string[], beatsPerBar: number) => {
  const visibleChords = normalizeBarChords(chords);
  const beatCount = Math.max(1, beatsPerBar);
  // A beat-count-wide array is an explicitly positioned beat grid. Older
  // songs commonly store only the visible tokens (for example ["C", "G"]),
  // which keeps the existing automatic two-chord distribution. Preview-first
  // editing pads edited bars to the full beat count so an empty beat remains a
  // real, addressable slot without changing the persisted JSON shape.
  if (visibleChords.length >= beatCount) {
    return visibleChords.slice(0, beatCount).map((_, index) => index);
  }
  let lastVisibleIndex = visibleChords.length - 1;
  while (lastVisibleIndex >= 0 && !visibleChords[lastVisibleIndex].trim()) {
    lastVisibleIndex -= 1;
  }
  const layoutChords = visibleChords.slice(0, lastVisibleIndex + 1);

  if (layoutChords.length === 0) {
    return [] as number[];
  }

  const meaningfulChords = layoutChords.filter((chord) => {
    const trimmed = chord.trim();
    return trimmed && trimmed !== '/';
  });
  const hasBeatSlashPlaceholder = layoutChords.some((chord) => chord.trim() === '/');
  const meaningfulIndexes = layoutChords
    .map((chord, index) => ({ chord: chord.trim(), index }))
    .filter(({ chord }) => chord && chord !== '/')
    .map(({ index }) => index);

  if (meaningfulChords.length === 2 && !hasBeatSlashPlaceholder) {
    const firstMeaningfulIndex = meaningfulIndexes[0] ?? 0;
    const secondMeaningfulIndex = meaningfulIndexes[1] ?? layoutChords.length - 1;
    const emptyBeatsBetween = layoutChords
      .slice(firstMeaningfulIndex + 1, secondMeaningfulIndex)
      .filter((chord) => !chord.trim()).length;
    const secondSlotIndex = Math.min(beatCount - 1, getTwoChordSplitSlotIndex(beatCount) + emptyBeatsBetween);

    return layoutChords.map((_, index) => {
      if (index === firstMeaningfulIndex) return Math.min(firstMeaningfulIndex, beatCount - 1);
      if (index === secondMeaningfulIndex) return secondSlotIndex;
      return Math.min(index, beatCount - 1);
    });
  }

  return layoutChords
    .slice(0, beatCount)
    .map((_, index) => index);
};

export const getChordDisplaySlots = (chords: string[], beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);
  const normalizedChords = normalizeBarChords(chords);
  const hasExplicitBeatGrid = normalizedChords.length >= beatCount;
  let lastVisibleIndex = normalizedChords.length - 1;
  while (!hasExplicitBeatGrid && lastVisibleIndex >= 0 && !normalizedChords[lastVisibleIndex].trim()) {
    lastVisibleIndex -= 1;
  }
  const visibleChords = normalizedChords.slice(0, lastVisibleIndex + 1).slice(0, beatCount);
  const slotIndexes = getChordAnchorSlotIndexes(visibleChords, beatCount);
  const slots = Array.from({ length: beatCount }, () => '');

  visibleChords.forEach((chord, rawIndex) => {
    const slotIndex = slotIndexes[rawIndex] ?? Math.min(rawIndex, beatCount - 1);
    slots[slotIndex] = chord;
  });

  return slots;
};

export const getChordDisplaySlotEntries = (chords: string[], beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);
  const normalizedChords = normalizeBarChords(chords);
  const hasExplicitBeatGrid = normalizedChords.length >= beatCount;
  let lastVisibleIndex = normalizedChords.length - 1;
  while (!hasExplicitBeatGrid && lastVisibleIndex >= 0 && !normalizedChords[lastVisibleIndex].trim()) {
    lastVisibleIndex -= 1;
  }
  const visibleChords = normalizedChords.slice(0, lastVisibleIndex + 1).slice(0, beatCount);
  const slotIndexes = getChordAnchorSlotIndexes(visibleChords, beatCount);
  const slots = Array.from({ length: beatCount }, () => null as { chord: string; rawIndex: number } | null);

  visibleChords.forEach((chord, rawIndex) => {
    if (!chord.trim()) return;
    const slotIndex = slotIndexes[rawIndex] ?? Math.min(rawIndex, beatCount - 1);
    slots[slotIndex] = { chord, rawIndex };
  });

  return slots;
};

export const getChordDisplaySlotOwnership = (chords: string[], beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);
  const entries = getChordDisplaySlotEntries(chords, beatCount);
  const fullBarEntry = entries.find((entry) => entry && isFullBarChordToken(entry.chord));

  if (fullBarEntry) {
    return Array.from({ length: beatCount }, (_, slotIndex): ChordDisplaySlotOwnership => ({
      chord: fullBarEntry.chord,
      rawIndex: fullBarEntry.rawIndex,
      ownerSlotIndex: 0,
      span: beatCount,
      covered: slotIndex > 0
    }));
  }

  const ownership = Array.from({ length: beatCount }, () => null as ChordDisplaySlotOwnership | null);
  entries.forEach((entry, slotIndex) => {
    if (!entry) return;
    const span = Math.min(getChordTokenBeatSpan(entry.chord, beatCount), beatCount - slotIndex);
    ownership[slotIndex] = {
      chord: entry.chord,
      rawIndex: entry.rawIndex,
      ownerSlotIndex: slotIndex,
      span,
      covered: false
    };
  });

  entries.forEach((entry, slotIndex) => {
    if (!entry) return;
    const owner = ownership[slotIndex];
    if (!owner || owner.covered || owner.ownerSlotIndex !== slotIndex || owner.span <= 1) return;
    for (let offset = 1; offset < owner.span; offset += 1) {
      const coveredSlotIndex = slotIndex + offset;
      ownership[coveredSlotIndex] = { ...owner, covered: true };
    }
  });

  return ownership;
};
