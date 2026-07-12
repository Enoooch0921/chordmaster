/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Song, Section, Bar, Key, AppLanguage, NavigationMarker } from '../types';
import { getTransposeOffset, transposeChord, getSectionColor, getNashvilleNumber, isNashville, parseNashvilleToChord, getPlayKey, transposeKeyPreferFlats, transposeKeyWithPreference, normalizeKeySpelling } from '../utils/musicUtils';
import { getChordFontFamily } from '../constants/chordFonts';
import { getNashvilleFontFamily } from '../constants/nashvilleFonts';
import { getUiCopy, localizeSectionTitle } from '../constants/i18n';
import { Repeat, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Jianpu from './Jianpu';
import RhythmNotation from './RhythmNotation';
import { convertRelativeJianpuToAbsoluteNotation, findJianpuNoteRanges, findJianpuPlaceholderRanges, getCanonicalJianpuBeatTokens, serializeJianpuBeatTokens } from '../utils/jianpuUtils';
import { hasMeaningfulChordContent, hasVisibleChordTokens } from '../utils/barUtils';
import { getChordDisplaySlotEntries } from '../utils/chordSlots';
import { getEffectiveTimeSignature, getRestGlyph, getShuffleSymbolGlyphs, parseRhythmNotation, parseTimeSignature, rhythmEndsWithTieToNext } from '../utils/rhythmUtils';
import { DEFAULT_RHYTHM_MARK_COLOR, DEFAULT_SPECIAL_CHORD_COLOR, DEFAULT_UNISON_MARK_COLOR, getAnnotationColorOption } from '../constants/annotationColors';

interface FormattedChordProps {
  chordString: string;
  compactModifier?: boolean;
  nashvilleFontFamily?: string;
  chordFontFamily?: string;
  compactSlashBass?: boolean;
  abbreviateMajorQuality?: boolean;
  color?: string;
  specialLabel?: string;
  // For the multi-measure rest symbol: how many bar columns it spans. >1 widens
  // the thick-bar glyph so it stretches across the absorbed empty bars.
  restSpan?: number;
}

const splitChordQualityDisplay = (quality: string) => {
  const trimmedQuality = quality.trim();
  if (!trimmedQuality) {
    return { qualityText: '', extensionTokens: [] as string[] };
  }

  const extensionMatch = trimmedQuality.match(/((?:[#b]\d+)+)$/i);
  if (!extensionMatch || extensionMatch.index === undefined || extensionMatch.index === 0) {
    return { qualityText: trimmedQuality, extensionTokens: [] as string[] };
  }

  const tokens = extensionMatch[1].match(/[#b]\d+/gi) || [];
  if (tokens.length === 0) {
    return { qualityText: trimmedQuality, extensionTokens: [] as string[] };
  }

  return {
    qualityText: trimmedQuality.slice(0, extensionMatch.index),
    extensionTokens: tokens
  };
};

const getMajorQualitySuffix = (qualityText: string) => {
  const match = qualityText.match(/^maj(.*)$/i);
  return match ? match[1] : null;
};

const MajorQualityGlyph: React.FC<{ qualityText: string; numeric?: boolean; abbreviate?: boolean }> = ({ qualityText, numeric = false, abbreviate = false }) => {
  const suffix = getMajorQualitySuffix(qualityText);
  if (suffix === null || !abbreviate) {
    return <>{qualityText}</>;
  }

  return (
    <span className="inline-flex items-baseline tracking-[-0.04em]">
      <span className={numeric ? 'text-[1.12em] leading-none' : 'text-[1.16em] leading-none'}>△</span>
      {suffix && <span className="-ml-[0.12em] leading-none">{suffix}</span>}
    </span>
  );
};

const getBarDisplayLabel = (bar?: Bar) => (
  bar?.label?.trim() || bar?.riffLabel?.trim() || bar?.rhythmLabel?.trim() || ''
);

const isWholeRestChord = (chordString?: string) => {
  const trimmed = chordString?.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  return trimmed === '0w' || trimmed.toUpperCase() === 'RW' || normalized === 'restw' || normalized === 'whole_rest';
};

// Matches the multi-measure rest token, with an optional count: "||" or "|3|".
// The rest symbol can span following empty bars in the same row (see restPlan).
const MULTI_MEASURE_REST_PATTERN = /^\|(\d{0,3})\|$/;

const getMultiMeasureRestCount = (chordString?: string) => {
  const trimmed = chordString?.trim();
  if (!trimmed) return 0;
  const match = trimmed.match(MULTI_MEASURE_REST_PATTERN);
  if (!match) return 0;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

// True for the symbol whether or not it carries a count ("||" or "|3|").
const isMultiMeasureRestChord = (chordString?: string) => {
  const trimmed = chordString?.trim();
  return !!trimmed && MULTI_MEASURE_REST_PATTERN.test(trimmed);
};

const getPreviewRiffNotation = (notation: string | undefined, timeSignature: string) => {
  const trimmed = notation?.trim();
  if (!trimmed) return undefined;

  // Preserve the legacy single-line marker for "this bar is unused".
  if (trimmed === '-') {
    return trimmed;
  }

  return serializeJianpuBeatTokens(getCanonicalJianpuBeatTokens(trimmed, timeSignature));
};

const hasVisiblePreviewRiff = (notation: string | undefined) => {
  const trimmed = notation?.trim();
  if (!trimmed) return false;
  if (trimmed === '-') return true;
  return findJianpuNoteRanges(trimmed).length > 0 || findJianpuPlaceholderRanges(trimmed).length > 0;
};

const getOccupiedTokenSpan = (tokens: string[]) => {
  const firstIndex = tokens.findIndex((token) => token.trim());
  if (firstIndex === -1) {
    return {
      firstIndex: -1,
      lastIndex: -1,
      span: 0,
      trimmedTokens: [] as string[]
    };
  }

  let lastIndex = firstIndex;
  for (let index = tokens.length - 1; index >= firstIndex; index -= 1) {
    if (tokens[index]?.trim()) {
      lastIndex = index;
      break;
    }
  }

  return {
    firstIndex,
    lastIndex,
    span: lastIndex - firstIndex + 1,
    trimmedTokens: tokens.slice(firstIndex, lastIndex + 1)
  };
};

const formatEndingDisplay = (ending: string | undefined) => {
  const trimmed = ending?.trim();
  if (!trimmed) return '';
  if (/[.a-z]/i.test(trimmed)) return trimmed;

  const numericParts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (numericParts.length > 1 && numericParts.every((part) => /^\d+$/.test(part))) {
    return numericParts.map((part) => `${part}.`).join(', ');
  }

  return /^\d+$/.test(trimmed) ? `${trimmed}.` : trimmed;
};

const formatBarAnnotation = (annotation: string) => (
  annotation.split(' ').map(word => {
    const upper = word.toUpperCase();
    const abbreviations = ['AG', 'PNO', 'EG1', 'EG2', 'A.GTR', 'E.GTR', 'EG', 'GTR', 'DR', 'BS', 'KEY'];
    if (abbreviations.includes(upper)) return upper;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ')
);

const getSectionBadgeTone = (accent: string) => {
  switch (accent) {
    case 'blue':
      return {
        backgroundColor: 'rgba(219, 234, 254, 0.96)',
        borderColor: 'rgba(30, 64, 175, 0.92)',
        color: 'rgba(30, 64, 175, 0.96)'
      };
    case 'rose':
      return {
        backgroundColor: 'rgba(255, 228, 230, 0.96)',
        borderColor: 'rgba(159, 18, 57, 0.92)',
        color: 'rgba(159, 18, 57, 0.96)'
      };
    case 'amber':
      return {
        backgroundColor: 'rgba(254, 243, 199, 0.96)',
        borderColor: 'rgba(146, 64, 14, 0.92)',
        color: 'rgba(146, 64, 14, 0.96)'
      };
    case 'emerald':
      return {
        backgroundColor: 'rgba(209, 250, 229, 0.96)',
        borderColor: 'rgba(6, 95, 70, 0.92)',
        color: 'rgba(6, 95, 70, 0.96)'
      };
    case 'cyan':
      return {
        backgroundColor: 'rgba(207, 250, 254, 0.96)',
        borderColor: 'rgba(14, 116, 144, 0.92)',
        color: 'rgba(14, 116, 144, 0.96)'
      };
    case 'fuchsia':
      return {
        backgroundColor: 'rgba(250, 232, 255, 0.96)',
        borderColor: 'rgba(162, 28, 175, 0.92)',
        color: 'rgba(162, 28, 175, 0.96)'
      };
    case 'violet':
      return {
        backgroundColor: 'rgba(237, 233, 254, 0.96)',
        borderColor: 'rgba(109, 40, 217, 0.92)',
        color: 'rgba(109, 40, 217, 0.96)'
      };
    case 'slate':
      return {
        backgroundColor: 'rgba(226, 232, 240, 0.94)',
        borderColor: 'rgba(30, 41, 59, 0.9)',
        color: 'rgba(30, 41, 59, 0.94)'
      };
    default:
      return {
        backgroundColor: 'rgba(224, 231, 255, 0.96)',
        borderColor: 'rgba(55, 48, 163, 0.92)',
        color: 'rgba(55, 48, 163, 0.96)'
      };
  }
};

const getSectionBadgeStyle = (accent: string): React.CSSProperties => {
  const tone = getSectionBadgeTone(accent);
  return {
    backgroundColor: tone.backgroundColor,
    borderColor: tone.borderColor,
    color: tone.color
  };
};

const getChordMarkTextColor = (bar: Bar | undefined, chordIndex: number) => {
  const mark = bar?.chordMarks?.[chordIndex];
  const colorId = mark?.color ?? (mark?.special ? DEFAULT_SPECIAL_CHORD_COLOR : undefined);
  return colorId ? getAnnotationColorOption(colorId).text : undefined;
};

const getChordSpecialLabel = (bar: Bar | undefined, chordIndex: number, language: AppLanguage) => (
  bar?.chordMarks?.[chordIndex]?.special ? (language === 'zh' ? '特' : 'S') : undefined
);

const getRhythmMarkTextColor = (bar: Bar | undefined) => (
  bar?.rhythmMark ? getAnnotationColorOption(bar.rhythmMark.color ?? DEFAULT_RHYTHM_MARK_COLOR).text : undefined
);

const getUnisonMarkStyle = (bar: Bar | undefined): React.CSSProperties | undefined => {
  if (!bar?.unisonMark?.enabled) return undefined;
  const tone = getAnnotationColorOption(bar.unisonMark.color ?? DEFAULT_UNISON_MARK_COLOR);
  return {
    backgroundColor: tone.soft,
    borderColor: tone.border,
    color: tone.text
  };
};

const FormattedChord: React.FC<FormattedChordProps> = ({
  chordString,
  compactModifier = false,
  nashvilleFontFamily,
  chordFontFamily,
  compactSlashBass = false,
  abbreviateMajorQuality = false,
  color,
  specialLabel,
  restSpan = 1
}) => {
  const markStyle = color
    ? ({ '--chord-mark-color': color } as React.CSSProperties)
    : undefined;
  const withChordMark = (content: React.ReactElement) => {
    if (!color && !specialLabel) {
      return content;
    }

    return (
      <div className={`relative inline-flex min-w-0 ${color ? 'chord-colorized' : ''}`} style={markStyle}>
        {content}
        {specialLabel && (
          <span className="pointer-events-none absolute -right-2.5 -top-3 z-30 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-[3px] text-[8px] font-black leading-none text-amber-800 shadow-[0_1px_2px_rgba(146,64,14,0.16)]">
            {specialLabel}
          </span>
        )}
      </div>
    );
  };

  const multiMeasureRestCount = getMultiMeasureRestCount(chordString);
  if (isMultiMeasureRestChord(chordString)) {
    return withChordMark(
      <div className="flex h-full w-full items-center justify-center">
        <div className={`flex flex-col items-center leading-none text-gray-900 ${restSpan > 1 ? 'w-4/5' : 'w-1/3 min-w-[42px]'}`}>
          {/* Always reserve the count row so the bar glyph lands at the same
              (vertically centered) spot whether or not a count is shown. */}
          <span className={`text-[16px] font-semibold tabular-nums ${multiMeasureRestCount > 0 ? '' : 'invisible'}`}>
            {multiMeasureRestCount > 0 ? multiMeasureRestCount : 0}
          </span>
          <svg
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
            className="mt-[2px] h-[18px] w-full"
            aria-hidden="true"
          >
            <line x1="3" y1="1" x2="3" y2="19" stroke="currentColor" strokeWidth={restSpan > 1 ? 2 : 1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <line x1="97" y1="1" x2="97" y2="19" stroke="currentColor" strokeWidth={restSpan > 1 ? 2 : 1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <rect x="3" y="7" width="94" height="6" fill="currentColor" />
          </svg>
        </div>
      </div>
    );
  }

  if (chordString === '%') {
    return withChordMark(
      <div className="flex items-center justify-center w-full h-full">
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-gray-400" fill="currentColor">
          <circle cx="9" cy="9" r="1.2" />
          <circle cx="15" cy="15" r="1.2" />
          <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (chordString === '/') {
    // Beat slash: keep its own glyph box so it aligns with chord content instead of sticking to the top edge.
    return withChordMark(
      <div className="relative inline-flex h-[1.02em] w-[0.92em] items-center justify-center translate-y-[1px]">
        <svg viewBox="0 0 16 16" className="h-[0.92em] w-[0.7em] text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M3 13L13 3" />
        </svg>
      </div>
    );
  }

  // Detect push/pull/accent/fermata markers
  let marker: 'push' | 'pull' | null = null;
  let accent = false;
  let fermata = false;
  let cleanChord = chordString;

  // Extract modifiers from the end
  while (cleanChord.endsWith('<') || cleanChord.endsWith('>') || cleanChord.endsWith('^') || cleanChord.endsWith('~')) {
    if (cleanChord.endsWith('<')) {
      marker = 'push';
      cleanChord = cleanChord.slice(0, -1);
    } else if (cleanChord.endsWith('>')) {
      marker = 'pull';
      cleanChord = cleanChord.slice(0, -1);
    } else if (cleanChord.endsWith('^')) {
      accent = true;
      cleanChord = cleanChord.slice(0, -1);
    } else if (cleanChord.endsWith('~')) {
      fermata = true;
      cleanChord = cleanChord.slice(0, -1);
    }
  }

  const markerWrapperClass = compactModifier
    ? 'absolute -top-[15px] left-1/2 -translate-x-1/2 w-7 h-5 z-20 pointer-events-none'
    : 'absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-6 pointer-events-none';
  const accentWrapperClass = compactModifier
    ? `absolute ${marker ? '-top-[20px]' : '-top-[15px]'} left-1/2 -translate-x-1/2 w-4 h-4 z-20 pointer-events-none`
    : `absolute ${marker ? '-top-9' : '-top-5'} left-1/2 -translate-x-1/2 w-4 h-4 pointer-events-none`;
  const fermataWrapperClass = compactModifier
    ? `absolute ${marker ? '-top-[24px]' : accent ? '-top-[28px]' : '-top-[18px]'} left-1/2 -translate-x-1/2 z-20 pointer-events-none`
    : `absolute ${marker ? '-top-8' : accent ? '-top-10' : '-top-6'} left-1/2 -translate-x-1/2 pointer-events-none`;

  const renderModifiers = () => (
    <>
      {fermata && (
        <div className={fermataWrapperClass}>
          <span
            className="font-rhythm text-[22px] leading-none text-gray-900 select-none whitespace-pre"
            style={{ fontVariantLigatures: 'normal', fontFeatureSettings: '"liga" 1, "calt" 1' }}
            aria-hidden="true"
          >
            ß
          </span>
        </div>
      )}
      {accent && (
        <div className={accentWrapperClass}>
          <svg viewBox="0 0 24 24" className="w-full h-full text-gray-900" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8l12 4-12 4" />
          </svg>
        </div>
      )}
      {marker === 'push' && (
        <motion.div 
          initial={{ scale: 0, opacity: 0, x: 5, y: 5 }}
          animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
          className={markerWrapperClass}
        >
          <svg viewBox="0 0 32 24" className="w-full h-full text-gray-900 overflow-visible" fill="none" stroke="currentColor" strokeWidth={compactModifier ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 20c0-8 4-10 12-10" />
            <path d="M25 7l3 3-3 3" />
          </svg>
        </motion.div>
      )}
      {marker === 'pull' && (
        <motion.div 
          initial={{ scale: 0, opacity: 0, x: -5, y: 5 }}
          animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
          className={markerWrapperClass}
        >
          <svg viewBox="0 0 32 24" className="w-full h-full text-gray-900 overflow-visible" fill="none" stroke="currentColor" strokeWidth={compactModifier ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 20c0-8-4-10-12-10" />
            <path d="M7 7l-3 3 3 3" />
          </svg>
        </motion.div>
      )}
    </>
  );

  const normalizedRest = cleanChord.toLowerCase();
  const isWholeRest = isWholeRestChord(cleanChord);
  const isHalfRest = cleanChord === '0h' || cleanChord.toUpperCase() === 'RH' || normalizedRest === 'resth' || normalizedRest === 'half_rest';
  const isQuarterRest = cleanChord === '0' || cleanChord.toUpperCase() === 'R' || normalizedRest === 'rest' || normalizedRest === 'quarter_rest';
  const isEighthRest = cleanChord === '0_' || cleanChord.toUpperCase() === 'R_' || normalizedRest === 'rest_' || normalizedRest === 'eighth_rest' || normalizedRest === '8th_rest';
  const renderNumericDegree = ({
    degree,
    accidentalGlyph = '',
    compact = false,
    degreeClassName,
    degreeStyle
  }: {
    degree: string;
    accidentalGlyph?: string;
    compact?: boolean;
    degreeClassName: string;
    degreeStyle?: React.CSSProperties;
  }) => (
    <span
      className="relative inline-flex items-end leading-none"
      style={accidentalGlyph ? { paddingLeft: compact ? '0.18em' : '0.22em' } : undefined}
    >
      {accidentalGlyph && (
        <span
          className={`absolute left-0 top-0 leading-none ${
            compact
              ? 'text-[7px] -translate-x-[0.02em] -translate-y-[0.16em]'
              : 'text-xs -translate-x-[0.02em] -translate-y-[0.28em]'
          }`}
          style={degreeStyle}
        >
          {accidentalGlyph}
        </span>
      )}
      <span className={degreeClassName} style={degreeStyle}>
        {degree}
      </span>
    </span>
  );

  if (isWholeRest || isHalfRest || isQuarterRest || isEighthRest) {
    const restGlyph = isWholeRest
      ? getRestGlyph('w')
      : isHalfRest
        ? getRestGlyph('h')
        : isQuarterRest
          ? getRestGlyph('q')
          : getRestGlyph('e');

    return withChordMark(
      <div className="relative inline-flex items-center justify-center w-full h-full">
        <span
          className="font-rhythm text-[22px] text-gray-900 leading-none select-none whitespace-pre"
          style={{
            transform: isWholeRest ? 'translateY(-2px)' : isHalfRest ? 'translateY(0.5px)' : isQuarterRest ? 'translateY(-1px)' : 'translateY(1px)'
          }}
        >
          {restGlyph}
        </span>
        {renderModifiers()}
      </div>
    );
  }

  const slashOnlyMatch = cleanChord.match(/^\/([b#]?)([A-G1-7])([#b]?)$/);
  if (slashOnlyMatch) {
    const [, bassPrefixAccidental, bassRoot, bassSuffixAccidental] = slashOnlyMatch;
    const bassAccidental = bassPrefixAccidental || bassSuffixAccidental;
    const isNumericBass = /^[1-7]$/.test(bassRoot);
    const slashOnlyTextStyle = /^[1-7]$/.test(bassRoot) && nashvilleFontFamily
      ? { fontFamily: nashvilleFontFamily, fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1, "tnum" 1' }
      : chordFontFamily
        ? { fontFamily: chordFontFamily }
        : undefined;

    return (
      withChordMark(<div className="relative inline-block">
        <span className="inline-flex items-end gap-[0.02em] text-gray-900 font-bold font-serif whitespace-nowrap" style={slashOnlyTextStyle}>
          <span className="text-lg font-bold text-gray-900 leading-none">/</span>
          {isNumericBass
            ? renderNumericDegree({
                degree: bassRoot,
                accidentalGlyph: bassAccidental,
                compact: compactSlashBass,
                degreeClassName: compactSlashBass ? 'text-[14px] leading-none' : 'text-lg leading-none'
              })
            : (
                <span className={`relative inline-flex items-end leading-none ml-[0.04em] ${bassAccidental ? 'pr-[0.12em]' : ''}`}>
                  <span className={compactSlashBass ? 'text-[14px] leading-none' : 'text-lg leading-none'}>{bassRoot}</span>
                  {bassAccidental && (
                    <span className={`absolute left-full top-0 ${compactSlashBass ? 'text-[9px] -translate-x-[0.18em] -translate-y-[0.26em]' : 'text-xs -translate-x-[0.22em] -translate-y-[0.38em]'}`}>
                      {bassAccidental}
                    </span>
                  )}
                </span>
              )}
        </span>
        {renderModifiers()}
      </div>)
    );
  }

  // Parse chord: optional accidental + Root(A-G or 1-7) + optional accidental + Quality(...) / optional accidental + Bass(A-G or 1-7) + optional accidental
  const match = cleanChord.match(/^([b#]?)([A-G1-7])([#b]?)([^/]*)(?:\/([b#]?)([A-G1-7])([#b]?))?$/);

  if (!match) {
    return withChordMark(
      <div className="relative inline-block">
        <span className="text-lg font-bold font-serif tracking-tight text-gray-900" style={chordFontFamily ? { fontFamily: chordFontFamily } : undefined}>{cleanChord}</span>
        {renderModifiers()}
      </div>
    );
  }

  const [, prefixAccidental, root, suffixAccidental, quality, bassPrefixAccidental, bassRoot = '', bassSuffixAccidental] = match;
  const accidental = prefixAccidental || suffixAccidental;
  const bass = bassRoot ? `${bassPrefixAccidental || ''}${bassRoot}${bassSuffixAccidental || ''}` : '';
  const bassAccidental = bassPrefixAccidental || bassSuffixAccidental || '';
  const { qualityText, extensionTokens } = splitChordQualityDisplay(quality);
  const hasExtensionTokens = extensionTokens.length > 0;
  const symbolicQualityMatch = qualityText.match(/^([°ø])(\d*)$/);
  const symbolicQuality = symbolicQualityMatch
    ? { symbol: symbolicQualityMatch[1], extension: symbolicQualityMatch[2] }
    : null;
  const isNumericRoot = /^[1-7]$/.test(root);
  const numericFigureStyle = isNumericRoot
    ? ({ fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1, "tnum" 1' } as const)
    : undefined;
  const qualityVisualLength = (() => {
    if (!qualityText) return 0;
    if (symbolicQuality) {
      return 1 + (symbolicQuality.extension?.length ?? 0);
    }
    const majSuffix = getMajorQualitySuffix(qualityText);
    if (majSuffix !== null) {
      return 1 + majSuffix.length;
    }
    return qualityText.length;
  })();
  const numericQualityReserveEm = isNumericRoot && qualityText
    ? Math.max(0.34, qualityVisualLength * 0.42)
    : 0;
  const numericBassReserveEm = isNumericRoot && bass
    ? Math.max(0.7, (bassRoot.length + (bassAccidental ? 1 : 0)) * 0.42 + 0.46)
    : 0;
  const numericExtensionReserveEm = isNumericRoot && hasExtensionTokens
    ? Math.max(0.88, extensionTokens.join(' ').length * 0.28 + 0.54)
    : 0;
  const numericSuffixReserveEm = isNumericRoot
    ? numericQualityReserveEm + numericBassReserveEm + numericExtensionReserveEm
    : 0;
  const numericRootStyle = isNumericRoot
    ? ({ ...numericFigureStyle } as const)
    : undefined;
  const numericChordOffsetClass = '';
  const numericRootSizeClass = 'text-lg';
  // The quality suffix (m7, 7, dim, sus…) is anchored by box-bottom (bottom-0 +
  // items-end), but a 10–11px suffix has a shorter descender than the 18px root,
  // so its baseline ends up ~0.17em low. Nudge non-symbolic suffixes up so their
  // baseline sits flush with the root's. (Symbolic °/ø keep their own offset.)
  const numericQualityOffsetClass = symbolicQuality ? '' : '-translate-y-[0.17em]';
  const numericQualityTextClass = qualityText === 'm'
    ? 'text-[11px] leading-none'
    : symbolicQuality
      ? 'leading-none'
    : /^dim/i.test(qualityText)
      ? 'text-[10px] leading-none'
      : 'text-[10px] leading-none';
  const numericQualityStyle = numericFigureStyle;
  const symbolicQualityOffsetClass = hasExtensionTokens
    ? 'translate-y-[0.22em]'
    : 'translate-y-[0.08em]';
  // Quality suffix (m7, maj7, 7, sus...) sits at the lower-right with its baseline
  // flush against the chord root (no vertical raise).
  const plainQualityClass = qualityText === 'm'
    ? 'text-[12px]'
    : /^sus/i.test(qualityText)
      ? 'text-[11px]'
      : 'text-[10px]';
  // Parenthetical alterations (b5, #5, b9, #11...) are stacked directly above the
  // quality suffix; this small offset fine-tunes the gap above it.
  const extensionRaiseClass = '-translate-y-[0.2em]';
  if (isNumericRoot) {
    const numericTextStyle = {
      ...(numericSuffixReserveEm > 0 ? { paddingRight: `${numericSuffixReserveEm}em` } : {}),
      ...(nashvilleFontFamily ? { fontFamily: nashvilleFontFamily } : {})
    };

    return withChordMark(
      <div className={`relative inline-block ${numericChordOffsetClass}`}>
        <span
          className="relative inline-flex items-baseline text-gray-900 font-bold font-serif whitespace-nowrap"
          style={numericTextStyle}
        >
          <span className="relative inline-block leading-none text-lg">
            {renderNumericDegree({
              degree: root,
              accidentalGlyph: accidental,
              degreeClassName: `${numericRootSizeClass} leading-none origin-bottom`,
              degreeStyle: numericRootStyle
            })}
            {qualityText && (
              <span className="absolute left-full bottom-0 ml-[0.03em] inline-flex items-end whitespace-nowrap">
                <span className={`relative inline-flex items-end ${numericQualityOffsetClass} ${numericQualityTextClass}`.trim()} style={numericQualityStyle}>
                  {symbolicQuality ? (
                    <span className={`inline-flex ${symbolicQualityOffsetClass} items-baseline leading-none`}>
                      <span className="text-[16px] leading-none">{symbolicQuality.symbol}</span>
                      {symbolicQuality.extension && (
                        <span className="text-[8px] leading-none -ml-[0.04em] -translate-y-[0.5em]">
                          {symbolicQuality.extension}
                        </span>
                      )}
                    </span>
                  ) : (
                    <MajorQualityGlyph qualityText={qualityText} numeric abbreviate={abbreviateMajorQuality} />
                  )}
                  {hasExtensionTokens && (
                      <span
                        className={`absolute bottom-full left-1/2 -translate-x-1/2 ${extensionRaiseClass} inline-flex items-baseline text-[7px] leading-none tracking-[-0.02em] whitespace-nowrap`}
                      >
                      <span>(</span>
                      {extensionTokens.map((token, index) => {
                        const accidentalGlyph = token[0];
                        const degreeText = token.slice(1);
                        return (
                          <span key={`${token}-${index}`} className="inline-flex items-baseline">
                            <span className={`relative ${accidentalGlyph === '#' ? '-top-[0.14em]' : '-top-[0.02em]'}`}>
                              {accidentalGlyph}
                            </span>
                            <span style={numericFigureStyle}>{degreeText}</span>
                            {index < extensionTokens.length - 1 && <span className="ml-[0.14em]" />}
                          </span>
                        );
                      })}
                      <span>)</span>
                    </span>
                  )}
                </span>
              </span>
            )}
            {bass && (
              <span
                className="absolute left-full bottom-0 translate-y-[0.28em] inline-flex items-end gap-[0.03em] whitespace-nowrap"
                style={qualityText ? { marginLeft: `${numericQualityReserveEm + 0.04}em` } : { marginLeft: '0.02em' }}
              >
                <span className="text-lg font-bold text-gray-900 leading-none">/</span>
                {renderNumericDegree({
                  degree: bassRoot,
                  accidentalGlyph: bassAccidental,
                  compact: compactSlashBass,
	                  degreeClassName: compactSlashBass ? 'text-[16px] leading-none' : 'text-lg leading-none',
                  degreeStyle: numericFigureStyle
                })}
              </span>
            )}
            {!qualityText && !bass && hasExtensionTokens && (
              <span className="absolute left-full top-[-0.28em] ml-[0.08em] text-[8px] leading-none tracking-[-0.02em] whitespace-nowrap">
                ({extensionTokens.join(' ')})
              </span>
            )}
          </span>
        </span>
        {renderModifiers()}
      </div>
    );
  }

  return withChordMark(
    <div className="relative inline-block">
      <span className="inline-flex items-baseline text-gray-900 font-bold font-serif whitespace-nowrap" style={chordFontFamily ? { fontFamily: chordFontFamily } : undefined}>
        <span className="text-lg leading-none">{root}</span>
        {accidental && <span className="text-xs -translate-y-1.5 ml-[0.5px]">{accidental}</span>}
        {qualityText && (
          <span className="relative inline-flex items-baseline leading-none ml-[0.5px]">
            {symbolicQuality ? (
              <span className={`inline-flex ${symbolicQualityOffsetClass} items-baseline leading-none`}>
                <span className="text-[18px] leading-none">{symbolicQuality.symbol}</span>
                {symbolicQuality.extension && (
                  <span className="text-[10px] leading-none -ml-[0.04em] -translate-y-[0.55em]">
                    {symbolicQuality.extension}
                  </span>
                )}
              </span>
            ) : (
              <span className={`${plainQualityClass} leading-none`}>
                <MajorQualityGlyph qualityText={qualityText} abbreviate={abbreviateMajorQuality} />
              </span>
            )}
            {hasExtensionTokens && (
                <span
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 ${extensionRaiseClass} inline-flex items-baseline text-[8px] leading-none tracking-[-0.02em] whitespace-nowrap`}
                >
                <span>(</span>
                {extensionTokens.map((token, index) => {
                  const accidentalGlyph = token[0];
                  const degreeText = token.slice(1);
                  return (
                    <span key={`${token}-${index}`} className="inline-flex items-baseline">
                      <span className={`relative ${accidentalGlyph === '#' ? '-top-[0.14em] -mr-[0.08em]' : '-top-[0.02em] -mr-[0.04em]'}`}>
                        {accidentalGlyph}
                      </span>
                      <span>{degreeText}</span>
                      {index < extensionTokens.length - 1 && <span className="ml-[0.14em]" />}
                    </span>
                  );
                })}
                <span>)</span>
              </span>
            )}
          </span>
        )}
        {!qualityText && hasExtensionTokens && (
          <span className="text-[8px] -translate-y-[1.15em] ml-[0.15px] tracking-[-0.02em]">
            ({extensionTokens.join(' ')})
          </span>
        )}
        {bass && (
          <span className="inline-flex items-end ml-[0.01em]">
            <span className="text-lg font-bold text-gray-900 leading-none">/</span>
            <span className={`relative inline-flex items-end leading-none ml-[0.04em] ${bassAccidental ? 'pr-[0.12em]' : ''}`}>
	              <span className={compactSlashBass ? 'text-[16px] leading-none' : 'text-lg leading-none'}>{bassRoot}</span>
	              {bassAccidental && (
	                <span className={`absolute left-full top-0 ${compactSlashBass ? 'text-[10px] -translate-x-[0.18em] -translate-y-[0.3em]' : 'text-xs -translate-x-[0.22em] -translate-y-[0.38em]'}`}>
	                  {bassAccidental}
	                </span>
	              )}
            </span>
          </span>
        )}
      </span>
      {renderModifiers()}
    </div>
  );
};

const getConsecutiveKeySequence = (keys: Key[]) => (
  keys.reduce<Key[]>((sequence, key) => {
    if (sequence[sequence.length - 1] !== key) {
      sequence.push(key);
    }
    return sequence;
  }, [])
);

const FormattedKeySequence: React.FC<{
  keys: Key[];
  nashvilleFontFamily?: string;
  chordFontFamily?: string;
}> = ({ keys, nashvilleFontFamily, chordFontFamily }) => (
  <span className="inline-flex items-baseline whitespace-nowrap">
    {keys.map((key, index) => (
      <React.Fragment key={`${key}-${index}`}>
        {index > 0 && <span className="mx-1 text-gray-900 font-bold">-</span>}
        <FormattedChord
          chordString={key}
          nashvilleFontFamily={nashvilleFontFamily}
          chordFontFamily={chordFontFamily}
        />
      </React.Fragment>
    ))}
  </span>
);

export type ChordSheetElementField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'sectionName' | 'marker';
export type ChordSheetMetaField = 'title' | 'credits' | 'key' | 'tempo' | 'timeSignature' | 'capo' | 'groove';

export interface PreviewAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ChordSheetElementClickMeta {
  anchorKey: string;
  anchorRect: PreviewAnchorRect;
}

export const getChordSheetMetaAnchorKey = (
  previewIdentity: string | null | undefined,
  field: ChordSheetMetaField
) => `${previewIdentity || 'preview'}|meta|${field}`;

const getPreviewAnchorRect = (element: HTMLElement): PreviewAnchorRect => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
};

const VALUE_ANCHORED_META_FIELDS = new Set<ChordSheetMetaField>(['key', 'tempo', 'timeSignature']);

interface ChordSheetProps {
  song: Song;
  language: AppLanguage;
  currentKey: Key;
  transposeFromOriginal?: boolean;
  onElementClick?: (sIdx: number, bIdx: number, field: ChordSheetElementField) => void;
  onMetaClick?: (field: ChordSheetMetaField, meta: ChordSheetElementClickMeta) => void;
  onAddBarClick?: (sIdx: number) => void;
  highlightedSectionIds?: string[];
  activeSectionId?: string | null;
  activeBar?: { sIdx: number; bIdx: number } | null;
  previewIdentity?: string | null;
}

const ShuffleSymbol: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`relative inline-block h-[1em] w-[76px] overflow-visible align-middle text-gray-900 ${className}`} aria-label="Shuffle" role="img">
    <span className="absolute left-0 top-1/2 inline-flex -translate-y-[56%] items-end gap-[7px] overflow-visible">
      <span className="relative inline-flex h-[22px] items-end overflow-visible">
        <span
          className="font-rhythm text-[17px] leading-none whitespace-pre"
          style={{ fontVariantLigatures: 'normal', fontFeatureSettings: '"liga" 1, "calt" 1' }}
        >
          {getShuffleSymbolGlyphs().left}
        </span>
      </span>
      <span className="pb-[4px] text-[15px] leading-none font-semibold">=</span>
      <span className="relative inline-flex h-[30px] w-[34px] items-end overflow-visible">
        <span className="absolute left-0 bottom-0 font-rhythm text-[17px] leading-none whitespace-pre" style={{ fontVariantLigatures: 'normal', fontFeatureSettings: '"liga" 1, "calt" 1' }}>
          {getShuffleSymbolGlyphs().rightQuarter}
        </span>
        <span className="absolute left-[15px] bottom-0 font-rhythm text-[17px] leading-none whitespace-pre" style={{ fontVariantLigatures: 'normal', fontFeatureSettings: '"liga" 1, "calt" 1' }}>
          {getShuffleSymbolGlyphs().rightEighth}
        </span>
        <span className="absolute left-[2px] top-[7px] h-[3px] w-[5px] border-l-[0.5px] border-t-[0.5px] border-current" aria-hidden="true" />
        <span className="absolute left-[7px] top-[7px] h-[0.5px] w-[4px] bg-current" aria-hidden="true" />
        <span className="absolute left-[13px] top-[4px] z-10 -translate-x-1/2 bg-white px-[1px] text-[8px] leading-none font-semibold">3</span>
        <span className="absolute left-[15px] top-[7px] h-[0.5px] w-[6px] bg-current" aria-hidden="true" />
        <span className="absolute right-[9px] top-[7px] h-[3px] w-[5px] border-r-[0.5px] border-t-[0.5px] border-current" aria-hidden="true" />
      </span>
    </span>
  </span>
);

const splitDisplayTimeSignature = (timeSignature: string) => {
  const match = timeSignature.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  return {
    numerator: match?.[1] || timeSignature,
    denominator: match?.[2] || ''
  };
};

const BarEdgeMarker: React.FC<{ type: 'repeat-start' | 'repeat-end' | 'final-bar' }> = ({ type }) => {
  const isStart = type === 'repeat-start';
  const isEnd = type === 'repeat-end';
  const printGlyph = type === 'repeat-start' ? '|:' : type === 'repeat-end' ? ':|' : '||';
  const printAlignClass = isStart ? 'justify-start' : 'justify-end';

  return (
    <div
      className={`sheet-repeat-marker absolute top-0 bottom-0 z-[999] w-[13px] pointer-events-none ${isStart ? 'sheet-repeat-start -left-[4px]' : ''} ${isEnd ? 'sheet-repeat-end -right-[4px]' : ''} ${type === 'final-bar' ? 'sheet-final-bar -right-[2px]' : ''}`}
      aria-hidden="true"
    >
      <div className="sheet-repeat-preview absolute inset-0" aria-hidden="true">
        {isStart && (
          <>
            <span className="absolute inset-y-0 left-0 border-l-[3px] border-gray-900" />
            <span className="absolute inset-y-0 left-[5.5px] border-l border-gray-900" />
            <span className="absolute left-[9.2px] top-[37%] -translate-y-1/2 text-[10px] leading-none text-gray-900">•</span>
            <span className="absolute left-[9.2px] top-[61%] -translate-y-1/2 text-[10px] leading-none text-gray-900">•</span>
          </>
        )}
        {isEnd && (
          <>
            <span className="absolute left-[0.2px] top-[37%] -translate-y-1/2 text-[10px] leading-none text-gray-900">•</span>
            <span className="absolute left-[0.2px] top-[61%] -translate-y-1/2 text-[10px] leading-none text-gray-900">•</span>
            <span className="absolute inset-y-0 right-[5.5px] border-l border-gray-900" />
            <span className="absolute inset-y-0 right-0 border-l-[3px] border-gray-900" />
          </>
        )}
        {type === 'final-bar' && (
          <>
            <span className="absolute inset-y-0 right-[5.5px] border-l border-gray-900" />
            <span className="absolute inset-y-0 right-0 border-l-[3px] border-gray-900" />
          </>
        )}
      </div>
      <div className={`sheet-repeat-print-fallback absolute inset-0 hidden items-center ${printAlignClass}`} aria-hidden="true">
        <span
          className="block text-gray-900 leading-none select-none"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '-0.08em' }}
        >
          {printGlyph}
        </span>
      </div>
    </div>
  );
};

const NAVIGATION_MARKER_GLYPHS: Record<NavigationMarker, string> = {
  segno: '𝄋',
  coda: '𝄌',
  ds: '',
  dc: '',
  fine: '',
  'ds-al-fine': '',
  'ds-al-coda': ''
};

const TEXT_ONLY_NAVIGATION_MARKERS = new Set<NavigationMarker>([
  'ds',
  'dc',
  'fine',
  'ds-al-coda',
  'ds-al-fine'
]);

const NavigationMarkerIcon: React.FC<{
  marker: NavigationMarker;
  side: 'left' | 'right';
  offsetPx?: number;
  onClick?: () => void;
}> = ({ marker, side, offsetPx = 0, onClick }) => {
  if (TEXT_ONLY_NAVIGATION_MARKERS.has(marker)) {
    return null;
  }

  const interactive = Boolean(onClick);

  return (
    <div
      className={`absolute top-0 z-[1100] select-none leading-none text-gray-900 ${side === 'left' ? 'left-0' : 'right-0'} ${interactive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        transform: `translate(${side === 'left' ? `calc(-50% + ${offsetPx}px)` : `calc(50% + ${offsetPx}px)`}, -54%)`
      }}
      {...(interactive
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: (event: React.MouseEvent) => { event.stopPropagation(); onClick?.(); }
          }
        : { 'aria-hidden': true })}
    >
      {marker === 'coda' ? (
        <span className="inline-flex h-[20px] w-[18px] items-center justify-center overflow-hidden rounded-full bg-white">
          <span
            className="block translate-y-[0.5px] text-[29px] leading-none text-gray-900"
            style={{ fontFamily: 'NotoMusic, serif' }}
          >
            {NAVIGATION_MARKER_GLYPHS[marker]}
          </span>
        </span>
      ) : (
        <span
          className="inline-flex items-center justify-center rounded-full bg-white px-[1px] py-0 leading-[0.72] text-[25px]"
          style={{ fontFamily: 'NotoMusic, serif' }}
        >
          {NAVIGATION_MARKER_GLYPHS[marker]}
        </span>
      )}
    </div>
  );
};

const NavigationTextTag: React.FC<{
  text: string;
  side: 'left' | 'right';
  placement?: 'top' | 'inside-bottom' | 'outside-bottom' | 'outside-bottom-tight';
  className?: string;
  variant?: 'plain' | 'highlight';
  onClick?: () => void;
}> = ({ text, side, placement = 'top', className = '', variant = 'plain', onClick }) => (
  <div
    className={`absolute z-20 max-w-[calc(100%-8px)] whitespace-nowrap ${onClick ? 'cursor-pointer pointer-events-auto' : ''} ${side === 'left' ? 'left-1' : 'right-1'} ${
      placement === 'top'
        ? '-top-[18px]'
        : placement === 'inside-bottom'
          ? 'bottom-1'
          : placement === 'outside-bottom-tight'
            ? 'top-full -mt-[1px]'
            : 'top-full mt-1'
    } ${className}`}
    style={{
      textShadow: variant === 'highlight'
        ? '0 0 2px rgba(255,255,255,0.75)'
        : '0 0 2px rgba(255,255,255,0.95), 0 0 5px rgba(255,255,255,0.9)'
    }}
    {...(onClick
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: (event: React.MouseEvent) => { event.stopPropagation(); onClick(); }
        }
      : {})}
  >
    <span
      className={variant === 'highlight'
        ? 'inline-flex items-center rounded-[4px] border-[1.5px] border-amber-900/75 bg-[#fff29c] px-1.5 py-[1px] text-[11px] font-bold leading-none text-gray-900'
        : 'inline-flex items-center px-0 py-0 text-[9px] font-semibold leading-none text-gray-900'
      }
      style={{
        fontFamily: 'Bach, "IBM Plex Serif", serif',
        fontStyle: 'italic',
        letterSpacing: '0.01em'
      }}
    >
      {text}
    </span>
  </div>
);

const getDefaultRightNavigationText = (marker: NavigationMarker | undefined) => (
  marker === 'ds'
    ? 'D.S.'
    : marker === 'dc'
      ? 'D.C.'
      : marker === 'fine'
        ? 'Fine'
        : marker === 'ds-al-fine'
          ? 'D.S. al Fine'
          : marker === 'ds-al-coda'
            ? 'D.S. al Coda'
            : ''
);

const abbreviateChordQualityForDisplay = (chord: string) => (
  chord
    .replace(/(?:m|min|-|minor)7\(?[b♭]5\)?/gi, 'ø7')
    .replace(/dim/gi, '°')
);

const hasCrowdedAbbreviatableChordQuality = (chord: string) => (
  /maj\d*/i.test(chord) || /dim/i.test(chord)
);

const getDisplayedChordString = (
  chord: string,
  sectionOffset: number,
  sectionPlayKey: Key,
  useNashvilleNumbers: boolean,
  abbreviateQuality = false,
  sectionWrittenKey?: Key
) => {
  if (isMultiMeasureRestChord(chord)) {
    return chord.trim();
  }

  const transposed = transposeChord(chord, sectionOffset, sectionPlayKey, false, sectionWrittenKey);
  const displayedChord = useNashvilleNumbers
    ? isNashville(transposed) ? transposed : getNashvilleNumber(transposed, sectionPlayKey)
    : isNashville(transposed) ? parseNashvilleToChord(transposed, sectionPlayKey) : transposed;

  return abbreviateQuality ? abbreviateChordQualityForDisplay(displayedChord) : displayedChord;
};

const ENDING_LEFT_OFFSETS = {
  sectionStart: '-left-[2px]',
  normal: '-left-[1px]',
  repeatStart: 'left-0',
  afterRepeatEnd: 'left-0',
  afterFinalBar: 'left-0'
} as const;

const ENDING_RIGHT_OFFSETS = {
  normalMeasure: '-right-[1px]',
  repeatMeasure: 'right-0',
  finalMeasure: '-right-[2px]'
} as const;

const getEndingLeftOffsetClass = (type: 'section-start' | 'normal' | 'repeat-start' | 'after-repeat-end' | 'after-final-bar') => {
  switch (type) {
    case 'section-start':
      return ENDING_LEFT_OFFSETS.sectionStart;
    case 'repeat-start':
      return ENDING_LEFT_OFFSETS.repeatStart;
    case 'after-repeat-end':
      return ENDING_LEFT_OFFSETS.afterRepeatEnd;
    case 'after-final-bar':
      return ENDING_LEFT_OFFSETS.afterFinalBar;
    case 'normal':
    default:
      return ENDING_LEFT_OFFSETS.normal;
  }
};

const getEndingRightOffsetClass = (type: 'normal-measure' | 'repeat-measure' | 'final-measure') => {
  switch (type) {
    case 'repeat-measure':
      return ENDING_RIGHT_OFFSETS.repeatMeasure;
    case 'final-measure':
      return ENDING_RIGHT_OFFSETS.finalMeasure;
    case 'normal-measure':
    default:
      return ENDING_RIGHT_OFFSETS.normalMeasure;
  }
};

const getSectionActiveTone = (accent: string) => {
  switch (accent) {
    case 'blue':
      return { fill: 'rgba(59, 130, 246, 0.05)', stroke: 'rgba(59, 130, 246, 0.14)', glow: 'rgba(59, 130, 246, 0.06)', barFill: 'rgba(59, 130, 246, 0.10)', barStroke: 'rgba(59, 130, 246, 0.34)', barGlow: 'rgba(59, 130, 246, 0.18)' };
    case 'rose':
      return { fill: 'rgba(244, 63, 94, 0.05)', stroke: 'rgba(244, 63, 94, 0.14)', glow: 'rgba(244, 63, 94, 0.06)', barFill: 'rgba(244, 63, 94, 0.10)', barStroke: 'rgba(244, 63, 94, 0.34)', barGlow: 'rgba(244, 63, 94, 0.18)' };
    case 'amber':
      return { fill: 'rgba(245, 158, 11, 0.06)', stroke: 'rgba(245, 158, 11, 0.16)', glow: 'rgba(245, 158, 11, 0.06)', barFill: 'rgba(245, 158, 11, 0.12)', barStroke: 'rgba(245, 158, 11, 0.36)', barGlow: 'rgba(245, 158, 11, 0.20)' };
    case 'emerald':
      return { fill: 'rgba(16, 185, 129, 0.05)', stroke: 'rgba(16, 185, 129, 0.14)', glow: 'rgba(16, 185, 129, 0.06)', barFill: 'rgba(16, 185, 129, 0.10)', barStroke: 'rgba(16, 185, 129, 0.34)', barGlow: 'rgba(16, 185, 129, 0.18)' };
    case 'slate':
      return { fill: 'rgba(100, 116, 139, 0.05)', stroke: 'rgba(100, 116, 139, 0.14)', glow: 'rgba(100, 116, 139, 0.06)', barFill: 'rgba(100, 116, 139, 0.10)', barStroke: 'rgba(100, 116, 139, 0.28)', barGlow: 'rgba(100, 116, 139, 0.16)' };
    default:
      return { fill: 'rgba(99, 102, 241, 0.05)', stroke: 'rgba(99, 102, 241, 0.14)', glow: 'rgba(99, 102, 241, 0.06)', barFill: 'rgba(99, 102, 241, 0.10)', barStroke: 'rgba(99, 102, 241, 0.34)', barGlow: 'rgba(99, 102, 241, 0.18)' };
  }
};

const AutoShrink: React.FC<{
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  minScale?: number;
  maxScale?: number;
  overflowVisible?: boolean;
  shrinkAxis?: 'uniform' | 'x-only';
}> = ({
  children,
  className = "",
  align = 'left',
  minScale = 0.6,
  maxScale = 1,
  overflowVisible = false,
  shrinkAxis = 'uniform'
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current && contentRef.current) {
        const containerWidth = containerRef.current.clientWidth || containerRef.current.offsetWidth || 0;
        
        // Measure natural width by preventing wrapping temporarily
        const originalWS = contentRef.current.style.whiteSpace;
        contentRef.current.style.whiteSpace = 'nowrap';
        const contentWidth = contentRef.current.scrollWidth;
        contentRef.current.style.whiteSpace = originalWS;

        const fittedScale = contentWidth > containerWidth && containerWidth > 30
          ? Math.max(minScale, (containerWidth - 2) / contentWidth)
          : 1;
        setScale(Math.min(maxScale, fittedScale));
      }
    };

    // Initial check
    updateScale();
    
    // Use a small timeout to ensure layout has settled (fixes "suddenly small" bug)
    const timer = setTimeout(updateScale, 100);

    const observer = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid "ResizeObserver loop limit exceeded"
      window.requestAnimationFrame(updateScale);
    });

    if (containerRef.current) observer.observe(containerRef.current);
    
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [children, minScale, maxScale]);

  const justifyClass = align === 'left'
    ? 'justify-start'
    : align === 'right'
      ? 'justify-end'
      : 'justify-center';
  const transformOrigin = align === 'left'
    ? 'left center'
    : align === 'right'
      ? 'right center'
      : 'center center';
  const overflowClass = overflowVisible ? 'overflow-visible' : 'overflow-hidden';

  return (
    <div 
      ref={containerRef} 
      className={`w-full flex ${justifyClass} ${overflowClass} ${className}`}
    >
      <div 
        ref={contentRef} 
        style={{ 
          transform: shrinkAxis === 'x-only' ? `scaleX(${scale})` : `scale(${scale})`,
          transformOrigin,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          display: 'inline-block'
        }}
      >
        {children}
      </div>
    </div>
  );
};

const ChordSheet: React.FC<ChordSheetProps> = ({ song, language, currentKey, transposeFromOriginal = true, onElementClick, onMetaClick, onAddBarClick, highlightedSectionIds = [], activeSectionId = null, activeBar = null, previewIdentity = null }) => {
  const copy = getUiCopy(language);
  const nashvilleFontFamily = getNashvilleFontFamily(song.nashvilleFontPreset);
  // Chords always use the sans-serif preset; the serif option was removed.
  const chordFontFamily = getChordFontFamily('stage-sans');
  const previousPreviewIdentityRef = React.useRef(previewIdentity);
  const [keepTransitionsSuppressed, setKeepTransitionsSuppressed] = React.useState(false);
  const isPreviewIdentityChanged = previousPreviewIdentityRef.current !== previewIdentity;
  const suppressSectionTransitions = isPreviewIdentityChanged || keepTransitionsSuppressed;
  const emitElementClick = (
    event: React.MouseEvent<HTMLElement>,
    sIdx: number,
    bIdx: number,
    field: ChordSheetElementField
  ) => {
    event.stopPropagation();
    onElementClick?.(sIdx, bIdx, field);
  };
  const getMetaEditAnchorKey = (field: ChordSheetMetaField) => getChordSheetMetaAnchorKey(previewIdentity, field);
  const getMetaValueAnchorKey = (field: ChordSheetMetaField) => `${getMetaEditAnchorKey(field)}|value`;
  const emitMetaClickFromElement = (element: HTMLElement, field: ChordSheetMetaField) => {
    if (!onMetaClick) return;
    const anchorElement = VALUE_ANCHORED_META_FIELDS.has(field)
      ? element.querySelector<HTMLElement>('[data-preview-edit-anchor]') ?? element
      : element;
    const anchorKey = anchorElement.dataset.previewEditAnchor ?? getMetaEditAnchorKey(field);
    onMetaClick(field, {
      anchorKey,
      anchorRect: getPreviewAnchorRect(anchorElement)
    });
  };
  const emitMetaClick = (event: React.MouseEvent<HTMLElement>, field: ChordSheetMetaField) => {
    emitMetaClickFromElement(event.currentTarget, field);
  };
  const getMetaAnchorProps = (field: ChordSheetMetaField) => (
    onMetaClick
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'data-preview-edit-anchor': getMetaEditAnchorKey(field),
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            emitMetaClick(event, field);
          }
        }
      : {}
  );
  const getMetaHitProps = (field: ChordSheetMetaField) => (
    onMetaClick
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'data-preview-edit-hit': getMetaEditAnchorKey(field),
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            emitMetaClick(event, field);
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return;
            }
            event.preventDefault();
            emitMetaClickFromElement(event.currentTarget, field);
          }
        }
      : {}
  );
  const getMetaValueAnchorProps = (field: ChordSheetMetaField) => (
    onMetaClick
      ? { 'data-preview-edit-anchor': getMetaValueAnchorKey(field) }
      : {}
  );

  React.useEffect(() => {
    if (previousPreviewIdentityRef.current === previewIdentity) {
      return;
    }

    previousPreviewIdentityRef.current = previewIdentity;
    setKeepTransitionsSuppressed(true);

    const rafId = window.requestAnimationFrame(() => {
      setKeepTransitionsSuppressed(false);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [previewIdentity]);

  const capo = song.capo || 0;
  const displayedCurrentKey = normalizeKeySpelling(currentKey);
  const baseWrittenKey = transposeFromOriginal ? song.originalKey : displayedCurrentKey;
  const globalKeyShift = transposeFromOriginal ? getTransposeOffset(song.originalKey, displayedCurrentKey) : 0;
  const sectionStartKeys: Key[] = [];
  let activeSectionKey = baseWrittenKey;
  song.sections.forEach((section) => {
    if (section.keyChangeTo) {
      activeSectionKey = section.keyChangeTo;
    }
    sectionStartKeys.push(activeSectionKey);
  });
  const displayedChartKeySequence = getConsecutiveKeySequence(
    (sectionStartKeys.length > 0 ? sectionStartKeys : [baseWrittenKey])
      .map((key) => transposeKeyWithPreference(key, globalKeyShift, displayedCurrentKey))
  );
  const displayedPlayKeySequence = getConsecutiveKeySequence(
    displayedChartKeySequence.map((key) => getPlayKey(key, capo))
  );

  const getFlashColor = (accent: string) => {
    switch (accent) {
      case 'blue': return 'rgba(59, 130, 246, 0.15)';
      case 'rose': return 'rgba(244, 63, 94, 0.15)';
      case 'amber': return 'rgba(245, 158, 11, 0.15)';
      case 'emerald': return 'rgba(16, 185, 129, 0.15)';
      case 'slate': return 'rgba(71, 85, 105, 0.15)';
      default: return 'rgba(99, 102, 241, 0.15)';
    }
  };

  // Flatten all sections into rows
  // A4 page row capacity. Declared here (not just before pagination) so the
  // add-bar row below can check whether it would still fit on the current page.
  // Kept stable between chord and lyrics modes so barline heights do not jump.
  const ROWS_PER_PAGE_FIRST = 12;
  const ROWS_PER_PAGE_OTHER = 14;
  const pageIndexOfRow = (rowIndex: number) =>
    rowIndex < ROWS_PER_PAGE_FIRST
      ? 0
      : 1 + Math.floor((rowIndex - ROWS_PER_PAGE_FIRST) / ROWS_PER_PAGE_OTHER);

  const allowAddBar = Boolean(onAddBarClick);
  const lastSectionIndex = song.sections.length - 1;
  const allRows: { sectionTitle: string | null; bars: Bar[]; sIdx: number; startBIdx: number }[] = [];
  song.sections.forEach((section, sIdx) => {
    const sectionRows = Math.max(1, Math.ceil(section.bars.length / 4));
    for (let i = 0; i < sectionRows; i++) {
      allRows.push({
        sectionTitle: i === 0 ? section.title : null,
        bars: section.bars.slice(i * 4, i * 4 + 4),
        sIdx,
        startBIdx: i * 4
      });
      }
  });

  // Only the very last section may grow a *new* row for the "+" slot (nothing
  // follows it, so reflow is harmless). If its bars fill the last row exactly,
  // append one empty row so the "+" has somewhere to live — but only when that
  // row stays on the same page as the section. Otherwise it would spawn a blank
  // trailing page whose only content is the "+". Non-last sections reuse their
  // existing trailing empty cells and never get an extra row.
  const finalSection = song.sections[lastSectionIndex];
  if (allowAddBar && finalSection && finalSection.bars.length > 0 && finalSection.bars.length % 4 === 0) {
    const addRowIndex = allRows.length;
    if (addRowIndex > 0 && pageIndexOfRow(addRowIndex) === pageIndexOfRow(addRowIndex - 1)) {
      allRows.push({
        sectionTitle: null,
        bars: [],
        sIdx: lastSectionIndex,
        startBIdx: finalSection.bars.length
      });
    }
  }
  const sectionBarOffsets: number[] = [];
  let accumulatedBarCount = 0;
  song.sections.forEach((section) => {
    sectionBarOffsets.push(accumulatedBarCount);
    accumulatedBarCount += section.bars.length;
  });
  const barNumberMode = song.barNumberMode ?? 'none';
  const previewJianpuScale = 0.86;
  const riffLanePaddingXClass = 'px-1';
  const previewBottomLaneClass = 'h-[18px] flex items-center overflow-visible';

  const pages: { sectionTitle: string | null; bars: Bar[]; sIdx: number; startBIdx: number }[][] = [];
  let currentRow = 0;

  // Page 1
  pages.push(allRows.slice(0, ROWS_PER_PAGE_FIRST));
  currentRow = ROWS_PER_PAGE_FIRST;

  // Subsequent pages
  while (currentRow < allRows.length) {
    pages.push(allRows.slice(currentRow, currentRow + ROWS_PER_PAGE_OTHER));
    currentRow += ROWS_PER_PAGE_OTHER;
  }

  // Ensure at least one page
  if (pages.length === 0) pages.push([]);

  const lyricist = song.lyricist?.trim();
  const composer = song.composer?.trim();
  const translator = song.translator?.trim();
  const isShuffle = song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle';
  const versionNames = Array.from(new Set([lyricist, composer].filter(Boolean)));
  const creditLine = [versionNames.join(' ｜ '), translator].filter(Boolean).join(' ｜ ');
  const hasCredits = Boolean(creditLine);

  return (
    <div className="flex flex-col gap-8 print:gap-0">
      {pages.map((pageRows, pIdx) => {
        const currentSectionRow = pageRows.find((row) => row.sectionTitle) ?? pageRows[0] ?? null;
        const currentSectionIndex = currentSectionRow ? currentSectionRow.sIdx + 1 : 0;
        const currentSectionTitle = currentSectionRow?.sectionTitle ?? song.sections[currentSectionRow?.sIdx ?? 0]?.title ?? '';

        // Obvious top-of-page "page x of n" marker, only when the song spans more
        // than one page — a clear performance cue so it's hard to lose your place.
        const isMultiPage = pages.length > 1;
        const pageBadge = isMultiPage ? (
          <div
            className="shrink-0 inline-flex items-baseline gap-1 rounded-lg border-2 border-indigo-500 bg-white px-2.5 py-1 leading-none shadow-sm"
            aria-label={language === 'zh' ? `第 ${pIdx + 1} 頁，共 ${pages.length} 頁` : `Page ${pIdx + 1} of ${pages.length}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              {language === 'zh' ? '頁' : 'P'}
            </span>
            <span className="text-lg font-extrabold tabular-nums text-indigo-700">{pIdx + 1}</span>
            <span className="text-sm font-bold text-gray-300">/</span>
            <span className="text-sm font-bold tabular-nums text-gray-400">{pages.length}</span>
          </div>
        ) : null;

        return (
        <div 
          key={pIdx} 
          data-print-page
          data-export-page-index={pIdx + 1}
          data-export-page-total={pages.length}
          data-export-song-title={song.title}
          data-export-section-index={currentSectionIndex}
          data-export-section-title={currentSectionTitle}
          className="bg-white p-6 sm:p-8 shadow-lg border border-gray-100 mx-auto font-sans text-gray-900 w-full max-w-[794px] h-[1123px] flex flex-col overflow-hidden relative"
        >
          {/* Header - Only on first page */}
          {pIdx === 0 ? (
            <div className="shrink-0 mb-4 border-b-2 border-gray-900 pb-2">
              <div className="min-w-0 relative">
                <div className="flex items-start gap-3">
                  <AutoShrink className="mb-0 min-w-0 flex-1">
                    <div
                      {...getMetaAnchorProps('title')}
                      className={onMetaClick ? 'cursor-text rounded-sm transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.28)]' : undefined}
                    >
                      <h1 className="text-3xl font-bold tracking-tight">{song.title}</h1>
                    </div>
                  </AutoShrink>
                  {pageBadge}
                </div>
                {(hasCredits || onMetaClick) && (
                  <div
                    {...getMetaAnchorProps('credits')}
                    aria-label={hasCredits ? undefined : (language === 'zh' ? '編輯版本與翻譯' : 'Edit version and translation')}
                    className={`absolute left-0 top-[38px] ${hasCredits ? 'max-w-[48%] text-xs font-semibold text-gray-900 tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis' : 'h-4 w-36'} ${onMetaClick ? 'cursor-text rounded-sm transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.28)]' : ''}`}
                  >
                    {hasCredits ? creditLine : null}
                  </div>
                )}
                <AutoShrink className="min-w-0 overflow-visible mt-4.5">
                  <div className="flex items-center gap-3 text-xs font-medium text-gray-500 tracking-widest" style={{ fontFamily: chordFontFamily }}>
                    <div
                      {...getMetaHitProps('key')}
                      className={`shrink-0 -mx-1 rounded-sm px-1 py-0.5 ${onMetaClick ? 'cursor-pointer transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.22)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(99,102,241,0.4)]' : ''}`}
                    >
                      <span>{copy.key} - </span>
                      <span
                        {...getMetaValueAnchorProps('key')}
                        className="text-gray-900 font-bold"
                      >
                        <FormattedKeySequence
                          keys={displayedChartKeySequence}
                          nashvilleFontFamily={nashvilleFontFamily}
                          chordFontFamily={chordFontFamily}
                        />
                      </span>
                    </div>
                    {typeof song.tempo === 'number' && (
                      <>
                        <span className="text-gray-400">|</span>
                        <div
                          {...getMetaHitProps('tempo')}
                          className={`shrink-0 -mx-1 rounded-sm px-1 py-0.5 ${onMetaClick ? 'cursor-text transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.22)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(99,102,241,0.4)]' : ''}`}
                        >
                          <span>{copy.editor.tempo} - </span>
                          <span
                            {...getMetaValueAnchorProps('tempo')}
                            className="text-gray-900 font-bold"
                          >
                            {song.tempo}
                          </span>
                        </div>
                      </>
                    )}
                    <span className="text-gray-400">|</span>
                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        {...getMetaHitProps('timeSignature')}
                        className={`-mx-1 rounded-sm px-1 py-0.5 ${onMetaClick ? 'cursor-text transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.22)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgba(99,102,241,0.4)]' : ''}`}
                      >
                        <span>{copy.editor.timeSignature} - </span>
                        <span
                          {...getMetaValueAnchorProps('timeSignature')}
                          className="text-gray-900 font-bold"
                        >
                          {song.timeSignature}
                        </span>
                      </span>
                      {song.showAbsoluteJianpu && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-900 font-bold">{copy.fixedDoMode}</span>
                        </>
                      )}
                      {isShuffle && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span
                            {...getMetaAnchorProps('groove')}
                            className={`inline-flex ${onMetaClick ? 'cursor-pointer rounded-sm transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.28)]' : ''}`}
                          >
                            <ShuffleSymbol className="self-center -translate-y-[3px]" />
                          </span>
                        </>
                      )}
                    </div>
                    {capo > 0 && (
                      <>
                        <span className="text-gray-400">|</span>
                        <div
                          {...getMetaAnchorProps('capo')}
                          className={`flex items-center gap-1.5 shrink-0 ${onMetaClick ? 'cursor-pointer rounded-sm transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.28)]' : ''}`}
                        >
                          <span className="text-indigo-600 font-semibold">Capo {capo}</span>
                          <span className="text-gray-400 font-medium">(<FormattedKeySequence keys={displayedPlayKeySequence} nashvilleFontFamily={nashvilleFontFamily} chordFontFamily={chordFontFamily} />)</span>
                        </div>
                      </>
                    )}
                  </div>
                </AutoShrink>
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex justify-between items-center gap-3 mb-4 border-b border-gray-200 pb-2">
              <span className="min-w-0 truncate text-sm font-bold text-gray-400 uppercase tracking-widest">{song.title} ({copy.continued})</span>
              {pageBadge}
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 flex flex-col min-h-0 w-full gap-y-2 sm:gap-y-3">
            {pageRows.map((row, rIdx) => {
              const section = song.sections[row.sIdx];
              const sectionWrittenKey = sectionStartKeys[row.sIdx] || song.originalKey;
              const previousWrittenKey = row.sIdx > 0 ? (sectionStartKeys[row.sIdx - 1] || song.originalKey) : song.originalKey;
              const sectionCurrentKey = transposeKeyWithPreference(sectionWrittenKey, globalKeyShift, displayedCurrentKey);
              const previousSectionKey = row.sIdx > 0 ? transposeKeyWithPreference(previousWrittenKey, globalKeyShift, displayedCurrentKey) : displayedCurrentKey;
              const sectionPlayKey = getPlayKey(sectionCurrentKey, capo);
              const sectionOffset = getTransposeOffset(sectionWrittenKey, sectionPlayKey);
              const sectionKeyChanged = sectionCurrentKey !== previousSectionKey;
              const firstBarInRowIndex = row.bars.findIndex(Boolean);
              const colors = getSectionColor(section?.title || '', true);
              const activeTone = getSectionActiveTone(colors.accent);
              const isHighlighted = highlightedSectionIds.includes(section?.id || '');
              const isActiveSection = Boolean(section?.id) && section.id === activeSectionId;
              const pickup = row.sIdx === 0 && row.startBIdx === 0 ? song.pickup : undefined;
              const hasPickupRiff = Boolean(pickup?.riff?.trim());
              const hasPickupRhythm = Boolean(pickup?.rhythm?.trim());
              const hasPickupDisplay = hasPickupRiff || hasPickupRhythm;
              const { beats: pickupBeatCount } = parseTimeSignature(song.timeSignature);
              const pickupRiffTokens = hasPickupRiff
                ? getCanonicalJianpuBeatTokens(pickup?.riff, song.timeSignature)
                : [];
              const pickupRiffSpan = getOccupiedTokenSpan(pickupRiffTokens);
              const pickupMaxTokenItems = pickupRiffSpan.trimmedTokens.reduce((maxCount, token) => (
                Math.max(maxCount, findJianpuNoteRanges(token).length + findJianpuPlaceholderRanges(token).length)
              ), 0);
              const pickupPreviewNotation = hasPickupRiff
                ? (() => {
                    const canonicalNotation = serializeJianpuBeatTokens(pickupRiffTokens);
                    return song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(canonicalNotation, sectionPlayKey)
                      : canonicalNotation;
                  })()
                : '';
              const pickupRiffHighlightStyle = pickupRiffSpan.firstIndex >= 0
                ? {
                    left: `calc(${(pickupRiffSpan.firstIndex / pickupBeatCount) * 100}% - 4px)`,
                    width: `calc(${(pickupRiffSpan.span / pickupBeatCount) * 100}% + 4px)`
                  }
                : null;
              const pickupRhythmParsed = hasPickupRhythm ? parseRhythmNotation(pickup?.rhythm || '', song.timeSignature) : null;
              const pickupFirstVisibleRhythmEvent = pickupRhythmParsed?.events.find((event) => !event.isHidden) ?? null;
              const pickupRhythmSpanBeats = pickupRhythmParsed
                ? Math.max(
                    1,
                    Math.ceil(Math.max(0, pickupRhythmParsed.visibleEndUnit) / pickupRhythmParsed.beatUnits)
                    - Math.floor((pickupFirstVisibleRhythmEvent?.startUnit ?? 0) / pickupRhythmParsed.beatUnits)
                  )
                : 0;
              const pickupRhythmHighlightStyle = pickupRhythmParsed && pickupFirstVisibleRhythmEvent
                ? {
                    left: `calc(${(Math.floor(pickupFirstVisibleRhythmEvent.startUnit / pickupRhythmParsed.beatUnits) / pickupBeatCount) * 100}% - 4px)`,
                    width: `calc(${(pickupRhythmSpanBeats / pickupBeatCount) * 100}% + 4px)`
                  }
                : null;
              const pickupDisplayBeatSpan = Math.max(1, pickupRiffSpan.span, pickupRhythmSpanBeats);
              const pickupDisplayWidthPx = Math.min(188, Math.max(96, pickupDisplayBeatSpan * 44, pickupMaxTokenItems * 24));
              const isPickupActive = activeBar?.sIdx === 0 && activeBar?.bIdx === -1;
              
              return (
                <motion.div 
                  key={`${section?.id || row.sIdx}-${row.startBIdx}`}
                  data-preview-section-id={section?.id || ''}
                  layout={!suppressSectionTransitions}
                  initial={false}
                  animate={{ 
                    backgroundColor: isHighlighted
                      ? getFlashColor(colors.accent)
                      : isActiveSection
                        ? activeTone.fill
                        : 'rgba(255, 255, 255, 0)',
                    boxShadow: isActiveSection ? `inset 0 0 0 2px ${activeTone.stroke}` : 'inset 0 0 0 0 rgba(0, 0, 0, 0)'
                  }}
                  transition={{ 
                    layout: suppressSectionTransitions
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 300, damping: 30 },
                    backgroundColor: { duration: suppressSectionTransitions ? 0 : (isHighlighted ? 0.2 : 0.25) },
                    boxShadow: { duration: suppressSectionTransitions ? 0 : 0.2 }
                  }}
                  className="flex-1 flex w-full min-h-0 rounded-lg transition-all"
                >
                  {/* Left Column: Section Title */}
                <div className="relative w-16 sm:w-20 shrink-0 flex flex-col items-center justify-start pr-2 pt-1 overflow-visible">
                    {row.sectionTitle && (() => {
                      const colors = getSectionColor(row.sectionTitle, true);
                      const hasManualLineBreak = row.sectionTitle.includes('\n');
                      return (
                        <div className={`w-full flex justify-center transition-all ${isActiveSection ? 'scale-[1.02]' : ''}`}>
                          <div className="relative flex w-full justify-center">
                            <div
                              className={`flex w-full items-center justify-center rounded-sm border px-1 py-1 min-h-[24px] overflow-visible ${onElementClick ? 'cursor-pointer transition-shadow hover:shadow-[0_0_0_2px_rgba(99,102,241,0.4)]' : ''}`}
                              style={getSectionBadgeStyle(colors.accent)}
                              {...(onElementClick ? { role: 'button' as const, tabIndex: 0, onClick: (event: React.MouseEvent<HTMLElement>) => emitElementClick(event, row.sIdx, -1, 'sectionName') } : {})}
                            >
                              {hasManualLineBreak ? (
                                <div className="w-full whitespace-pre-line break-words px-[1px] text-center text-[10px] font-black tracking-[0.04em] leading-[1.15]">
                                  {localizeSectionTitle(row.sectionTitle, language)}
                                </div>
                              ) : (
                                <div className="w-full px-[1px]">
                                  <AutoShrink align="center" minScale={0.52} className="overflow-visible">
                                    <div className="text-[11px] font-black tracking-[0.04em] leading-none">
                                      {localizeSectionTitle(row.sectionTitle, language)}
                                    </div>
                                  </AutoShrink>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {hasPickupDisplay && (
                      <div
                        className={`absolute bottom-1 right-2 flex flex-col items-end space-y-0.5 overflow-visible transition-all ${isPickupActive ? 'scale-[1.01]' : ''}`}
                        style={{
                          width: `${pickupDisplayWidthPx}px`,
                          ...(isPickupActive ? { filter: `drop-shadow(0 6px 12px ${activeTone.glow})` } : undefined)
                        }}
                      >
                        {hasPickupRhythm && (
                          <button
                            type="button"
                            onClick={(event) => emitElementClick(event, 0, -1, 'rhythm')}
                            className={`block w-full rounded-sm text-left transition-colors ${isPickupActive ? 'ring-1 ring-indigo-200' : ''}`}
                            style={{ boxShadow: isPickupActive ? `inset 0 0 0 1px ${activeTone.stroke}` : 'none' }}
                          >
                            <div className="relative w-full px-1 py-0">
                              {pickupRhythmHighlightStyle && (
                                <span
                                  className="absolute inset-y-0 rounded-sm bg-gray-300/70 mix-blend-multiply"
                                  style={pickupRhythmHighlightStyle}
                                />
                              )}
                              <div className="relative z-10 w-full translate-y-[2px]">
                                <RhythmNotation notation={pickup?.rhythm || ''} timeSignature={song.timeSignature} compact />
                              </div>
                            </div>
                          </button>
                        )}
                        {hasPickupRiff && (
                          <button
                            type="button"
                            onClick={(event) => emitElementClick(event, 0, -1, 'riff')}
                            className={`block w-full rounded-sm text-left transition-colors ${isPickupActive ? 'ring-1 ring-indigo-200' : ''}`}
                            style={{ boxShadow: isPickupActive ? `inset 0 0 0 1px ${activeTone.stroke}` : 'none' }}
                          >
                            <div className="relative w-full px-1 py-0">
                              {pickupRiffHighlightStyle && (
                                <span
                                  className="absolute inset-y-0 rounded-sm bg-gray-300/70 mix-blend-multiply"
                                  style={pickupRiffHighlightStyle}
                                />
                              )}
                              <Jianpu notation={pickupPreviewNotation} compact scale={previewJianpuScale} timeSignature={song.timeSignature} className="relative z-10 w-full min-w-0" />
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                </div>

                {/* Right Column: Bars */}
                <div className="flex-1 grid min-h-0 grid-cols-4 w-full" data-rhythm-measure-row>
                  {(() => {
                  // Multi-measure rest spans: a rest bar (|N| / ||) extends right
                  // across following bars in this row that carry no chord/rhythm/riff
                  // content, stopping at the first bar with content or the row end.
                  // Covered cells are skipped so the rest renders as one continuous
                  // symbol with the inner barlines hidden.
                  const restPlan = Array.from({ length: 4 }, () => ({ span: 1, covered: false }));
                  const isAbsorbableRestBar = (candidate: Bar | undefined) => {
                    if (!candidate) return true;
                    if (hasMeaningfulChordContent(candidate.chords)) return false;
                    if (candidate.rhythm?.trim()) return false;
                    const riffNotation = getPreviewRiffNotation(
                      candidate.riff,
                      getEffectiveTimeSignature(candidate.timeSignature, song.timeSignature)
                    );
                    if (hasVisiblePreviewRiff(riffNotation)) return false;
                    return true;
                  };
                  for (let i = 0; i < 4; i += 1) {
                    const restBar = row.bars[i];
                    if (!restBar || !restBar.chords?.some((chord) => isMultiMeasureRestChord(chord?.trim()))) continue;
                    let span = 1;
                    for (let j = i + 1; j < 4 && isAbsorbableRestBar(row.bars[j]); j += 1) {
                      restPlan[j].covered = true;
                      span += 1;
                    }
                    restPlan[i].span = span;
                    i += span - 1;
                  }
                  return Array.from({ length: 4 }).map((_, bIdx) => {
                    if (restPlan[bIdx].covered) return null;
                    const restSpan = restPlan[bIdx].span;
                    const lastBIdx = bIdx + restSpan - 1;
                    const bar = row.bars[bIdx];
                    const previousBar = row.bars[bIdx - 1];
                    const showKeyChangeTag = sectionKeyChanged && row.startBIdx === 0 && bIdx === (firstBarInRowIndex === -1 ? 0 : firstBarInRowIndex);
                    const effectiveTimeSignature = bar ? getEffectiveTimeSignature(bar.timeSignature, song.timeSignature) : song.timeSignature;
                    const canonicalRiffNotation = getPreviewRiffNotation(bar?.riff, effectiveTimeSignature);
                    const previewRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(canonicalRiffNotation, sectionPlayKey)
                      : canonicalRiffNotation;
                    const previousCanonicalRiffNotation = getPreviewRiffNotation(
                      bIdx > 0 ? row.bars[bIdx - 1]?.riff : undefined,
                      getEffectiveTimeSignature(row.bars[bIdx - 1]?.timeSignature, song.timeSignature)
                    );
                    const previewPreviousRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(previousCanonicalRiffNotation, sectionPlayKey)
                      : previousCanonicalRiffNotation;
                    const nextCanonicalRiffNotation = getPreviewRiffNotation(
                      bIdx < row.bars.length - 1 ? row.bars[bIdx + 1]?.riff : undefined,
                      getEffectiveTimeSignature(row.bars[bIdx + 1]?.timeSignature, song.timeSignature)
                    );
                    const previewNextRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(nextCanonicalRiffNotation, sectionPlayKey)
                      : nextCanonicalRiffNotation;
                    const barLabel = getBarDisplayLabel(bar);
                    const leftNavigationText = bar?.leftText?.trim();
                    const rightNavigationText = bar?.rightText?.trim() || getDefaultRightNavigationText(bar?.rightMarker);
                    const isRightTextOnlyMarker = Boolean(bar?.rightMarker && TEXT_ONLY_NAVIGATION_MARKERS.has(bar.rightMarker));
                    const hasBarLabel = Boolean(barLabel);
                    const globalBarNumber = (sectionBarOffsets[row.sIdx] ?? 0) + row.startBIdx + bIdx + 1;
                    const beatsPerBar = parseInt(effectiveTimeSignature.split('/')[0]) || 4;
                    const displayChordEntries = bar ? getChordDisplaySlotEntries(bar.chords, beatsPerBar) : [];
                    const rhythmMarkColor = getRhythmMarkTextColor(bar);
                    const unisonMarkStyle = getUnisonMarkStyle(bar);
                    const hasRhythm = Boolean(bar?.rhythm);
                    const hasRiff = hasVisiblePreviewRiff(previewRiffNotation);
                    const previousRhythmBar = bIdx > 0
                      ? row.bars[bIdx - 1]
                      : row.startBIdx > 0
                        ? section?.bars[row.startBIdx - 1]
                        : row.sIdx === 0 && song.pickup
                          ? song.pickup
                          : row.sIdx > 0
                          ? song.sections[row.sIdx - 1]?.bars.at(-1)
                          : undefined;
                    const previousRhythmTimeSignature = previousRhythmBar
                      ? getEffectiveTimeSignature(previousRhythmBar.timeSignature, song.timeSignature)
                      : song.timeSignature;
                    const tieRhythmFromPrevious = Boolean(
                      previousRhythmBar?.rhythm
                      && rhythmEndsWithTieToNext(previousRhythmBar.rhythm, previousRhythmTimeSignature)
                    );
                    const showIncomingRhythmTie = tieRhythmFromPrevious && bIdx === 0;
                    const nextRhythmBar = bIdx < row.bars.length - 1 ? row.bars[bIdx + 1] : undefined;
                    const nextRhythmTimeSignature = nextRhythmBar
                      ? getEffectiveTimeSignature(nextRhythmBar.timeSignature, song.timeSignature)
                      : song.timeSignature;
                    const projectsRhythmTieToNextBar = Boolean(
                      bar?.rhythm
                      && nextRhythmBar?.rhythm
                      && rhythmEndsWithTieToNext(bar.rhythm, effectiveTimeSignature)
                    );
                    const hasChordContent = Boolean(bar && hasMeaningfulChordContent(bar.chords));
                    const showRhythmInChordLane = !hasChordContent && hasRhythm;
                    const showBottomRhythmLane = hasRhythm && !showRhythmInChordLane;
                    const showBottomLane = showBottomRhythmLane || hasRiff || hasBarLabel;
                    const compactModifier = Boolean(
                      bar?.ending ||
                      bar?.annotation ||
                      leftNavigationText ||
                      rightNavigationText
                    );
                    const isEndingStart = Boolean(bar?.ending) && (!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending);
                    const isEndingEnd = Boolean(bar?.ending) && (!row.bars[bIdx + 1] || row.bars[bIdx + 1].ending !== bar.ending);
                    const isUnusedBar = !bar;
                    const lowerLaneCount = bar
                      ? showBottomRhythmLane && hasRiff
                        ? 2
                        : (hasBarLabel || showBottomRhythmLane || hasRiff ? 1 : 0)
                      : 0;
                    const barPaddingBottom = lowerLaneCount >= 2 ? 34 : lowerLaneCount === 1 ? 20 : 24;
                    const sharedLaneClass = previewBottomLaneClass;
                    const { numerator: displayNumerator, denominator: displayDenominator } = splitDisplayTimeSignature(effectiveTimeSignature);
                    const hasInlineTimeSignature = Boolean(bar?.timeSignature);
                    const contentLeftInsetClass = hasInlineTimeSignature
                      ? 'pl-6'
                      : bar?.repeatStart
                        ? 'pl-3.5'
                        : '';
                    const shouldReserveBarNumberForNavigationMarker = Boolean(bar?.leftMarker || previousBar?.rightMarker);
                    const showBarNumber = Boolean(
                      bar
                      && barNumberMode !== 'none'
                      && (barNumberMode === 'all' || bIdx === 0)
                      && !shouldReserveBarNumberForNavigationMarker
                    );
                    const barNumberTopClass = bar?.ending
                      ? 'top-[8px]'
                      : bar?.repeatStart
                        ? '-top-[8px]'
                        : '-top-[2px]';
                    const isActiveBar = activeBar?.sIdx === row.sIdx && activeBar?.bIdx === row.startBIdx + bIdx;
                    // The first empty slot right after a section's last bar becomes a
                    // clickable "+" that appends a new bar (editable preview only).
                    // Add-bar "+" only appears in the very last section, at the slot right after
                    // its last bar. Barlines always render like any other bar; we only drop the
                    // "empty bar" horizontal mark on a fully empty trailing add-row.
                    // The "+" add-bar affordance lives in the first empty cell right after a
                    // section's last bar. The last section may sprout a brand-new row (nothing
                    // follows it). A non-last section only offers "+" when that slot sits inside
                    // an *existing* trailing empty cell of its last row, so adding a bar fills the
                    // gap without reflowing the sections below.
                    const sectionAllowsAddBar = allowAddBar && Boolean(section)
                      && (row.sIdx === lastSectionIndex || section.bars.length > 0);
                    const isAddBarRow = sectionAllowsAddBar && row.bars.length === 0;
                    const isAddBarSlot = !bar && sectionAllowsAddBar && (row.startBIdx + bIdx === (section?.bars.length ?? -1));
                    const suppressLeftBarline = Boolean(bar?.repeatStart) || Boolean(previousBar?.repeatEnd || previousBar?.finalBar);
                    const suppressRightBarline = lastBIdx === 3 && Boolean(bar?.repeatEnd || bar?.finalBar);
                    const leftBorderClass = suppressLeftBarline
                      ? 'border-l-0'
                      : bIdx === 0
                        ? 'border-l-2 border-gray-900 sheet-bar-left-edge'
                        : 'border-l border-gray-900';
                    const rightBorderClass = lastBIdx === 3
                      ? suppressRightBarline
                        ? 'border-r-0'
                        : 'border-r border-r-gray-900 border-r-2 sheet-bar-right-edge'
                      : 'border-r-0';
                    const endingLeftBarlineType: 'section-start' | 'normal' | 'repeat-start' | 'after-repeat-end' | 'after-final-bar' =
                      bar?.repeatStart
                        ? 'repeat-start'
                        : previousBar?.repeatEnd
                          ? 'after-repeat-end'
                          : previousBar?.finalBar
                            ? 'after-final-bar'
                            : bIdx === 0
                              ? 'section-start'
                              : 'normal';
                    const endingRightBarlineType: 'normal-measure' | 'repeat-measure' | 'final-measure' =
                      bar?.repeatEnd || bar?.finalBar
                        ? 'repeat-measure'
                        : bIdx === 3
                          ? 'final-measure'
                          : 'normal-measure';
                    
                    return (
                      <div
                        key={bIdx}
                        className={`sheet-bar relative min-h-0 px-1 pt-1.5 flex flex-col min-w-0 ${leftBorderClass} ${rightBorderClass} ${bar?.repeatStart ? 'sheet-has-repeat-start' : ''} ${
                          previousBar?.repeatEnd ? 'sheet-after-repeat-end' : ''
                        } ${previousBar?.finalBar ? 'sheet-after-final-bar' : ''} ${
                          suppressRightBarline ? 'sheet-has-terminal-right' : ''
                        } ${isActiveBar ? 'z-20' : projectsRhythmTieToNextBar ? 'z-10' : ''} ${isAddBarSlot ? 'group/addbar cursor-pointer' : ''}`}
                        style={isActiveBar ? { gridColumn: `${bIdx + 1} / span ${restSpan}`, paddingBottom: `${barPaddingBottom}px`, backgroundColor: activeTone.barFill, boxShadow: `inset 0 0 0 2px ${activeTone.barStroke}, inset 0 0 0 1px rgba(255, 255, 255, 0.86), 0 12px 24px ${activeTone.barGlow}` } : { gridColumn: `${bIdx + 1} / span ${restSpan}`, paddingBottom: `${barPaddingBottom}px` }}
                        {...(isAddBarSlot ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          title: language === 'zh' ? '新增小節' : 'Add bar',
                          'aria-label': language === 'zh' ? '新增小節' : 'Add bar',
                          onClick: () => onAddBarClick?.(row.sIdx)
                        } : {})}
                      >
                        {isAddBarSlot && (
                          <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-300 transition-colors group-hover/addbar:border-indigo-400 group-hover/addbar:text-indigo-500">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                            </span>
                          </div>
                        )}
                        {showBarNumber && (
                          <div
                            className={`pointer-events-none absolute left-0 z-[1200] -translate-x-1/2 text-[8px] font-bold leading-none text-gray-400 ${barNumberTopClass}`}
                          >
                            <span className="inline-flex rounded-[1px] bg-white px-[0.5px] py-[0.5px] leading-none shadow-[0_0_0_0.5px_rgba(255,255,255,0.65)] isolate">
                              {globalBarNumber}
                            </span>
                          </div>
                        )}

                        {showKeyChangeTag && (
                          <div className="pointer-events-none absolute left-1 -top-4 z-10 inline-flex items-center rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black tracking-[0.04em] leading-none text-amber-800 shadow-[0_1px_0_rgba(251,191,36,0.14)]">
                            {copy.key}: {sectionCurrentKey}
                          </div>
                        )}

                        {/* Repeat Start |: */}
                        {bar?.repeatStart && (
                          <BarEdgeMarker type="repeat-start" />
                        )}

                        {/* Repeat End :| */}
                        {bar?.repeatEnd && (
                          <BarEdgeMarker type="repeat-end" />
                        )}

                        {/* Final Bar || */}
                        {bar?.finalBar && !bar?.repeatEnd && (
                          <BarEdgeMarker type="final-bar" />
                        )}

                        {/* Ending 1. to 4. */}
                        {bar?.ending && (
                          <div className={`sheet-ending-bracket absolute -top-[1px] h-4 border-t-2 border-gray-900 z-10 pointer-events-none ${isEndingStart ? getEndingLeftOffsetClass(endingLeftBarlineType) : 'left-0'} ${isEndingEnd ? getEndingRightOffsetClass(endingRightBarlineType) : 'right-0'}`}>
                             {(!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending) && (
                               <span className="sheet-ending-number absolute -top-4 left-0 text-[10px] font-bold font-serif">{formatEndingDisplay(bar.ending)}</span>
                             )}
                          </div>
                        )}

                        {bar?.leftMarker && (
                          <NavigationMarkerIcon
                            marker={bar.leftMarker}
                            side="left"
                            onClick={onElementClick ? () => onElementClick(row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {bar?.rightMarker && (
                          <NavigationMarkerIcon
                            marker={bar.rightMarker}
                            side="right"
                            onClick={onElementClick ? () => onElementClick(row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {leftNavigationText && (
                          <NavigationTextTag
                            text={leftNavigationText}
                            side="left"
                            className={bar?.leftMarker ? 'left-5' : ''}
                            onClick={onElementClick ? () => onElementClick(row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {rightNavigationText && (
                          <NavigationTextTag
                            text={rightNavigationText}
                            side="right"
                            placement={isRightTextOnlyMarker ? 'outside-bottom-tight' : 'top'}
                            variant={isRightTextOnlyMarker ? 'highlight' : 'plain'}
                            className={isRightTextOnlyMarker ? 'right-0 text-[10px]' : bar?.rightMarker ? 'right-5' : ''}
                            onClick={onElementClick ? () => onElementClick(row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {isUnusedBar && !isAddBarRow && (
                          <div className="absolute inset-0 z-[1] flex items-center pointer-events-none">
                            <div className="h-[2px] w-full bg-gray-400" />
                          </div>
                        )}

                        {bar && (
                          <>
                            {(() => {
                              const showBottomLane = showBottomRhythmLane || hasRiff || hasBarLabel;

                              return (
                                <>
                            {/* Annotation */}
                            {bar.annotation && (
                              <div 
                                className={`absolute -top-4 z-10 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-black tracking-[0.05em] leading-none whitespace-nowrap cursor-pointer transition-colors ${
                                  showKeyChangeTag
                                    ? 'right-1'
                                    : (isEndingStart ? 'left-7' : 'left-1')
                                }`}
                                style={getSectionBadgeStyle(colors.accent)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'annotation');
                                }}
                              >
                                {formatBarAnnotation(bar.annotation)}
                              </div>
                            )}
                            {unisonMarkStyle && (
                              <div
                                className={`pointer-events-none absolute right-1 z-10 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-black tracking-[0.05em] leading-none whitespace-nowrap ${
                                  bar.annotation || showKeyChangeTag || bar.ending ? 'top-[2px]' : '-top-4'
                                }`}
                                style={unisonMarkStyle}
                              >
                                {language === 'zh' ? '齊奏' : 'Unison'}
                              </div>
                            )}
                            {bar.timeSignature && (
                              <div
                                className={`absolute top-1/2 -translate-y-1/2 z-10 flex w-5 flex-col items-center justify-center text-[19px] font-semibold italic leading-[0.78] text-[#1e3a8a] pointer-events-none select-none ${bar.repeatStart ? 'left-2.5' : 'left-1.5'}`}
                                aria-hidden="true"
                              >
                                <span>{displayNumerator}</span>
                                {displayDenominator && <span>{displayDenominator}</span>}
                              </div>
                            )}
                            {/* Chords */}
                                  {(() => {
                                    const renderRhythmInChordLane = showRhythmInChordLane;

                                    if (renderRhythmInChordLane) {
                                      return (
                                        <div
                                          className={`flex flex-1 items-center justify-center w-full h-full cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <div className="w-full max-w-full overflow-visible translate-y-[3px]">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact scale={1.34} beamOffsetUnits={0.05} beamVerticalOffset={-0.28} beamStrokeScale={1.14} tieVerticalOffset={-2.1} tieFontScale={0.88} accentVerticalOffset={2.5} accentHorizontalOffset={0.9} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" />
                                          </div>
                                        </div>
                                      );
                                    }

                                      const occupiedChordAnchors = (() => {
                                        const anchors = displayChordEntries.flatMap((entry, slotIndex) => {
                                          if (!entry?.chord) return [];
                                          return [{ chord: entry.chord, chordIndex: entry.rawIndex, slotIndex, span: 1 }];
                                        });
                                        return anchors.map((anchor, index) => {
                                          const nextSlotIndex = anchors[index + 1]?.slotIndex ?? beatsPerBar;
                                          const slotsUntilNext = Math.max(1, nextSlotIndex - anchor.slotIndex);
                                          return { ...anchor, span: 1, slotsUntilNext };
                                        });
                                      })();
                                    const centeredWholeRestAnchor = occupiedChordAnchors.length === 1
                                      && (isWholeRestChord(occupiedChordAnchors[0]?.chord) || isMultiMeasureRestChord(occupiedChordAnchors[0]?.chord))
                                      ? occupiedChordAnchors[0]
                                      : null;
                                    const renderBeatSlotChordGrid = (className: string) => (
                                      <div
                                        className={className}
                                        style={{ gridTemplateColumns: `repeat(${beatsPerBar}, minmax(0, 1fr))` }}
                                        onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                      >
                                        {(() => {
                                          const fullRenderedAnchors = occupiedChordAnchors.map((anchor) => {
                                            const renderedChord = getDisplayedChordString(anchor.chord, sectionOffset, sectionPlayKey, song.showNashvilleNumbers, false, sectionWrittenKey);
                                            return {
                                              ...anchor,
                                              renderedChord,
                                              trimmedChord: renderedChord.trim()
                                            };
                                          });
                                          const meaningfulFullRenderedAnchors = fullRenderedAnchors.filter((anchor) => anchor.trimmedChord !== '/');
                                          const shouldAbbreviateCrowdedQuality = meaningfulFullRenderedAnchors.length === 3
                                            && meaningfulFullRenderedAnchors.some((anchor) => hasCrowdedAbbreviatableChordQuality(anchor.renderedChord));
                                          const renderedAnchors = shouldAbbreviateCrowdedQuality
                                            ? fullRenderedAnchors.map((anchor) => {
                                                const renderedChord = getDisplayedChordString(anchor.chord, sectionOffset, sectionPlayKey, song.showNashvilleNumbers, true, sectionWrittenKey);
                                                return {
                                                  ...anchor,
                                                  renderedChord,
                                                  trimmedChord: renderedChord.trim()
                                                };
                                              })
                                            : fullRenderedAnchors;
                                          const meaningfulRenderedAnchors = renderedAnchors.filter((anchor) => anchor.trimmedChord !== '/');
                                          const hasLongChordInBar = meaningfulRenderedAnchors.some((anchor) => (
                                            anchor.trimmedChord !== '/'
                                            && (anchor.renderedChord.includes('/') || anchor.renderedChord.length >= 6)
                                          ));
                                          const shouldUniformCompress = hasLongChordInBar && meaningfulRenderedAnchors.length >= 3;
                                          const longestChordLength = meaningfulRenderedAnchors.reduce((maximum, anchor) => (
                                            Math.max(maximum, anchor.renderedChord.length)
                                          ), 0);
                                          const uniformChordMaxScale = shouldUniformCompress
                                            ? longestChordLength >= 8
                                              ? 0.72
                                              : longestChordLength >= 7
                                                ? 0.74
                                                : 0.76
                                            : 1;

                                          return renderedAnchors.map((anchor) => {
                                            const { renderedChord, trimmedChord } = anchor;
                                            const isSlashPlaceholder = trimmedChord === '/';
                                            const isLongChord = !isSlashPlaceholder && (renderedChord.includes('/') || renderedChord.length >= 6);
                                            const hasRoomToBreathe = !isSlashPlaceholder && (anchor.slotsUntilNext ?? 1) >= 2;
                                            const minScale = isSlashPlaceholder
                                              ? 1
                                              : hasRoomToBreathe
                                                ? 1
                                                : isLongChord
                                                  ? 0.66
                                                  : shouldUniformCompress
                                                    ? 0.68
                                                    : 0.82;
                                            const maxScale = isSlashPlaceholder
                                              ? 1
                                              : hasRoomToBreathe
                                                ? 1
                                                : uniformChordMaxScale;

	                                            return (
	                                              <div
	                                                key={`${row.sIdx}-${row.startBIdx + bIdx}-slot-${anchor.slotIndex}`}
	                                                className="flex h-[24px] min-w-0 items-end px-[3px]"
	                                                style={{ gridColumn: `${anchor.slotIndex + 1} / span 1` }}
	                                                  onClick={(event) => {
	                                                  event.stopPropagation();
	                                                  emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords');
                                                }}
                                              >
                                                <AutoShrink
                                                  align="left"
                                                  minScale={minScale}
	                                                  maxScale={maxScale}
	                                                  overflowVisible
	                                                  shrinkAxis="x-only"
	                                                  className="h-[24px] items-end"
	                                                >
	                                                  <div className="min-w-0 origin-center leading-none">
	                                                    <FormattedChord
	                                                      chordString={renderedChord}
	                                                      compactModifier={compactModifier}
                                                      abbreviateMajorQuality={shouldAbbreviateCrowdedQuality}
                                                      nashvilleFontFamily={nashvilleFontFamily}
                                                      chordFontFamily={chordFontFamily}
                                                      color={getChordMarkTextColor(bar, anchor.chordIndex)}
                                                      specialLabel={getChordSpecialLabel(bar, anchor.chordIndex, language)}
                                                    />
                                                  </div>
                                                </AutoShrink>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    );
                                    const hasCenteredPercentRepeat = hasVisibleChordTokens(bar.chords) && bar.chords.length === 1 && bar.chords[0] === '%';

                                    if (hasCenteredPercentRepeat) {
                                      return (
                                        <div
                                          className={`flex-1 flex items-center justify-center w-full h-full cursor-pointer ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <FormattedChord
                                            chordString="%"
                                            nashvilleFontFamily={nashvilleFontFamily}
                                            chordFontFamily={chordFontFamily}
                                            color={getChordMarkTextColor(bar, 0)}
                                            specialLabel={getChordSpecialLabel(bar, 0, language)}
                                          />
                                        </div>
                                      );
                                    }

                                    if (centeredWholeRestAnchor) {
                                      return (
                                        <div
                                          className={`flex flex-1 h-full w-full items-center justify-center cursor-pointer rounded transition-colors hover:bg-indigo-50/50 ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <FormattedChord
                                            chordString={getDisplayedChordString(centeredWholeRestAnchor.chord, sectionOffset, sectionPlayKey, song.showNashvilleNumbers, false, sectionWrittenKey)}
                                            compactModifier={compactModifier}
                                            nashvilleFontFamily={nashvilleFontFamily}
                                            chordFontFamily={chordFontFamily}
                                            restSpan={isMultiMeasureRestChord(centeredWholeRestAnchor.chord) ? restSpan : 1}
                                            color={getChordMarkTextColor(bar, centeredWholeRestAnchor.chordIndex)}
                                            specialLabel={getChordSpecialLabel(bar, centeredWholeRestAnchor.chordIndex, language)}
                                          />
                                        </div>
                                      );
                                    }

                                    return (
                                      renderBeatSlotChordGrid(
                                        `flex-1 grid w-full content-start items-start pt-[3px] cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${contentLeftInsetClass}`
                                      )
                                    );
                                  })()}
                            {showBottomLane && (
                              <div
                                className={`absolute left-1 right-1 ${contentLeftInsetClass}`}
                                style={{ bottom: '4px' }}
                              >
                                {showBottomRhythmLane && hasRiff ? (
                                  <div className="flex gap-1">
                                    {hasBarLabel && (
                                      <div className="flex items-end">
                                        <div 
                                          className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'label');
                                          }}
                                        >
                                          <span className="text-[8px] font-bold text-black uppercase leading-none">
                                            {barLabel}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex flex-1 flex-col gap-0.5">
                                      <div className="flex items-end gap-1">
                                        <div
                                          className={`bg-gray-300/70 mix-blend-multiply rounded-sm px-1 py-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} flex-1`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'rhythm');
                                          }}
                                        >
                                          <div className="w-full translate-y-[3px]">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact tieVerticalOffset={-0.8} accentHorizontalOffset={0.9} accentScale={0.86} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-end">
                                        <div 
                                          className={`bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'riff');
                                          }}
                                        >
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
                                            timeSignature={effectiveTimeSignature}
                                            className="w-full min-w-0"
                                            previousNotationForCrossBar={previewPreviousRiffNotation}
                                            nextNotationForCrossBar={previewNextRiffNotation}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-end gap-1 h-[18px] overflow-visible">
                                    {hasBarLabel && (
                                      <div 
                                        className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'label');
                                        }}
                                      >
                                        <span className="text-[8px] font-bold text-black uppercase leading-none">
                                          {barLabel}
                                        </span>
                                      </div>
                                    )}

                                    {(showBottomRhythmLane || hasRiff) && (
                                      <div
                                        className={`bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          emitElementClick(e, row.sIdx, row.startBIdx + bIdx, showBottomRhythmLane ? 'rhythm' : 'riff');
                                        }}
                                        >
                                          {showBottomRhythmLane ? (
                                            <div className="w-full translate-y-[3px]">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact tieVerticalOffset={-0.8} accentHorizontalOffset={0.9} accentScale={0.86} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" />
                                          </div>
                                        ) : (
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
                                            timeSignature={effectiveTimeSignature}
                                            className="w-full min-w-0"
                                            previousNotationForCrossBar={previewPreviousRiffNotation}
                                            nextNotationForCrossBar={previewNextRiffNotation}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    );
                  });
                  })()}
                </div>
              </motion.div>
            );
          })}
            
            {/* Fill empty space on last page if needed - No placeholder lines here */}
            {pIdx === pages.length - 1 && Array.from({ length: Math.max(0, (pIdx === 0 ? ROWS_PER_PAGE_FIRST : ROWS_PER_PAGE_OTHER) - pageRows.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-1 flex w-full min-h-0">
                <div className="w-16 sm:w-20 shrink-0" />
                <div className="flex-1 grid min-h-0 grid-cols-4 w-full">
                  {Array.from({ length: 4 }).map((_, bIdx) => (
                    <div key={bIdx} className={`sheet-bar relative min-h-0 border-l border-gray-900 px-1 pt-1.5 pb-6 flex flex-col min-w-0 ${bIdx === 3 ? 'border-r border-r-gray-900 sheet-bar-right-edge' : ''} ${bIdx === 0 ? 'border-l-2 sheet-bar-left-edge' : ''} ${bIdx === 3 ? 'border-r-2' : ''}`}>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400 font-medium uppercase tracking-widest">
            <span>{copy.generatedBy}</span>
            <span>{language === 'zh' ? `${copy.page} ${pIdx + 1} / ${pages.length}` : `${copy.page} ${pIdx + 1} of ${pages.length}`}</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )})}
    </div>
  );
};

export default ChordSheet;
