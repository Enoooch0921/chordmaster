import { normalizeBarChords } from './barUtils';

export const LYRICS_SEGMENT_SEPARATOR = ' | ';
export const LYRICS_BAR_SEPARATOR = ' || ';

export interface LyricAnchor {
  rawIndex: number;
  chord: string;
  slotIndex: number;
  span: number;
  lyric: string;
}

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

const CJK_CHAR_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export const normalizeBarLyrics = (lyrics?: string[] | null) => {
  if (!Array.isArray(lyrics)) return [];

  const normalized = lyrics.map((segment) => (
    typeof segment === 'string'
      ? segment.replace(/\r\n?/g, '\n')
      : ''
  ));

  let lastNonEmptyIndex = normalized.length - 1;
  while (lastNonEmptyIndex >= 0 && normalized[lastNonEmptyIndex].trim() === '') {
    lastNonEmptyIndex -= 1;
  }

  return normalized.slice(0, lastNonEmptyIndex + 1);
};

export const getChordAnchorSlotIndexes = (chords: string[], beatsPerBar: number) => {
  const visibleChords = normalizeBarChords(chords);
  const beatCount = Math.max(1, beatsPerBar);

  if (visibleChords.length === 0) {
    return [] as number[];
  }

  if (visibleChords.length === 2 && beatCount > 1 && !visibleChords.includes('')) {
    return [0, getTwoChordSplitSlotIndex(beatCount)];
  }

  return visibleChords
    .slice(0, beatCount)
    .map((_, index) => index);
};

export const getChordDisplaySlots = (chords: string[], beatsPerBar: number) => {
  const beatCount = Math.max(1, beatsPerBar);
  const visibleChords = normalizeBarChords(chords).slice(0, beatCount);
  const slotIndexes = getChordAnchorSlotIndexes(visibleChords, beatCount);
  const slots = Array.from({ length: beatCount }, () => '');

  visibleChords.forEach((chord, rawIndex) => {
    const slotIndex = slotIndexes[rawIndex] ?? Math.min(rawIndex, beatCount - 1);
    slots[slotIndex] = chord;
  });

  return slots;
};

export const getLyricAnchors = (
  chords: string[],
  lyrics: string[] | undefined,
  beatsPerBar: number
): LyricAnchor[] => {
  const beatCount = Math.max(1, beatsPerBar);
  const visibleChords = normalizeBarChords(chords).slice(0, beatCount);
  const visibleLyrics = normalizeBarLyrics(lyrics);
  const slotIndexes = getChordAnchorSlotIndexes(visibleChords, beatCount);

  return visibleChords.map((chord, rawIndex) => {
    const slotIndex = slotIndexes[rawIndex] ?? Math.min(rawIndex, beatCount - 1);
    const nextSlotIndex = slotIndexes[rawIndex + 1] ?? beatCount;

    return {
      rawIndex,
      chord,
      slotIndex,
      span: Math.max(1, nextSlotIndex - slotIndex),
      lyric: visibleLyrics[rawIndex] ?? ''
    };
  });
};

export const buildSectionLyricsDraft = (
  bars: Array<{ chords: string[]; lyrics?: string[]; timeSignature?: string }>,
  defaultTimeSignature: string,
  maxVisibleSegmentIndex?: number
) => {
  return buildSectionLyricsDraftLayout(bars, defaultTimeSignature, maxVisibleSegmentIndex).draft;
};

export const buildSectionLyricsDraftLayout = (
  bars: Array<{ chords: string[]; lyrics?: string[]; timeSignature?: string }>,
  defaultTimeSignature: string,
  maxVisibleSegmentIndex?: number
) => {
  const formattedBars = bars.map((bar) => {
    const beatsPerBar = parseInt((bar.timeSignature || defaultTimeSignature || '4/4').split('/')[0], 10) || 4;
    return getLyricAnchors(bar.chords, bar.lyrics, beatsPerBar).map((anchor) => anchor.lyric);
  });

  let draft = '';
  const segmentStarts: number[] = [];
  let globalSegmentCounter = 0;

  formattedBars.forEach((segments) => {
    const shouldRenderAllSegments = typeof maxVisibleSegmentIndex !== 'number' || maxVisibleSegmentIndex < 0;
    const renderedSegments = shouldRenderAllSegments
      ? segments
      : segments.filter((_, segmentIndex) => globalSegmentCounter + segmentIndex <= maxVisibleSegmentIndex);

    renderedSegments.forEach((segment) => {
      draft += '|';
      segmentStarts.push(draft.length);
      draft += segment;
    });

    globalSegmentCounter += segments.length;
  });

  return { draft, segmentStarts };
};

export const splitSectionLyricsDraft = (
  draft: string,
  bars: Array<{ chords: string[]; lyrics?: string[]; timeSignature?: string }>,
  defaultTimeSignature: string
) => {
  const normalizedDraft = draft.replace(/\r\n?/g, '\n');
  const rawTokens = normalizedDraft.split('|');
  const tokens = rawTokens[0] === '' ? rawTokens.slice(1) : rawTokens;

  const barLyrics: string[][] = [];
  let tokenIndex = 0;

  const getExpectedAnchorCount = (barIndex: number) => {
    const bar = bars[barIndex];
    if (!bar) return 0;
    const beatsPerBar = parseInt((bar.timeSignature || defaultTimeSignature || '4/4').split('/')[0], 10) || 4;
    return getLyricAnchors(bar.chords, bar.lyrics, beatsPerBar).length;
  };

  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    const expectedAnchorCount = getExpectedAnchorCount(barIndex);
    if (expectedAnchorCount === 0) {
      barLyrics.push([]);
      continue;
    }

    const nextLyrics = tokens
      .slice(tokenIndex, tokenIndex + expectedAnchorCount);

    tokenIndex += expectedAnchorCount;

    while (nextLyrics.length < expectedAnchorCount) {
      nextLyrics.push('');
    }

    barLyrics.push(normalizeBarLyrics(nextLyrics));
  }

  return barLyrics;
};

export const replaceLyricsPunctuationWithSpaces = (value: string) => (
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[，。！？；：、,.!?;:\/\\()[\]{}<>《》〈〉「」『』【】〔〕"'`~@#$%^&*_+=-]+/g, ' ')
    .replace(/…+/g, ' ')
    .replace(/—+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
);

export const estimateLyricDisplayUnits = (text: string) => (
  Array.from(text).reduce((total, character) => {
    if (character === '\n' || character === '\r') return total + 0.38;
    if (!character.trim()) return total + 0.4;
    if (CJK_CHAR_REGEX.test(character)) return total + 1;
    if (/[A-Z]/.test(character)) return total + 0.7;
    if (/[a-z]/.test(character)) return total + 0.58;
    if (/[0-9]/.test(character)) return total + 0.56;
    return total + 0.46;
  }, 0)
);

const getVisibleLyricCharacters = (text: string) => (
  Array.from(text).filter((character) => character !== '\n' && character !== '\r')
);

export const getLyricTrackingEm = (text: string, span: number) => {
  if (!text) return 0;

  const visibleCharacters = getVisibleLyricCharacters(text);
  if (visibleCharacters.length <= 1) return 0;

  const estimatedUnits = Math.max(1, estimateLyricDisplayUnits(text));
  const availableUnits = Math.max(1, span) * 3.2;
  const extraUnits = Math.max(0, availableUnits - estimatedUnits);
  if (extraUnits <= 0.06) return 0;

  const gapCount = Math.max(1, visibleCharacters.length - 1);
  const cjkCount = visibleCharacters.filter((character) => CJK_CHAR_REGEX.test(character)).length;
  const latinCount = visibleCharacters.filter((character) => /[A-Za-z]/.test(character)).length;
  const bias = cjkCount >= latinCount ? 0.34 : 0.16;
  const maxTracking = cjkCount >= latinCount ? 0.56 : 0.18;

  return Math.max(0, Math.min(maxTracking, (extraUnits / gapCount) * bias));
};

export const getLyricFitScale = (text: string, span: number) => {
  if (!text) return 1;

  const estimatedUnits = Math.max(1, estimateLyricDisplayUnits(text));
  const availableUnits = Math.max(1, span) * 3.2;
  return Math.min(1, availableUnits / estimatedUnits);
};

export const getLyricFontScale = (text: string, span: number, minScale = 0.18) => {
  if (!text) return 1;

  const fitScale = getLyricFitScale(text, span);
  if (fitScale >= 1) return 1;

  return Math.max(minScale, Math.min(fitScale, fitScale * 0.94));
};
