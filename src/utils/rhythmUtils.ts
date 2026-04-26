export type RhythmBase = 'w' | 'h' | 'q' | 'e' | 's';

export interface RhythmEvent {
  index: number;
  token: string;
  base: RhythmBase;
  isRest: boolean;
  isHidden: boolean;
  dotted: boolean;
  triplet: boolean;
  accent: boolean;
  tieAfter: boolean;
  durationUnits: number;
  startUnit: number;
  endUnit: number;
  beamCount: number;
}

export interface ParsedRhythm {
  events: RhythmEvent[];
  invalidTokens: string[];
  totalUnits: number;
  visibleEndUnit: number;
  beats: number;
  beatValue: number;
  beatUnits: number;
  barUnits: number;
  overflow: boolean;
  underfilled: boolean;
}

export interface RhythmDisplayGlyph {
  text: string;
  startUnit: number;
  spanUnits: number;
}

export interface RhythmAccentMark {
  eventIndex: number;
  centerUnit: number;
}

export interface RhythmTieArc {
  eventIndex: number;
  startUnit: number;
  endUnit: number;
  startHeadUnit: number;
  endHeadUnit: number;
  crossesBeat: boolean;
  breakUnit?: number;
}

export interface RationalizedRhythmDisplay {
  parsed: ParsedRhythm;
  glyphs: RhythmDisplayGlyph[];
  accents: RhythmAccentMark[];
  ties: RhythmTieArc[];
}

const BASE_UNITS: Record<RhythmBase, number> = {
  w: 16,
  h: 8,
  q: 4,
  e: 2,
  s: 1
};

export const RHYTHM_EPSILON = 0.001;

export function rhythmUnitsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < RHYTHM_EPSILON;
}

export function rhythmUnitsLessOrEqual(left: number, right: number): boolean {
  return left < right || rhythmUnitsEqual(left, right);
}

export function rhythmUnitsGreater(left: number, right: number): boolean {
  return left > right && !rhythmUnitsEqual(left, right);
}

const TOKEN_ALIASES: Record<string, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  crotchet: 'q',
  eighth: 'e',
  quaver: 'e',
  '8th': 'e',
  sixteenth: 's',
  semiquaver: 's',
  '16th': 's',
  whole_rest: 'wr',
  half_rest: 'hr',
  quarter_rest: 'qr',
  eighth_rest: 'er',
  '8th_rest': 'er',
  sixteenth_rest: 'sr',
  '16th_rest': 'sr',
  rw: 'wr',
  rh: 'hr',
  rq: 'qr',
  re: 'er',
  rs: 'sr'
};

function sanitizeToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[\u3000,;|]+/g, '')
    .replace(/rest-/g, '')
    .replace(/-/g, '_');
}

interface RhythmTokenParts {
  base: RhythmBase;
  isRest: boolean;
  isHidden: boolean;
  dotted: boolean;
  triplet: boolean;
  accent: boolean;
  tieAfter: boolean;
}

function parseNormalizedRhythmTokenParts(token: string): RhythmTokenParts | null {
  const match = token.match(/^(w|h|q|e|s)(3)?(r|x)?(\.)?(\^)?(~)?$/);
  if (!match) return null;

  const [, baseToken, tripletFlag, markerFlag, dotFlag, accentFlag, tieFlag] = match;
  const triplet = Boolean(tripletFlag);
  if (triplet && baseToken !== 'q' && baseToken !== 'e') return null;
  if (triplet && dotFlag) return null;

  return {
    base: baseToken as RhythmBase,
    isRest: markerFlag === 'r',
    isHidden: markerFlag === 'x',
    dotted: Boolean(dotFlag),
    triplet,
    accent: Boolean(accentFlag),
    tieAfter: Boolean(tieFlag)
  };
}

export function normalizeRhythmToken(token: string): string {
  if (!token.trim()) return '';

  const trimmed = token.trim();
  const dotted = trimmed.includes('.');
  const accent = trimmed.includes('^');
  const tieAfter = trimmed.includes('~');
  const raw = sanitizeToken(trimmed.replace(/[.^~]/g, ''));
  const alias = TOKEN_ALIASES[raw] || raw;
  const hidden = alias.endsWith('x');
  const normalizedRaw = hidden ? alias.slice(0, -1) : alias;
  const match = normalizedRaw.match(/^(w|h|q|e|s)(3)?(r)?$/);

  if (!match) {
    return sanitizeToken(trimmed);
  }

  const [, base, tripletFlag, restFlag] = match;
  const triplet = Boolean(tripletFlag);
  if (triplet && base !== 'q' && base !== 'e') {
    return sanitizeToken(trimmed);
  }

  const isRest = Boolean(restFlag);
  const marker = hidden ? 'x' : isRest ? 'r' : '';
  return `${base}${triplet ? '3' : ''}${marker}${dotted && !triplet ? '.' : ''}${!isRest && !hidden && accent ? '^' : ''}${!isRest && !hidden && tieAfter ? '~' : ''}`;
}

export function normalizeRhythmInput(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeRhythmToken)
    .join(' ');
}

export function getEffectiveTimeSignature(timeSignature: string | undefined | null, fallback = '4/4'): string {
  const normalized = timeSignature?.trim();
  return normalized || fallback;
}

export function parseTimeSignature(timeSignature: string): {
  beats: number;
  beatValue: number;
  beatUnits: number;
  barUnits: number;
} {
  const match = timeSignature.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  const numerator = Number(match?.[1] || 4);
  const denominator = Number(match?.[2] || 4);
  const safeBeatValue = [1, 2, 4, 8, 16].includes(denominator) ? denominator : 4;
  const writtenBeatUnits = Math.max(1, Math.round(16 / safeBeatValue));

  // In compound meter, we group by dotted beats (3 written beats per pulse).
  const isCompound = numerator > 3 && numerator % 3 === 0 && (safeBeatValue === 8 || safeBeatValue === 16);
  const beatUnits = isCompound ? writtenBeatUnits * 3 : writtenBeatUnits;
  const beats = isCompound ? Math.floor(numerator / 3) : numerator;

  return {
    beats,
    beatValue: safeBeatValue,
    beatUnits,
    barUnits: numerator * writtenBeatUnits
  };
}

export function parseRhythmNotation(notation: string, timeSignature: string): ParsedRhythm {
  const { beats, beatValue, beatUnits, barUnits } = parseTimeSignature(timeSignature);
  const tokens = normalizeRhythmInput(notation).split(/\s+/).filter(Boolean);

  const events: RhythmEvent[] = [];
  const invalidTokens: string[] = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    const parsedToken = parseNormalizedRhythmTokenParts(token);
    if (!parsedToken) {
      invalidTokens.push(token);
      return;
    }

    const { base, isRest, isHidden, dotted, triplet, accent, tieAfter } = parsedToken;
    const durationUnits = triplet
      ? (base === 'q' ? 8 / 3 : 4 / 3)
      : BASE_UNITS[base] + (dotted ? BASE_UNITS[base] / 2 : 0);

    events.push({
      index,
      token,
      base,
      isRest,
      isHidden,
      dotted,
      triplet,
      accent,
      tieAfter,
      durationUnits,
      startUnit: cursor,
      endUnit: cursor + durationUnits,
      beamCount: base === 'e' ? 1 : base === 's' ? 2 : 0
    });

    cursor += durationUnits;
  });

  return {
    events,
    invalidTokens,
    totalUnits: cursor,
    visibleEndUnit: events.filter((event) => !event.isHidden).at(-1)?.endUnit || 0,
    beats,
    beatValue,
    beatUnits,
    barUnits,
    overflow: rhythmUnitsGreater(cursor, barUnits),
    underfilled: rhythmUnitsGreater(barUnits, cursor)
  };
}

function B(code: number): string {
  const codePoint = code < 0x100 ? 0xf000 + code : code;
  return String.fromCodePoint(codePoint);
}

function bachText(text: string): string {
  return [...text]
    .map((char) => {
      switch (char) {
        case '-':
          return B(45);
        case '=':
          return B(61);
        case '.':
          return B(46);
        default:
          return char;
      }
    })
    .join('');
}

function G(...parts: Array<number | string>): string {
  return parts
    .map((part) => (typeof part === 'number' ? B(part) : bachText(part)))
    .join('');
}

const NOTE_GLYPHS: Record<RhythmBase, string> = {
  w: B(172),
  h: B(176),
  q: B(177),
  e: B(196),
  s: B(197)
};

const REST_GLYPHS: Record<RhythmBase, string> = {
  w: B(229),
  h: B(228),
  q: B(163),
  e: B(224),
  s: B(225)
};

const BACH_DOT = B(46);

export function getRestGlyph(base: RhythmBase): string {
  return REST_GLYPHS[base];
}

export function getRhythmEventGlyph(event: Pick<RhythmEvent, 'base' | 'isRest' | 'dotted' | 'isHidden'>): string {
  if (event.isHidden) return '';
  const base = event.isRest ? REST_GLYPHS[event.base] : NOTE_GLYPHS[event.base];
  return event.dotted ? `${base}${BACH_DOT}` : base;
}

export function getShuffleTripletSlurGlyph(): string {
  return B(0x9e);
}

export function getShuffleSymbolGlyphs() {
  return {
    left: BACH_BEAM_PATTERN_MAP['--'].replace(/\s+/g, ''),
    rightQuarter: NOTE_GLYPHS.q,
    rightEighth: NOTE_GLYPHS.e
  };
}

function eventToGlyphText(event: RhythmEvent): string {
  return getRhythmEventGlyph(event);
}

export function getHeadCenterUnit(event: RhythmEvent): number {
  if (event.base === 'w') {
    return event.startUnit + (event.durationUnits / 2);
  }

  const offsetByBase: Record<RhythmBase, number> = {
    w: event.durationUnits / 2,
    h: 1.05,
    q: 0.78,
    e: 0.48,
    s: 0.34
  };

  const center = event.startUnit + Math.min(offsetByBase[event.base], Math.max(0.32, event.durationUnits - 0.16));
  return Math.min(event.endUnit - 0.14, center);
}

function getTieAnchorUnit(event: RhythmEvent, side: 'left' | 'right'): number {
  if (event.base === 'w') {
    const center = getHeadCenterUnit(event);
    return center + (side === 'right' ? 0.34 : -0.34);
  }

  const anchorByBase: Record<RhythmBase, { left: number; right: number }> = {
    w: { left: event.durationUnits / 2 - 0.34, right: event.durationUnits / 2 + 0.34 },
    h: { left: 0.62, right: 1.36 },
    q: { left: 0.42, right: 1.02 },
    e: { left: 0.18, right: 0.68 },
    s: { left: 0.1, right: 0.5 }
  };

  const offset = anchorByBase[event.base][side];
  const unit = event.startUnit + offset;
  const min = event.startUnit + 0.08;
  const max = event.endUnit - 0.08;
  return Math.min(max, Math.max(min, unit));
}

const BACH_BEAM_PATTERN_MAP: Record<string, string> = {
  '--': G(214, ' ', 61621, ' '),
  '---': G(214, ' - ', 61621, ' '),
  '----': G(214, ' - - ', 61621, ' '),
  '------': G(214, ' - - - - ', 61621, ' '),
  '-=': G(214, ' ', 61627, ' '),
  '-=-=': G(214, ' ', 61627, ' ', 214, ' ', 61627, ' '),
  '==': G(61622, ' ', 61627, ' '),
  '===': G(61622, ' = ', 61627, ' '),
  '====': G(61622, ' = = ', 61627, ' '),
  '======': G(61622, ' = = = = ', 61627, ' '),
  '=-': G(61622, ' ', 61621, ' '),
  '-==': G(214, ' ', 61673, ' ', 61627, ' '),
  '==-': G(61622, ' ', 61674, ' ', 61621, ' '),
  '--==': G(214, ' - ', 61673, ' ', 61627, ' '),
  '==--': G(61622, ' ', 61674, ' - ', 61621, ' '),
  '-==-': G(214, ' ', 61673, ' ', 61674, ' ', 61621, ' '),
  '-====': G(214, ' ', 61673, ' = = ', 61627, ' '),
  '====-': G(61622, ' = = ', 61674, ' ', 61621, ' '),
  '===-=': G(61622, ' = ', 61674, ' - ', 61627, ' '),
  '===-': G(61622, ' = ', 61674, ' ', 61621, ' '),
  '=-=': G(61622, ' - ', 61627, ' '),
  '-.=': G(214, '.', 61627, ' '),
  '=-.': G(61622, ' ', 61621, '.'),
  '-.-.': G(214, '.', 61621, '. '),
  '-.=-': G(214, '.', 61674, ' ', 61621, ' '),
  '-.==': G(214, '.= ', 61627, ' '),
  '-.===': G(214, '.', 61673, ' = ', 61627, ' '),
  '-.=-.=': G(214, '.', 61627, ' ', 214, '.', 61627, ' ')
};

function canBeamByRule(event: RhythmEvent): boolean {
  if (event.isRest || event.isHidden) return false;
  if (event.base !== 'e' && event.base !== 's') return false;
  // Dotted sixteenth is rare and hard to read in beamed pop charts; keep it standalone.
  if (event.base === 's' && event.dotted) return false;
  return true;
}

function beamPatternToken(event: RhythmEvent): string {
  if (event.base === 'e') {
    return event.dotted ? '-.' : '-';
  }
  return '=';
}

function pushFallbackRun(glyphs: RhythmDisplayGlyph[], run: RhythmEvent[]) {
  let i = 0;
  while (i < run.length) {
    const current = run[i];

    glyphs.push({
      text: eventToGlyphText(current),
      startUnit: current.startUnit,
      spanUnits: current.durationUnits
    });
    i += 1;
  }
}

export function rationalizeRhythmDisplay(
  notation: string,
  timeSignature: string,
  options?: {
    beamGroups?: boolean;
  }
): RationalizedRhythmDisplay {
  const parsed = parseRhythmNotation(notation, timeSignature);
  const glyphs: RhythmDisplayGlyph[] = [];
  const accents: RhythmAccentMark[] = [];
  const ties: RhythmTieArc[] = [];
  const beamGroups = options?.beamGroups ?? true;

  parsed.events.forEach((event, index) => {
    if (!event.isRest && !event.isHidden && event.accent) {
      accents.push({
        eventIndex: event.index,
        centerUnit: getHeadCenterUnit(event)
      });
    }

    if (!event.isRest && !event.isHidden && event.tieAfter) {
      const next = parsed.events[index + 1];
      if (next && !next.isRest && !next.isHidden) {
        const startHeadUnit = getHeadCenterUnit(event);
        const endHeadUnit = getHeadCenterUnit(next);
        const startUnit = getTieAnchorUnit(event, 'right');
        const endUnit = getTieAnchorUnit(next, 'left');
        const beatBoundary = Math.floor((event.endUnit + RHYTHM_EPSILON) / parsed.beatUnits) * parsed.beatUnits;
        const crossesBeat = rhythmUnitsGreater(beatBoundary, event.startUnit) && rhythmUnitsGreater(next.endUnit, beatBoundary);

        if (endUnit - startUnit > 0.12) {
          ties.push({
            eventIndex: event.index,
            startUnit,
            endUnit,
            startHeadUnit,
            endHeadUnit,
            crossesBeat,
            breakUnit: crossesBeat ? beatBoundary : undefined
          });
        }
      }
    }
  });

  let idx = 0;
  while (idx < parsed.events.length) {
    const current = parsed.events[idx];
    const beatStart = Math.floor(current.startUnit / parsed.beatUnits) * parsed.beatUnits;
    const beatEnd = beatStart + parsed.beatUnits;

    if (beamGroups && canBeamByRule(current)) {
      const run: RhythmEvent[] = [];
      let runIndex = idx;

      while (runIndex < parsed.events.length) {
        const event = parsed.events[runIndex];
        const previous = run[run.length - 1];

        if (!canBeamByRule(event)) break;
        if (!rhythmUnitsLessOrEqual(beatStart, event.startUnit) || !rhythmUnitsLessOrEqual(event.endUnit, beatEnd)) break;
        if (previous && !rhythmUnitsEqual(previous.endUnit, event.startUnit)) break;

        run.push(event);
        runIndex += 1;
      }

      if (run.length >= 2) {
        const pattern = run.map(beamPatternToken).join('');
        const bachGlyph = BACH_BEAM_PATTERN_MAP[pattern];

        if (bachGlyph) {
          glyphs.push({
            text: bachGlyph,
            startUnit: run[0].startUnit,
            spanUnits: run[run.length - 1].endUnit - run[0].startUnit
          });
        } else {
          pushFallbackRun(glyphs, run);
        }

        idx = runIndex;
        continue;
      }
    }

    glyphs.push({
      text: eventToGlyphText(current),
      startUnit: current.startUnit,
      spanUnits: current.durationUnits
    });
    idx += 1;
  }

  return { parsed, glyphs, accents, ties };
}
