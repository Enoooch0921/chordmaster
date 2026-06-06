import { normalizeBarChords } from './barUtils';

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
  let lastVisibleIndex = normalizedChords.length - 1;
  while (lastVisibleIndex >= 0 && !normalizedChords[lastVisibleIndex].trim()) {
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
