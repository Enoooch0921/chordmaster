/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Song, Section, Bar, Key, AppLanguage, NavigationMarker, BarLabelLane } from '../types';
import { getTransposeOffset, transposeChordForDisplay, getSectionColor, getNashvilleNumber, isNashville, parseNashvilleToChord, getPlayKey, transposeKeyPreferFlats, transposeKeyPreservingSpelling, transposeKeyWithPreference, normalizeKeySpelling } from '../utils/musicUtils';
import { getChordFontFamily } from '../constants/chordFonts';
import { getSongKeyStates } from '../lib/songEditing';
import { getNashvilleFontFamily } from '../constants/nashvilleFonts';
import { getUiCopy, localizeSectionTitle } from '../constants/i18n';
import { formatInitialCaps } from '../utils/textUtils';
import { Repeat, ArrowUpRight, ArrowDownRight, SlidersHorizontal } from 'lucide-react';
import Jianpu from './Jianpu';
import RhythmNotation from './RhythmNotation';
import BeatSlashGlyph from './BeatSlashGlyph';
import { convertRelativeJianpuToAbsoluteNotation, findJianpuNoteRanges, findJianpuPlaceholderRanges, getCanonicalJianpuBeatTokens, serializeJianpuBeatTokens } from '../utils/jianpuUtils';
import { hasMeaningfulChordContent, hasVisibleChordTokens } from '../utils/barUtils';
import { getChordDisplaySlotEntries, getChordDisplaySlotOwnership } from '../utils/chordSlots';
import { getEffectiveTimeSignature, getRestGlyph, getShuffleSymbolGlyphs, parseRhythmNotation, parseTimeSignature, rhythmEndsWithTieToNext } from '../utils/rhythmUtils';
import { DEFAULT_RHYTHM_MARK_COLOR, DEFAULT_SPECIAL_CHORD_COLOR, DEFAULT_UNISON_MARK_COLOR, getAnnotationColorOption } from '../constants/annotationColors';
import type { PreviewNotationCursor, PreviewNotationMode } from '../lib/previewEditSession';
import { getJianpuCursorForNote } from '../lib/jianpuEditing';
import { isBarCompletelyEmpty } from '../lib/songEditing';

interface FormattedChordProps {
  chordString: string;
  compactModifier?: boolean;
  nashvilleFontFamily?: string;
  chordFontFamily?: string;
  compactSlashBass?: boolean;
  abbreviateMajorQuality?: boolean;
  color?: string;
  specialLabel?: string;
  avoidEndingCollision?: boolean;
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

const formatSectionTitleDisplay = (title: string, language: AppLanguage) => (
  formatInitialCaps(localizeSectionTitle(title, language)).trim()
);

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
  avoidEndingCollision = false,
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
        <BeatSlashGlyph className="h-[0.92em] w-[0.7em] text-gray-400" strokeWidth={1.75} />
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

  const markerWrapperClass = avoidEndingCollision
    ? compactModifier
      ? 'absolute -top-[12px] left-[60%] -translate-x-1/2 w-7 h-5 z-20 pointer-events-none'
      : 'absolute -top-[21px] left-[60%] -translate-x-1/2 w-8 h-6 pointer-events-none'
    : compactModifier
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
          data-chord-marker="push"
          data-ending-collision-offset={avoidEndingCollision ? true : undefined}
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
          data-chord-marker="pull"
          data-ending-collision-offset={avoidEndingCollision ? true : undefined}
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
      style={accidentalGlyph ? { paddingLeft: compact ? '0.28em' : '0.35em' } : undefined}
    >
      {accidentalGlyph && (
        <span
          className={`absolute left-0 top-0 leading-none ${
            compact
              ? 'text-[7px] -translate-x-[0.02em] -translate-y-[0.16em]'
              : 'text-xs -translate-x-[0.01em] -translate-y-[0.28em]'
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
    ? Math.max(0.34, qualityVisualLength * 0.32)
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
                          <span key={`${token}-${index}`} className="inline-flex items-baseline gap-[0.04em]">
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
                style={qualityText ? { marginLeft: `${numericQualityReserveEm + 0.02}em` } : { marginLeft: '0.02em' }}
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
                    <span key={`${token}-${index}`} className="inline-flex items-baseline gap-[0.04em]">
                      <span className={`relative ${accidentalGlyph === '#' ? '-top-[0.14em]' : '-top-[0.02em]'}`}>
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

export type ChordSheetElementField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'lower' | 'sectionName' | 'marker';
export type ChordSheetMetaField = 'title' | 'credits' | 'key' | 'tempo' | 'timeSignature' | 'capo' | 'groove' | 'metadata';

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

export interface ChordSheetElementTarget extends ChordSheetElementClickMeta {
  previewIdentity: string | null;
  sectionId: string | null;
  barId: string | null;
  field: ChordSheetElementField;
  slotIndex: number | null;
  rawChordIndex: number | null;
  notationMode: PreviewNotationMode | null;
  cursor: PreviewNotationCursor | null;
  sectionTitleIntent?: 'actions' | 'rename';
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
  onElementClick?: (sIdx: number, bIdx: number, field: ChordSheetElementField, target: ChordSheetElementTarget) => void;
  onMetaClick?: (field: ChordSheetMetaField, meta: ChordSheetElementClickMeta) => void;
  onAddBarClick?: (sIdx: number) => void;
  onAddSectionAfterClick?: (sIdx: number) => void;
  onBarLabelLaneChange?: (sIdx: number, bIdx: number, lane: BarLabelLane) => void;
  highlightedSectionIds?: string[];
  activeSectionId?: string | null;
  activeBar?: { sIdx: number; bIdx: number } | null;
  activePreviewNotationTarget?: {
    sectionId: string;
    barId: string;
    notationMode: PreviewNotationMode;
    cursor: PreviewNotationCursor;
  } | null;
  /** @deprecated Use activePreviewNotationTarget. */
  activeChordSlot?: { sectionId: string; barId: string; slotIndex: number } | null;
  previewIdentity?: string | null;
  showPageBadges?: boolean;
  onSectionReorder?: (sourceSectionId: string, targetSectionId: string, placement: 'before' | 'after') => void;
}

interface PreviewSectionDragState {
  sourceSectionId: string;
  title: string;
  clientX: number;
  clientY: number;
  targetSectionId: string;
  placement: 'before' | 'after';
}

interface PreviewSectionDragCandidate {
  pointerId: number;
  pointerType: string;
  sourceSectionId: string;
  title: string;
  startX: number;
  startY: number;
  active: boolean;
  scrollRoot: HTMLElement | null;
}

type PreviewLabelLanePointerMode = 'mouse' | 'touch';

interface PreviewLabelLaneDragCandidate {
  pointerId: number;
  pointerMode: PreviewLabelLanePointerMode;
  sIdx: number;
  bIdx: number;
  currentLane: BarLabelLane;
  startX: number;
  startY: number;
  active: boolean;
  longPressReady: boolean;
  longPressTimer: number | null;
  rowElement: HTMLElement | null;
  targetElement: HTMLElement;
}

const SECTION_TITLE_DOUBLE_CLICK_WINDOW_MS = 320;
const LABEL_LANE_TOUCH_LONG_PRESS_MS = 260;
const LABEL_LANE_TOUCH_SCROLL_CANCEL_PX = 8;
const LABEL_LANE_MOUSE_ACTIVATE_PX = 4;
const LABEL_LANE_TOUCH_ACTIVATE_PX = 2;

const safeSetPointerCapture = (element: HTMLElement, pointerId: number) => {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Some mobile browsers reject capture after native scroll has already won.
  }
};

const safeReleasePointerCapture = (element: HTMLElement, pointerId: number) => {
  try {
    if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture?.(pointerId);
    }
  } catch {
    // Capture may never have been acquired when the gesture became page scroll.
  }
};

const getLabelLanePointerMode = (event: React.PointerEvent<HTMLElement>): PreviewLabelLanePointerMode => {
  if (event.pointerType === 'mouse') return 'mouse';
  if (event.pointerType === 'touch' || event.pointerType === 'pen') return 'touch';

  return window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse';
};

const getLabelLaneDragTitle = (language: AppLanguage) => (
  language === 'zh'
    ? '滑鼠拖動；手指長按後拖動調整標籤行'
    : 'Mouse: drag. Touch: long-press, then drag to move label row'
);

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
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
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
            onClick: (event: React.MouseEvent<HTMLDivElement>) => { event.stopPropagation(); onClick?.(event); }
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
  placement?: 'top' | 'inside-top' | 'inside-bottom' | 'outside-bottom' | 'outside-bottom-tight';
  className?: string;
  variant?: 'plain' | 'highlight';
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ text, side, placement = 'top', className = '', variant = 'plain', onClick }) => (
  <div
    className={`absolute z-20 max-w-[calc(100%-8px)] whitespace-nowrap ${onClick ? 'cursor-pointer pointer-events-auto' : ''} ${side === 'left' ? 'left-1' : 'right-1'} ${
      placement === 'top'
        ? '-top-[12px]'
        : placement === 'inside-top'
          ? 'top-[2px]'
        : placement === 'inside-bottom'
          ? '-bottom-[16px]'
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
          onClick: (event: React.MouseEvent<HTMLDivElement>) => { event.stopPropagation(); onClick(event); }
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

const PreviewChordInputCaret: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    data-preview-input-caret
    aria-hidden="true"
    className={`preview-chord-input-caret inline-block h-[18px] w-[2px] shrink-0 rounded-full bg-indigo-600 ${className}`}
  />
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

  const transposed = transposeChordForDisplay(chord, sectionOffset, sectionPlayKey, sectionWrittenKey);
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

const ChordSheet: React.FC<ChordSheetProps> = ({ song, language, currentKey, transposeFromOriginal = true, onElementClick, onMetaClick, onAddBarClick, onAddSectionAfterClick, onBarLabelLaneChange, highlightedSectionIds = [], activeSectionId = null, activeBar = null, activePreviewNotationTarget = null, activeChordSlot = null, previewIdentity = null, showPageBadges = true, onSectionReorder }) => {
  const copy = getUiCopy(language);
  const nashvilleFontFamily = getNashvilleFontFamily(song.nashvilleFontPreset);
  // Chords always use the sans-serif preset; the serif option was removed.
  const chordFontFamily = getChordFontFamily('stage-sans');
  const previousPreviewIdentityRef = React.useRef(previewIdentity);
  const [keepTransitionsSuppressed, setKeepTransitionsSuppressed] = React.useState(false);
  const [sectionDrag, setSectionDrag] = React.useState<PreviewSectionDragState | null>(null);
  const sectionDragRef = React.useRef<PreviewSectionDragState | null>(null);
  const sectionDragCandidateRef = React.useRef<PreviewSectionDragCandidate | null>(null);
  const sectionDragLongPressTimerRef = React.useRef<number | null>(null);
  const sectionDragAutoScrollFrameRef = React.useRef<number | null>(null);
  const sectionDragPointerYRef = React.useRef(0);
  const suppressSectionTitleClickRef = React.useRef(false);
  const lastSectionTitleClickRef = React.useRef<{ sectionId: string; at: number } | null>(null);
  const labelLaneDragCandidateRef = React.useRef<PreviewLabelLaneDragCandidate | null>(null);
  const suppressLabelLaneClickRef = React.useRef(false);
  const clearLabelLaneLongPress = React.useCallback((candidate = labelLaneDragCandidateRef.current) => {
    if (candidate && candidate.longPressTimer !== null) {
      window.clearTimeout(candidate.longPressTimer);
      candidate.longPressTimer = null;
    }
  }, []);
  React.useEffect(() => () => {
    clearLabelLaneLongPress();
  }, [clearLabelLaneLongPress]);
  React.useEffect(() => {
    const preventActiveLabelLaneTouchScroll = (event: TouchEvent) => {
      const candidate = labelLaneDragCandidateRef.current;
      if (candidate?.pointerMode === 'touch' && candidate.longPressReady) {
        event.preventDefault();
      }
    };
    const clearEndedLabelLaneTouch = () => {
      const candidate = labelLaneDragCandidateRef.current;
      if (candidate?.pointerMode === 'touch') {
        clearLabelLaneLongPress(candidate);
        labelLaneDragCandidateRef.current = null;
      }
    };

    document.addEventListener('touchmove', preventActiveLabelLaneTouchScroll, { capture: true, passive: false });
    document.addEventListener('touchend', clearEndedLabelLaneTouch, { capture: true, passive: true });
    document.addEventListener('touchcancel', clearEndedLabelLaneTouch, { capture: true, passive: true });

    return () => {
      document.removeEventListener('touchmove', preventActiveLabelLaneTouchScroll, { capture: true });
      document.removeEventListener('touchend', clearEndedLabelLaneTouch, { capture: true });
      document.removeEventListener('touchcancel', clearEndedLabelLaneTouch, { capture: true });
    };
  }, [clearLabelLaneLongPress]);
  const isPreviewIdentityChanged = previousPreviewIdentityRef.current !== previewIdentity;
  const suppressSectionTransitions = isPreviewIdentityChanged || keepTransitionsSuppressed;
  const resolvedActiveNotationTarget = activePreviewNotationTarget ?? (activeChordSlot ? {
    ...activeChordSlot,
    notationMode: 'chords' as const,
    cursor: {
      kind: 'chord' as const,
      slotIndex: activeChordSlot.slotIndex,
      rawChordIndex: null
    }
  } : null);
  const resolvedActiveChordSlot = resolvedActiveNotationTarget?.notationMode === 'chords'
    && resolvedActiveNotationTarget.cursor.kind === 'chord'
    ? {
        sectionId: resolvedActiveNotationTarget.sectionId,
        barId: resolvedActiveNotationTarget.barId,
        slotIndex: resolvedActiveNotationTarget.cursor.slotIndex
      }
    : null;
  const clearSectionDragLongPress = () => {
    if (sectionDragLongPressTimerRef.current !== null) {
      window.clearTimeout(sectionDragLongPressTimerRef.current);
      sectionDragLongPressTimerRef.current = null;
    }
  };
  const updateSectionDrag = (next: PreviewSectionDragState | null) => {
    sectionDragRef.current = next;
    setSectionDrag(next);
  };
  const activateSectionDrag = (candidate: PreviewSectionDragCandidate, clientX: number, clientY: number) => {
    candidate.active = true;
    sectionDragPointerYRef.current = clientY;
    suppressSectionTitleClickRef.current = true;
    updateSectionDrag({
      sourceSectionId: candidate.sourceSectionId,
      title: candidate.title,
      clientX,
      clientY,
      targetSectionId: candidate.sourceSectionId,
      placement: 'before'
    });
    startSectionDragAutoScroll();
  };
  const locateSectionDropTarget = (clientX: number, clientY: number) => {
    const elements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[];
    const target = elements
      .map((element) => element.closest<HTMLElement>('[data-preview-section-drop-target]'))
      .find(Boolean);
    if (!target?.dataset.previewSectionDropTarget) return null;
    const rect = target.getBoundingClientRect();
    return {
      sectionId: target.dataset.previewSectionDropTarget,
      placement: clientY < rect.top + rect.height / 2 ? 'before' as const : 'after' as const
    };
  };
  const autoScrollSectionDrag = (candidate: PreviewSectionDragCandidate, clientY: number) => {
    const scrollRoot = candidate.scrollRoot;
    if (!scrollRoot) return;
    const rect = scrollRoot.getBoundingClientRect();
    const edge = Math.min(72, rect.height * 0.18);
    if (clientY < rect.top + edge) scrollRoot.scrollTop -= 22;
    if (clientY > rect.bottom - edge) scrollRoot.scrollTop += 22;
  };
  const stopSectionDragAutoScroll = () => {
    if (sectionDragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(sectionDragAutoScrollFrameRef.current);
      sectionDragAutoScrollFrameRef.current = null;
    }
  };
  const startSectionDragAutoScroll = () => {
    stopSectionDragAutoScroll();
    const tick = () => {
      const candidate = sectionDragCandidateRef.current;
      if (!candidate?.active) {
        sectionDragAutoScrollFrameRef.current = null;
        return;
      }
      autoScrollSectionDrag(candidate, sectionDragPointerYRef.current);
      sectionDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    sectionDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  };
  const handleSectionTitlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    sectionId: string,
    title: string
  ) => {
    if (!onSectionReorder || event.button !== 0) return;
    clearSectionDragLongPress();
    const candidate: PreviewSectionDragCandidate = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      sourceSectionId: sectionId,
      title,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      scrollRoot: event.currentTarget.closest<HTMLElement>('[data-print-preview-container]')
    };
    sectionDragCandidateRef.current = candidate;
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    if (event.pointerType !== 'mouse') {
      sectionDragLongPressTimerRef.current = window.setTimeout(() => {
        if (sectionDragCandidateRef.current === candidate) {
          activateSectionDrag(candidate, candidate.startX, candidate.startY);
        }
      }, 350);
    }
  };
  const handleSectionTitlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const candidate = sectionDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
    if (!candidate.active) {
      if (candidate.pointerType === 'mouse' && distance > 4) {
        activateSectionDrag(candidate, event.clientX, event.clientY);
      } else if (candidate.pointerType !== 'mouse' && distance > 8) {
        clearSectionDragLongPress();
        suppressSectionTitleClickRef.current = true;
        sectionDragCandidateRef.current = null;
        return;
      }
    }
    if (!candidate.active) return;
    event.preventDefault();
    event.stopPropagation();
    sectionDragPointerYRef.current = event.clientY;
    autoScrollSectionDrag(candidate, event.clientY);
    const dropTarget = locateSectionDropTarget(event.clientX, event.clientY);
    const current = sectionDragRef.current;
    if (!current) return;
    updateSectionDrag({
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      targetSectionId: dropTarget?.sectionId ?? current.targetSectionId,
      placement: dropTarget?.placement ?? current.placement
    });
  };
  const finishSectionTitlePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const candidate = sectionDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    clearSectionDragLongPress();
    stopSectionDragAutoScroll();
    const completedDrag = sectionDragRef.current;
    if (candidate.active && completedDrag && completedDrag.sourceSectionId !== completedDrag.targetSectionId) {
      // Reordering can move several flex rows (and sometimes rows across print
      // pages) in the same render. Framer Motion's retained layout transforms
      // otherwise animate from the old page/row coordinates and can leave
      // apparent blank or duplicated "+" rows. Disable layout interpolation
      // for the structural reorder render, then restore it after layout settles.
      setKeepTransitionsSuppressed(true);
      onSectionReorder?.(completedDrag.sourceSectionId, completedDrag.targetSectionId, completedDrag.placement);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setKeepTransitionsSuppressed(false));
      });
    }
    sectionDragCandidateRef.current = null;
    updateSectionDrag(null);
  };
  React.useEffect(() => () => {
    clearSectionDragLongPress();
    stopSectionDragAutoScroll();
  }, []);
  const getLabelLaneDropTarget = (candidate: PreviewLabelLaneDragCandidate, clientY: number): BarLabelLane => {
    const rowRect = candidate.rowElement?.getBoundingClientRect();
    if (!rowRect || rowRect.height <= 0) {
      return clientY < candidate.startY ? 'rhythm' : 'riff';
    }

    // In three-line preview, the lower two notation rows occupy the row bottom.
    // Dropping above this split chooses row 2 (rhythm), below it chooses row 3 (riff).
    const lowerLaneSplitY = rowRect.bottom - 24;
    return clientY < lowerLaneSplitY ? 'rhythm' : 'riff';
  };
  const handleLabelLanePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    sIdx: number,
    bIdx: number,
    currentLane: BarLabelLane
  ) => {
    if (!onBarLabelLaneChange || event.button !== 0) return;
    event.stopPropagation();
    const pointerMode = getLabelLanePointerMode(event);
    const candidate: PreviewLabelLaneDragCandidate = {
      pointerId: event.pointerId,
      pointerMode,
      sIdx,
      bIdx,
      currentLane,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      longPressReady: pointerMode === 'mouse',
      longPressTimer: null,
      rowElement: event.currentTarget.closest<HTMLElement>('[data-preview-row-three-notation-rows]'),
      targetElement: event.currentTarget
    };
    labelLaneDragCandidateRef.current = candidate;

    if (pointerMode === 'mouse') {
      safeSetPointerCapture(event.currentTarget, event.pointerId);
      return;
    }

    candidate.longPressTimer = window.setTimeout(() => {
      const currentCandidate = labelLaneDragCandidateRef.current;
      if (currentCandidate !== candidate) return;
      candidate.longPressTimer = null;
      candidate.longPressReady = true;
      safeSetPointerCapture(candidate.targetElement, candidate.pointerId);
    }, LABEL_LANE_TOUCH_LONG_PRESS_MS);
  };
  const handleLabelLanePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const candidate = labelLaneDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
    if (!candidate.active && candidate.pointerMode === 'touch' && !candidate.longPressReady) {
      if (distance > LABEL_LANE_TOUCH_SCROLL_CANCEL_PX) {
        clearLabelLaneLongPress(candidate);
        labelLaneDragCandidateRef.current = null;
      }
      return;
    }
    const activateDistance = candidate.pointerMode === 'mouse'
      ? LABEL_LANE_MOUSE_ACTIVATE_PX
      : LABEL_LANE_TOUCH_ACTIVATE_PX;
    if (!candidate.active && distance > activateDistance) {
      clearLabelLaneLongPress(candidate);
      candidate.active = true;
      safeSetPointerCapture(candidate.targetElement, candidate.pointerId);
    }
    if (!candidate.active) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const finishLabelLaneDrag = (event: React.PointerEvent<HTMLElement>) => {
    const candidate = labelLaneDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    labelLaneDragCandidateRef.current = null;
    clearLabelLaneLongPress(candidate);
    safeReleasePointerCapture(candidate.targetElement, candidate.pointerId);
    if (!candidate.active) return;

    event.preventDefault();
    event.stopPropagation();
    suppressLabelLaneClickRef.current = true;
    const nextLane = getLabelLaneDropTarget(candidate, event.clientY);
    if (nextLane !== candidate.currentLane) {
      onBarLabelLaneChange?.(candidate.sIdx, candidate.bIdx, nextLane);
    }
  };
  const cancelLabelLaneDrag = (event: React.PointerEvent<HTMLElement>) => {
    const candidate = labelLaneDragCandidateRef.current;
    if (candidate?.pointerId === event.pointerId) {
      labelLaneDragCandidateRef.current = null;
      clearLabelLaneLongPress(candidate);
      safeReleasePointerCapture(candidate.targetElement, candidate.pointerId);
    }
  };
  const emitElementClick = (
    event: React.MouseEvent<HTMLElement>,
    sIdx: number,
    bIdx: number,
    field: ChordSheetElementField,
    explicitSlotIndex?: number,
    explicitRawChordIndex?: number,
    explicitCursor?: PreviewNotationCursor,
    explicitSectionTitleIntent?: 'actions' | 'rename'
  ) => {
    event.stopPropagation();
    if (!onElementClick) return;
    const section = song.sections[sIdx];
    const bar = bIdx >= 0 ? section?.bars[bIdx] : undefined;
    const beatCount = Math.max(1, Number.parseInt((bar?.timeSignature || song.timeSignature || '4/4').split('/')[0], 10) || 4);
    const hitRect = event.currentTarget.getBoundingClientRect();
    const calculatedSlotIndex = (field === 'chords' || field === 'lower') && bIdx >= 0
      ? Math.max(0, Math.min(beatCount - 1, Math.floor(((event.clientX - hitRect.left) / Math.max(1, hitRect.width)) * beatCount)))
      : null;
    const slotIndex = explicitSlotIndex ?? calculatedSlotIndex;
    const slotEntry = slotIndex !== null && bar
      ? getChordDisplaySlotEntries(bar.chords, beatCount)[slotIndex]
      : null;
    const rawChordIndex = explicitRawChordIndex ?? slotEntry?.rawIndex ?? null;
    const notationMode: PreviewNotationMode | null = field === 'chords'
      ? 'chords'
      : field === 'rhythm'
        ? 'rhythm'
        : field === 'riff'
          ? 'jianpu'
          : null;
    const cursor = explicitCursor ?? (notationMode === 'chords'
      ? {
          kind: 'chord' as const,
          slotIndex: slotIndex ?? 0,
          rawChordIndex
        }
      : notationMode === 'rhythm'
        ? { kind: 'rhythm' as const, cursorUnit: 0 }
        : notationMode === 'jianpu'
          ? { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
          : null);
    const anchorKey = field === 'sectionName'
      ? `${previewIdentity || 'preview'}|${section?.id || sIdx}|section|sectionName|${bar?.id || 'title'}`
      : `${previewIdentity || 'preview'}|${section?.id || sIdx}|${bar?.id || bIdx}|${notationMode ?? field}|${notationMode === 'chords' ? slotIndex ?? 0 : 'all'}`;
    const slotAnchor = notationMode === 'chords' && slotIndex !== null
      ? event.currentTarget.closest('.sheet-bar')?.querySelector<HTMLElement>(`[data-preview-slot-index="${slotIndex}"]`)
      : null;
    const notationAnchor = event.currentTarget.closest<HTMLElement>('[data-preview-edit-anchor]');
    onElementClick(sIdx, bIdx, field, {
      previewIdentity,
      sectionId: section?.id ?? null,
      barId: bar?.id ?? null,
      field,
      slotIndex,
      rawChordIndex,
      notationMode,
      cursor,
      sectionTitleIntent: field === 'sectionName' && bIdx < 0
        ? explicitSectionTitleIntent ?? (event.detail >= 2 ? 'rename' : 'actions')
        : undefined,
      anchorKey,
      anchorRect: getPreviewAnchorRect(slotAnchor ?? notationAnchor ?? event.currentTarget)
    });
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
  const songKeyStates = transposeFromOriginal
    ? getSongKeyStates(song)
    : {
      sectionBaseKeys: song.sections.map(() => baseWrittenKey),
      sectionActiveKeys: song.sections.map(() => baseWrittenKey),
      barBaseKeys: song.sections.map((section) => section.bars.map(() => baseWrittenKey)),
      barActiveKeys: song.sections.map((section) => section.bars.map(() => baseWrittenKey))
    };
  const sectionStartKeys = songKeyStates.sectionActiveKeys;
  const chartWrittenKeySequence = songKeyStates.barActiveKeys.flat().length > 0
    ? songKeyStates.barActiveKeys.flat()
    : (sectionStartKeys.length > 0 ? sectionStartKeys : [baseWrittenKey]);
  const displayedChartKeySequence = getConsecutiveKeySequence(
    chartWrittenKeySequence.map((key) => transposeKeyWithPreference(key, globalKeyShift, displayedCurrentKey))
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
  // Three-line mode deliberately fits fewer rows on each A4 page. The extra
  // vertical room is printable writable space, not an editor-only zoom.
  const barRowCount = song.barRowCount === 1 ? 1 : song.barRowCount === 3 ? 3 : 2;
  const ROWS_PER_PAGE_FIRST = barRowCount === 3 ? 8 : barRowCount === 1 ? 18 : 10;
  const ROWS_PER_PAGE_OTHER = barRowCount === 3 ? 9 : barRowCount === 1 ? 21 : 10;
  const pageIndexOfRow = (rowIndex: number) =>
    rowIndex < ROWS_PER_PAGE_FIRST
      ? 0
      : 1 + Math.floor((rowIndex - ROWS_PER_PAGE_FIRST) / ROWS_PER_PAGE_OTHER);

  const allowAddBar = Boolean(onAddBarClick);
  const allowAddSectionAfter = Boolean(onAddSectionAfterClick);
  // Older drafts can contain orphaned sections left behind by a cancelled
  // section split: no title and either no bars or only completely empty bars.
  // They are not real musical content, but rendering them creates the large
  // blank "+" rows seen between named sections. Keep the currently active one
  // visible while its title editor is open; otherwise omit these stale
  // placeholders from the preview. If the whole song is empty, retain one
  // section so a brand-new song remains editable.
  const previewSectionIndexes = song.sections
    .map((section, sIdx) => ({ section, sIdx }))
    .filter(({ section }) => (
      section.id === activeSectionId
      || Boolean(section.title.trim())
      || section.bars.some((bar) => !isBarCompletelyEmpty(bar))
    ))
    .map(({ sIdx }) => sIdx);
  if (previewSectionIndexes.length === 0 && song.sections.length > 0) {
    previewSectionIndexes.push(0);
  }
  const previewSectionIndexSet = new Set(previewSectionIndexes);
  const lastSectionIndex = previewSectionIndexes.at(-1) ?? song.sections.length - 1;
  type PreviewSheetRow = {
    kind: 'music' | 'add-choice' | 'closed-filler';
    sectionTitle: string | null;
    bars: Bar[];
    sIdx: number;
    startBIdx: number;
    addSectionAfter?: boolean;
    closedFillerId?: string;
    hasThreeNotationRows: boolean;
    hasLowerNotationRows: boolean;
    hasSectionStartLowerGutter: boolean;
    layoutWeight: number;
  };
  const allRows: PreviewSheetRow[] = [];
  const getRowHasThreeNotationRows = (bars: Bar[]) => bars.some((bar) => {
    if (!bar || !hasMeaningfulChordContent(bar.chords) || !bar.rhythm?.trim()) return false;
    const effectiveTimeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
    return hasVisiblePreviewRiff(getPreviewRiffNotation(bar.riff, effectiveTimeSignature));
  });
  const getRowHasLowerNotationRows = (bars: Bar[], startsSection = false) => bars.some((bar, barIdx) => {
    if (!bar) return false;
    const effectiveTimeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
    return Boolean(
      bar.rhythm?.trim()
      || hasVisiblePreviewRiff(getPreviewRiffNotation(bar.riff, effectiveTimeSignature))
      || bar.label?.trim()
      || bar.riffLabel?.trim()
      || bar.rhythmLabel?.trim()
      || (startsSection && barIdx === 0 && bar.timeSignature)
    );
  });
  // Empty bars are valid chart content: users intentionally add them before
  // entering chords. Never trim them from the preview or the newly-added bar
  // disappears immediately after clicking "+". Failed *sections* are filtered
  // above, while every bar in a retained section remains visible.
  const visibleSectionBars = song.sections.map((section) => section.bars);
  song.sections.forEach((section, sIdx) => {
    if (!previewSectionIndexSet.has(sIdx)) return;
    const sectionBars = visibleSectionBars[sIdx] ?? section.bars;
    const sectionRows = Math.max(1, Math.ceil(sectionBars.length / 4));
    for (let i = 0; i < sectionRows; i++) {
      const rowBars = sectionBars.slice(i * 4, i * 4 + 4);
      const hasThreeNotationRows = getRowHasThreeNotationRows(rowBars);
      const hasLowerNotationRows = getRowHasLowerNotationRows(rowBars, i === 0);
      const hasSectionStartLowerGutter = Boolean(
        barRowCount === 2
        && i === 0
        && section.title.trim()
        && rowBars[0]
        && (rowBars[0].timeSignature || getBarDisplayLabel(rowBars[0]))
      );
      allRows.push({
        kind: 'music',
        sectionTitle: i === 0 ? section.title : null,
        bars: rowBars,
        sIdx,
        startBIdx: i * 4,
        hasThreeNotationRows,
        hasLowerNotationRows,
        hasSectionStartLowerGutter,
        layoutWeight: barRowCount === 3
          ? 1
          : barRowCount === 1
            ? hasThreeNotationRows
              ? 2.2
              : hasLowerNotationRows
                ? 1.55
                : 1
            : hasThreeNotationRows
              ? 1.45
              : 1
      });
      }
  });

  // Adding after the final section is represented by one neutral choice row.
  // It does not become a bar or a section until the user explicitly chooses
  // which structure to create.
  const finalSection = song.sections[lastSectionIndex];
  const finalVisibleBars = visibleSectionBars[lastSectionIndex] ?? finalSection?.bars ?? [];
  if ((allowAddBar || allowAddSectionAfter) && finalSection && finalSection.bars.length > 0) {
    const addSectionRowIndex = allRows.length;
    if (addSectionRowIndex > 0 && pageIndexOfRow(addSectionRowIndex) === pageIndexOfRow(addSectionRowIndex - 1)) {
      allRows.push({
        kind: 'add-choice',
        sectionTitle: null,
        bars: [],
        sIdx: lastSectionIndex,
        startBIdx: finalVisibleBars.length,
        addSectionAfter: true,
        hasThreeNotationRows: false,
        hasLowerNotationRows: false,
        hasSectionStartLowerGutter: false,
        layoutWeight: 1
      });
    }
  }
  const sectionBarOffsets: number[] = [];
  let accumulatedBarCount = 0;
  song.sections.forEach((section, index) => {
    sectionBarOffsets.push(accumulatedBarCount);
    if (!previewSectionIndexSet.has(index)) return;
    accumulatedBarCount += visibleSectionBars[index]?.length ?? section.bars.length;
  });
  const barNumberMode = song.barNumberMode ?? 'none';
  const previewJianpuScale = 0.86;
  const riffLanePaddingXClass = 'px-1';
  const previewBottomLaneClass = 'h-[18px] flex items-center overflow-visible';
  const notationLaneHitClass = 'before:absolute before:left-0 before:right-0 before:-top-2 before:-bottom-2 before:content-[""]';

  const pages: PreviewSheetRow[][] = [];
  let activePageRows: PreviewSheetRow[] = [];
  let activePageWeight = 0;
  let activePageCapacity = ROWS_PER_PAGE_FIRST;

  allRows.forEach((row, rowIndex) => {
    const rowWeight = row.layoutWeight || 1;
    const nextRow = allRows[rowIndex + 1];
    const startsContinuingSection = row.kind === 'music'
      && row.startBIdx === 0
      && nextRow?.kind === 'music'
      && nextRow.sIdx === row.sIdx;
    const wouldOrphanSectionStart = startsContinuingSection
      && activePageRows.length > 0
      && activePageWeight + rowWeight + (nextRow.layoutWeight || 1) > activePageCapacity;
    if (wouldOrphanSectionStart) {
      const remainingPageWeight = activePageCapacity - activePageWeight;
      if (remainingPageWeight > 0) {
        const previousRow = activePageRows.at(-1);
        activePageRows.push({
          kind: 'closed-filler',
          sectionTitle: null,
          bars: [],
          sIdx: previousRow?.sIdx ?? row.sIdx,
          startBIdx: (previousRow?.startBIdx ?? 0) + 4,
          closedFillerId: `closed-${row.sIdx}-${row.startBIdx}`,
          hasThreeNotationRows: false,
          hasLowerNotationRows: false,
          hasSectionStartLowerGutter: false,
          layoutWeight: remainingPageWeight
        });
      }
      pages.push(activePageRows);
      activePageRows = [];
      activePageWeight = 0;
      activePageCapacity = ROWS_PER_PAGE_OTHER;
    }
    if (activePageRows.length > 0 && activePageWeight + rowWeight > activePageCapacity) {
      pages.push(activePageRows);
      activePageRows = [];
      activePageWeight = 0;
      activePageCapacity = ROWS_PER_PAGE_OTHER;
    }
    activePageRows.push(row);
    activePageWeight += rowWeight;
  });
  if (activePageRows.length > 0) {
    pages.push(activePageRows);
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
      {sectionDrag && typeof document !== 'undefined' && createPortal(
        <div
          data-preview-section-drag-ghost
          className="pointer-events-none fixed z-[6000] max-w-48 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-indigo-300 bg-white/95 px-3 py-2 text-sm font-black text-indigo-800 shadow-[0_14px_34px_rgba(30,41,59,0.26)] backdrop-blur"
          style={{ left: sectionDrag.clientX, top: sectionDrag.clientY }}
        >
          {sectionDrag.title.trim() || (language === 'zh' ? '未命名段落' : 'Untitled section')}
        </div>,
        document.body
      )}
      {pages.map((pageRows, pIdx) => {
        const currentSectionRow = pageRows.find((row) => row.sectionTitle) ?? pageRows[0] ?? null;
        const currentSectionIndex = currentSectionRow ? currentSectionRow.sIdx + 1 : 0;
        const currentSectionTitle = currentSectionRow?.sectionTitle ?? song.sections[currentSectionRow?.sIdx ?? 0]?.title ?? '';

        // Obvious top-of-page "page x of n" marker, only when the song spans more
        // than one page — a clear performance cue so it's hard to lose your place.
        const isMultiPage = showPageBadges && pages.length > 1;
        const pageBadge = isMultiPage ? (
          <div
            className="shrink-0 inline-flex items-baseline gap-1 rounded-lg border-2 border-emerald-500 bg-white px-2.5 py-1 leading-none shadow-sm"
            aria-label={language === 'zh' ? `第 ${pIdx + 1} 頁，共 ${pages.length} 頁` : `Page ${pIdx + 1} of ${pages.length}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              {language === 'zh' ? '頁' : 'P'}
            </span>
            <span className="text-lg font-extrabold tabular-nums text-emerald-700">{pIdx + 1}</span>
            <span className="text-sm font-bold text-gray-300">/</span>
            <span className="text-sm font-bold tabular-nums text-gray-400">{pages.length}</span>
          </div>
        ) : null;

        return (
        <div
          key={pIdx}
          data-print-page
          data-sheet-bar-row-count={barRowCount}
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
                {onMetaClick ? (
                  <button
                    type="button"
                    {...getMetaAnchorProps('metadata')}
                    data-preview-only-control
                    aria-label={language === 'zh' ? '編輯歌曲資訊' : 'Edit song information'}
                    title={language === 'zh' ? '歌曲資訊' : 'Song information'}
                    className="absolute right-0 top-[42px] z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white/95 px-2.5 text-[10px] font-bold tracking-normal text-indigo-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <SlidersHorizontal size={13} aria-hidden="true" />
                    <span>{language === 'zh' ? '歌曲資訊' : 'Song info'}</span>
                  </button>
                ) : null}
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
          <div
            data-sheet-content-area
            className={`flex-1 flex flex-col min-h-0 w-full ${barRowCount === 1 ? 'gap-y-4 sm:gap-y-5' : 'gap-y-6 sm:gap-y-8'}`}
          >
            {pageRows.map((row, rIdx) => {
              const section = song.sections[row.sIdx];
              if (row.kind === 'closed-filler') {
                return (
                  <motion.div
                    key={row.closedFillerId || `closed-${pIdx}-${rIdx}`}
                    data-preview-closed-page-row
                    data-preview-layout-weight={row.layoutWeight}
                    className="relative flex w-full min-h-0 flex-1 rounded-lg transition-all"
                    style={{ flexGrow: row.layoutWeight || 1 }}
                    layout={!suppressSectionTransitions}
                    initial={false}
                  >
                    <div className="relative w-16 sm:w-20 shrink-0" />
                    <div
                      data-preview-invisible-page-spacer
                      className="flex-1 min-h-0"
                    />
                  </motion.div>
                );
              }
              const sectionWrittenKey = sectionStartKeys[row.sIdx] || song.originalKey;
              const sectionCurrentKey = transposeKeyWithPreference(sectionWrittenKey, globalKeyShift, displayedCurrentKey);
              const sectionPlayKey = getPlayKey(sectionCurrentKey, capo);
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
              const sectionStartBar = row.startBIdx === 0 ? row.bars[0] : undefined;
              const sectionStartBarLabel = getBarDisplayLabel(sectionStartBar);
              const sectionStartEffectiveTimeSignature = getEffectiveTimeSignature(sectionStartBar?.timeSignature, song.timeSignature);
              const sectionStartHasRhythm = Boolean(sectionStartBar?.rhythm?.trim());
              const sectionStartHasRiff = hasVisiblePreviewRiff(getPreviewRiffNotation(sectionStartBar?.riff, sectionStartEffectiveTimeSignature));
              const sectionStartDefaultLabelLane: BarLabelLane = sectionStartHasRhythm && sectionStartHasRiff && !sectionStartBar?.timeSignature ? 'rhythm' : 'riff';
              const sectionStartLabelLane: BarLabelLane = sectionStartBar?.labelLane === 'rhythm'
                ? 'rhythm'
                : sectionStartBar?.labelLane === 'riff'
                  ? 'riff'
                  : sectionStartDefaultLabelLane;
              const canDragSectionStartLabelLane = Boolean(
                onBarLabelLaneChange
                && barRowCount === 3
                && sectionStartBar
                && (sectionStartHasRhythm || sectionStartHasRiff)
                && sectionStartBarLabel
              );
              const sectionStartTimeSignature = sectionStartBar?.timeSignature
                ? splitDisplayTimeSignature(sectionStartEffectiveTimeSignature)
                : null;
              const showSectionStartGutterTimeSignature = Boolean(
                row.kind === 'music'
                && row.startBIdx === 0
                && section?.title.trim()
                && sectionStartBar
                && !hasPickupDisplay
                && sectionStartTimeSignature
              );
              const showSectionStartGutterLabel = Boolean(
                row.kind === 'music'
                && row.startBIdx === 0
                && section?.title.trim()
                && sectionStartBar
                && !hasPickupDisplay
                && sectionStartBarLabel
              );
              const showSectionStartLowerGutter = showSectionStartGutterLabel || showSectionStartGutterTimeSignature;
              const compactSectionStartLowerGutter = Boolean(barRowCount === 2 && sectionStartTimeSignature);
              const alignSectionStartGutterLabelWithRhythmLane = Boolean(
                barRowCount === 3
                && sectionStartLabelLane === 'rhythm'
                && sectionStartHasRhythm
                && sectionStartHasRiff
                && !sectionStartTimeSignature
              );
              const renderSectionStartGutterLabel = () => (
                <div
                  data-preview-section-gutter-label
                  data-preview-bar-label
                  data-preview-label-lane={sectionStartLabelLane}
                  data-preview-suppress-pan={canDragSectionStartLabelLane ? true : undefined}
                  className={`flex ${compactSectionStartLowerGutter ? 'h-[13px]' : 'h-[14px]'} min-w-0 max-w-full select-none items-center justify-center rounded-sm border border-black bg-gray-300/70 px-1 mix-blend-multiply leading-none transition-colors ${
                    onElementClick ? 'cursor-pointer hover:bg-indigo-200/70' : ''
                  } ${canDragSectionStartLabelLane ? 'active:cursor-grabbing sm:cursor-grab' : ''}`}
                  style={canDragSectionStartLabelLane ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                  title={canDragSectionStartLabelLane ? getLabelLaneDragTitle(language) : undefined}
                  onMouseDown={canDragSectionStartLabelLane ? (event) => event.stopPropagation() : undefined}
                  onPointerDown={canDragSectionStartLabelLane ? (event) => handleLabelLanePointerDown(event, row.sIdx, 0, sectionStartLabelLane) : undefined}
                  onPointerMove={canDragSectionStartLabelLane ? handleLabelLanePointerMove : undefined}
                  onPointerUp={canDragSectionStartLabelLane ? finishLabelLaneDrag : undefined}
                  onPointerCancel={canDragSectionStartLabelLane ? cancelLabelLaneDrag : undefined}
                  onClick={onElementClick ? (event) => {
                    if (suppressLabelLaneClickRef.current) {
                      suppressLabelLaneClickRef.current = false;
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    event.stopPropagation();
                    emitElementClick(event, row.sIdx, 0, 'label');
                  } : undefined}
                >
                  <AutoShrink align="center" minScale={0.64} className="h-full items-center overflow-visible">
                    <span className="inline-flex -translate-y-[1.5px] items-center justify-center whitespace-nowrap text-[8px] font-bold uppercase leading-none text-black">
                      {sectionStartBarLabel}
                    </span>
                  </AutoShrink>
                </div>
              );

              return (
                <motion.div
                  key={`${section?.id || row.sIdx}-${row.kind}-${row.startBIdx}`}
                  data-preview-section-id={section?.id || ''}
                  data-preview-add-choice-row={row.kind === 'add-choice' ? 'true' : undefined}
                  data-preview-only-control={row.kind === 'add-choice' ? 'true' : undefined}
                  data-preview-row-three-notation-rows={row.hasThreeNotationRows ? true : undefined}
                  data-preview-row-lower-notation-rows={row.hasLowerNotationRows ? true : undefined}
                  data-preview-section-start-lower-gutter={row.hasSectionStartLowerGutter ? true : undefined}
                  data-preview-layout-weight={row.layoutWeight}
                  data-preview-section-drop-target={row.startBIdx === 0 ? section?.id || '' : undefined}
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
                  className={`relative flex w-full rounded-lg transition-all ${
                    barRowCount === 3
                      ? 'min-h-0 flex-1'
                      : barRowCount === 1
                        ? row.hasThreeNotationRows
                          ? 'min-h-[94px] flex-[2.2]'
                          : row.hasLowerNotationRows
                            ? 'min-h-[58px] flex-[1.55]'
                            : 'min-h-[34px] flex-1'
                        : row.hasThreeNotationRows
                          ? 'min-h-[94px] flex-[1.45]'
                          : row.hasLowerNotationRows
                            ? 'min-h-[68px] flex-[1.18]'
                            : 'min-h-0 flex-1'
                  }`}
                >
                  {row.startBIdx === 0 && sectionDrag?.targetSectionId === section?.id && (
                    <span
                      data-preview-section-drop-line={sectionDrag.placement}
                      className={`pointer-events-none absolute left-0 right-0 z-50 h-1 rounded-full bg-indigo-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] ${sectionDrag.placement === 'before' ? '-top-1.5' : '-bottom-1.5'}`}
                    />
                  )}
                  {/* Left Column: Section Title */}
                <div className="relative w-16 sm:w-20 shrink-0 flex flex-col items-center justify-start pr-2 pt-1 overflow-visible">
                    {(row.startBIdx === 0 || row.addSectionAfter || (onElementClick && row.startBIdx > 0 && Boolean(row.bars[0]))) && (() => {
                      const isSectionStartRow = row.startBIdx === 0;
                      const title = isSectionStartRow ? section?.title ?? '' : '';
                      const colors = getSectionColor(title, true);
                      const hasManualLineBreak = title.includes('\n');
                      const sectionAnchorKey = `${previewIdentity || 'preview'}|${section?.id || row.sIdx}|section|sectionName|${isSectionStartRow ? 'title' : row.bars[0]?.id || 'row'}`;
                      if (row.addSectionAfter) {
                        return onAddSectionAfterClick ? (
                          <button
                            type="button"
                            data-preview-only-control="true"
                            data-preview-add-section-after={section?.id}
                            className="group/section-title inline-flex min-h-[21px] w-full items-center justify-center whitespace-nowrap rounded-full border border-dashed border-gray-200 bg-gray-50/75 px-1 text-[9px] font-black leading-none text-gray-400 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500"
                            aria-label={language === 'zh' ? '新增段落' : 'Add section'}
                            onMouseDown={(event) => event.stopPropagation()}
                            onTouchStart={(event) => event.stopPropagation()}
                            onClick={() => onAddSectionAfterClick(row.sIdx)}
                          >
                            {language === 'zh' ? '＋ 段落' : '+ Section'}
                          </button>
                        ) : null;
                      }
                      return (
                        <div className={`w-full flex justify-center transition-all ${isActiveSection ? 'scale-[1.02]' : ''}`}>
                          <div className="relative flex w-full justify-center">
                            <button
                              type="button"
                              data-preview-edit-anchor={sectionAnchorKey}
                              data-preview-section-title={isSectionStartRow ? section?.id : undefined}
                              data-preview-section-split={isSectionStartRow ? undefined : row.bars[0]?.id}
                              data-preview-only-control={isSectionStartRow ? undefined : 'true'}
                              className={`group/section-title flex w-full select-none items-center justify-center rounded-sm px-1 py-1 min-h-[24px] overflow-visible ${isSectionStartRow && title ? 'border' : 'border border-dashed border-transparent'} ${onElementClick ? `${isSectionStartRow ? 'cursor-pointer' : 'cursor-text'} transition-all hover:border-indigo-300 hover:bg-indigo-50/55 hover:shadow-[0_0_0_2px_rgba(99,102,241,0.22)]` : ''} ${isSectionStartRow && onSectionReorder ? 'active:cursor-grabbing sm:cursor-grab' : ''}`}
                              style={{
                                ...(isSectionStartRow && title ? getSectionBadgeStyle(colors.accent) : undefined),
                                ...(isSectionStartRow && onSectionReorder ? { touchAction: 'none', WebkitUserSelect: 'none' } : undefined)
                              }}
                              disabled={!onElementClick}
                              aria-label={isSectionStartRow
                                ? (language === 'zh' ? `開啟段落操作 ${title || '未命名段落'}` : `Open section actions ${title || 'Untitled section'}`)
                                : (language === 'zh' ? '從本行分段並命名' : 'Split and name a new section from this row')}
                              onMouseDown={(event) => event.stopPropagation()}
                              onTouchStart={(event) => event.stopPropagation()}
                              onContextMenu={isSectionStartRow && onSectionReorder ? (event) => event.preventDefault() : undefined}
                              onPointerDown={isSectionStartRow && section?.id ? (event) => handleSectionTitlePointerDown(event, section.id!, title) : undefined}
                              onPointerMove={isSectionStartRow ? handleSectionTitlePointerMove : undefined}
                              onPointerUp={isSectionStartRow ? finishSectionTitlePointer : undefined}
                              onPointerCancel={isSectionStartRow ? () => {
                                clearSectionDragLongPress();
                                stopSectionDragAutoScroll();
                                sectionDragCandidateRef.current = null;
                                updateSectionDrag(null);
                              } : undefined}
                              onClick={onElementClick ? (event) => {
                                if (suppressSectionTitleClickRef.current) {
                                  suppressSectionTitleClickRef.current = false;
                                  lastSectionTitleClickRef.current = null;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                if (!isSectionStartRow || !section?.id) {
                                  emitElementClick(event, row.sIdx, row.startBIdx, 'sectionName');
                                  return;
                                }
                                const now = window.performance.now();
                                const previousClick = lastSectionTitleClickRef.current;
                                const isDoubleClick = event.detail >= 2
                                  || previousClick?.sectionId === section.id
                                  && now - previousClick.at <= SECTION_TITLE_DOUBLE_CLICK_WINDOW_MS;
                                lastSectionTitleClickRef.current = isDoubleClick
                                  ? null
                                  : { sectionId: section.id, at: now };
                                emitElementClick(
                                  event,
                                  row.sIdx,
                                  -1,
                                  'sectionName',
                                  undefined,
                                  undefined,
                                  undefined,
                                  isDoubleClick ? 'rename' : 'actions'
                                );
                              } : undefined}
                              onDoubleClick={isSectionStartRow && onElementClick && section?.id ? (event) => {
                                event.preventDefault();
                                lastSectionTitleClickRef.current = null;
                                emitElementClick(
                                  event,
                                  row.sIdx,
                                  -1,
                                  'sectionName',
                                  undefined,
                                  undefined,
                                  undefined,
                                  'rename'
                                );
                              } : undefined}
                            >
                              {!title ? (
                                <span
                                  className="inline-flex whitespace-nowrap rounded-full border border-gray-200 bg-gray-50/80 px-1 py-0.5 text-[9px] font-black leading-none tracking-[-0.03em] text-gray-400 transition-colors group-hover/section-title:border-gray-300 group-hover/section-title:bg-gray-100 group-hover/section-title:text-gray-500"
                                  aria-hidden="true"
                                >
                                  {isSectionStartRow
                                    ? (language === 'zh' ? '＋ 命名' : '+ Name')
                                    : (language === 'zh' ? '＋ 分段' : '+ Split')}
                                </span>
                              ) : hasManualLineBreak ? (
                                <div className="flex w-full flex-col items-center gap-[1px] px-[1px] text-center">
                                  {formatSectionTitleDisplay(title, language).split(/\r?\n/).map((line, lineIndex) => (
                                    <AutoShrink key={`${line}-${lineIndex}`} align="center" minScale={0.52} className="overflow-visible">
                                      <div className="whitespace-nowrap text-[10px] font-black tracking-[0.04em] leading-[1.05]">
                                        {line}
                                      </div>
                                    </AutoShrink>
                                  ))}
                                </div>
                              ) : (
                                <div className="w-full px-[1px]">
                                  <AutoShrink align="center" minScale={0.52} className="overflow-visible">
                                    <div className="text-[11px] font-black tracking-[0.04em] leading-none">
                                      {formatSectionTitleDisplay(title, language)}
                                    </div>
                                  </AutoShrink>
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {showSectionStartLowerGutter && (
                      <div
                        data-preview-section-lower-gutter
                        data-preview-section-lower-gutter-compact={compactSectionStartLowerGutter ? true : undefined}
                        data-preview-suppress-pan={canDragSectionStartLabelLane ? true : undefined}
                        className={`absolute right-2 z-10 flex max-w-[calc(100%-8px)] flex-col items-end overflow-visible ${
                          alignSectionStartGutterLabelWithRhythmLane
                            ? 'bottom-[30px] gap-0'
                            : compactSectionStartLowerGutter
                              ? 'bottom-[2px] gap-0'
                              : 'bottom-[6px] gap-0.5'
                        } ${canDragSectionStartLabelLane ? 'active:cursor-grabbing sm:cursor-grab' : ''}`}
                        style={canDragSectionStartLabelLane ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                        title={canDragSectionStartLabelLane ? getLabelLaneDragTitle(language) : undefined}
                        onMouseDown={canDragSectionStartLabelLane ? (event) => event.stopPropagation() : undefined}
                        onPointerDown={canDragSectionStartLabelLane ? (event) => handleLabelLanePointerDown(event, row.sIdx, 0, sectionStartLabelLane) : undefined}
                        onPointerMove={canDragSectionStartLabelLane ? handleLabelLanePointerMove : undefined}
                        onPointerUp={canDragSectionStartLabelLane ? finishLabelLaneDrag : undefined}
                        onPointerCancel={canDragSectionStartLabelLane ? cancelLabelLaneDrag : undefined}
                      >
                        {showSectionStartGutterTimeSignature && sectionStartTimeSignature && sectionStartLabelLane !== 'rhythm' && (
                          <div
                            data-preview-section-gutter-time-signature
                            className="flex w-[18px] shrink-0 flex-col items-center justify-center self-center text-[17px] font-semibold italic leading-[0.72] text-[#1e3a8a] pointer-events-none select-none"
                            aria-hidden="true"
                          >
                            <span>{sectionStartTimeSignature.numerator}</span>
                            {sectionStartTimeSignature.denominator && <span>{sectionStartTimeSignature.denominator}</span>}
                          </div>
                        )}
                        {showSectionStartGutterLabel && (
                          renderSectionStartGutterLabel()
                        )}
                        {showSectionStartGutterTimeSignature && sectionStartTimeSignature && sectionStartLabelLane === 'rhythm' && (
                          <div
                            data-preview-section-gutter-time-signature
                            data-preview-section-gutter-time-signature-swapped
                            className="flex w-[18px] shrink-0 flex-col items-center justify-center self-center text-[17px] font-semibold italic leading-[0.72] text-[#1e3a8a] pointer-events-none select-none"
                            aria-hidden="true"
                          >
                            <span>{sectionStartTimeSignature.numerator}</span>
                            {sectionStartTimeSignature.denominator && <span>{sectionStartTimeSignature.denominator}</span>}
                          </div>
                        )}
                        {showSectionStartGutterLabel && sectionStartLabelLane === 'rhythm' && !sectionStartTimeSignature && !alignSectionStartGutterLabelWithRhythmLane && (
                          <span className="h-[14px] shrink-0" aria-hidden="true" />
                        )}
                      </div>
                    )}
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
                              <div className="relative z-10 w-full">
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
                <div
                  className="flex-1 grid min-h-0 grid-cols-4 w-full"
                  data-rhythm-measure-row={row.kind === 'music' ? true : undefined}
                >
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
                    const globalBarIndex = row.startBIdx + bIdx;
                    const barWrittenKey = songKeyStates.barActiveKeys[row.sIdx]?.[globalBarIndex] ?? sectionWrittenKey;
                    const previousBarWrittenKey = globalBarIndex > 0
                      ? songKeyStates.barActiveKeys[row.sIdx]?.[globalBarIndex - 1] ?? sectionWrittenKey
                      : row.sIdx > 0
                        ? songKeyStates.barActiveKeys[row.sIdx - 1]?.at(-1) ?? sectionStartKeys[row.sIdx - 1] ?? song.originalKey
                        : song.originalKey;
                    const barCurrentKey = bar?.keyChangeTo
                      ? transposeKeyPreservingSpelling(bar.keyChangeTo, globalKeyShift)
                      : transposeKeyWithPreference(barWrittenKey, globalKeyShift, displayedCurrentKey);
                    const previousBarCurrentKey = globalBarIndex > 0 || row.sIdx > 0
                      ? transposeKeyWithPreference(previousBarWrittenKey, globalKeyShift, displayedCurrentKey)
                      : displayedCurrentKey;
                    const barPlayKey = getPlayKey(barCurrentKey, capo);
                    const barOffset = getTransposeOffset(barWrittenKey, barPlayKey);
                    const showKeyChangeTag = Boolean(bar) && barCurrentKey !== previousBarCurrentKey;
                    const effectiveTimeSignature = bar ? getEffectiveTimeSignature(bar.timeSignature, song.timeSignature) : song.timeSignature;
                    const canonicalRiffNotation = getPreviewRiffNotation(bar?.riff, effectiveTimeSignature);
                    const previewRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(canonicalRiffNotation, barPlayKey)
                      : canonicalRiffNotation;
                    const previousBarGlobalIndex = globalBarIndex - 1;
                    const previousPlayKey = previousBarGlobalIndex >= 0
                      ? getPlayKey(
                        transposeKeyWithPreference(
                          songKeyStates.barActiveKeys[row.sIdx]?.[previousBarGlobalIndex] ?? barWrittenKey,
                          globalKeyShift,
                          displayedCurrentKey
                        ),
                        capo
                      )
                      : barPlayKey;
                    const nextBarGlobalIndex = globalBarIndex + 1;
                    const nextPlayKey = getPlayKey(
                      transposeKeyWithPreference(
                        songKeyStates.barActiveKeys[row.sIdx]?.[nextBarGlobalIndex] ?? barWrittenKey,
                        globalKeyShift,
                        displayedCurrentKey
                      ),
                      capo
                    );
                    const previousCanonicalRiffNotation = getPreviewRiffNotation(
                      bIdx > 0 ? row.bars[bIdx - 1]?.riff : undefined,
                      getEffectiveTimeSignature(row.bars[bIdx - 1]?.timeSignature, song.timeSignature)
                    );
                    const previewPreviousRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(previousCanonicalRiffNotation, previousPlayKey)
                      : previousCanonicalRiffNotation;
                    const nextCanonicalRiffNotation = getPreviewRiffNotation(
                      bIdx < row.bars.length - 1 ? row.bars[bIdx + 1]?.riff : undefined,
                      getEffectiveTimeSignature(row.bars[bIdx + 1]?.timeSignature, song.timeSignature)
                    );
                    const previewNextRiffNotation = song.showAbsoluteJianpu
                      ? convertRelativeJianpuToAbsoluteNotation(nextCanonicalRiffNotation, nextPlayKey)
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
                    const hasInlineTimeSignature = Boolean(bar?.timeSignature);
                    const isSectionLeadBar = Boolean(row.startBIdx === 0 && bIdx === 0 && section?.title.trim() && !hasPickupDisplay);
                    const showSectionGutterBarLabel = hasBarLabel && isSectionLeadBar;
                    const showSectionGutterTimeSignature = hasInlineTimeSignature && isSectionLeadBar;
                    const hasBarLabelInMeasure = hasBarLabel && !showSectionGutterBarLabel;
                    const showInlineTimeSignatureBarLabel = hasBarLabelInMeasure && hasInlineTimeSignature;
                    const hasBarLabelInContentLane = hasBarLabelInMeasure && !showInlineTimeSignatureBarLabel;
                    const labelSharesNotationLane = hasBarLabelInContentLane && (hasRhythm || hasRiff);
                    const isActiveNotationBar = Boolean(
                      resolvedActiveNotationTarget
                      && resolvedActiveNotationTarget.sectionId === section?.id
                      && resolvedActiveNotationTarget.barId === bar?.id
                    );
                    const activeRhythmCursor = isActiveNotationBar
                      && resolvedActiveNotationTarget?.notationMode === 'rhythm'
                      && resolvedActiveNotationTarget.cursor.kind === 'rhythm'
                      ? resolvedActiveNotationTarget.cursor
                      : null;
                    const activeJianpuCursor = isActiveNotationBar
                      && resolvedActiveNotationTarget?.notationMode === 'jianpu'
                      && resolvedActiveNotationTarget.cursor.kind === 'jianpu'
                      ? resolvedActiveNotationTarget.cursor
                      : null;
                    const notationBeatUnits = Math.max(1, parseTimeSignature(effectiveTimeSignature).beatUnits);
                    const renderActiveNotationCursor = () => {
                      const cursorUnit = activeRhythmCursor
                        ? activeRhythmCursor.cursorUnit
                        : activeJianpuCursor
                          ? (activeJianpuCursor.beatIndex * notationBeatUnits) + activeJianpuCursor.unitIndex
                          : null;
                      if (cursorUnit === null) return null;
                      const beatIndex = Math.max(0, Math.min(beatsPerBar - 1, Math.floor(cursorUnit / notationBeatUnits)));
                      const clampedCursorUnit = Math.max(0, Math.min(beatsPerBar * notationBeatUnits, cursorUnit));
                      return (
                        <>
                          <span
                            data-preview-edit-ui
                            data-preview-notation-cursor-beat
                            className="pointer-events-none absolute inset-y-0 z-[1] rounded-sm bg-emerald-100/55 ring-1 ring-inset ring-emerald-500/65"
                            style={{
                              left: `${(beatIndex / beatsPerBar) * 100}%`,
                              width: `${100 / beatsPerBar}%`
                            }}
                          />
                          <span
                            data-preview-edit-ui
                            data-preview-notation-cursor-caret
                            className="pointer-events-none absolute top-1 bottom-1 z-[2] w-[2px] -translate-x-1/2 rounded-full bg-emerald-600 shadow-[0_0_0_2px_rgba(255,255,255,0.78)]"
                            style={{ left: `${(clampedCursorUnit / (beatsPerBar * notationBeatUnits)) * 100}%` }}
                          />
                        </>
                      );
                    };
                    const emitRhythmSelection = (
                      cursorUnit: number,
                      event?: React.MouseEvent<HTMLElement>
                    ) => {
                      if (!event) return;
                      emitElementClick(
                        event,
                        row.sIdx,
                        row.startBIdx + bIdx,
                        'rhythm',
                        undefined,
                        undefined,
                        { kind: 'rhythm', cursorUnit }
                      );
                    };
                    const emitJianpuNoteSelection = (
                      beatIndex: number,
                      noteIndex: number,
                      event?: React.MouseEvent<HTMLElement>
                    ) => {
                      if (!event) return;
                      const cursor = section?.id && bar?.id
                        ? getJianpuCursorForNote(song, { sectionId: section.id, barId: bar.id }, beatIndex, noteIndex)
                        : null;
                      emitElementClick(
                        event,
                        row.sIdx,
                        row.startBIdx + bIdx,
                        'riff',
                        undefined,
                        undefined,
                        { kind: 'jianpu', ...(cursor ?? { beatIndex, unitIndex: noteIndex, noteIndex }) }
                      );
                    };
                    const emitJianpuInsertSelection = (
                      beatIndex: number,
                      unitIndex: number,
                      event?: React.MouseEvent<HTMLElement>
                    ) => {
                      if (!event) return;
                      emitElementClick(
                        event,
                        row.sIdx,
                        row.startBIdx + bIdx,
                        'riff',
                        undefined,
                        undefined,
                        { kind: 'jianpu', beatIndex, unitIndex, noteIndex: null }
                      );
                    };
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
                    const showBottomLane = showBottomRhythmLane || hasRiff || labelSharesNotationLane;
                    // Existing rhythm/jianpu is already its own precise hit
                    // target. Reserving another empty lane below it pushes the
                    // visible notation upward, so the remembered-mode target is
                    // only needed while both notation lanes are empty.
                    const showEmptyLowerHit = Boolean(onElementClick && barRowCount !== 1 && !hasRhythm && !hasRiff);
                    const compactModifier = Boolean(
                      bar?.ending ||
                      bar?.annotation ||
                      leftNavigationText ||
                      rightNavigationText
                    );
                    const isEndingStart = Boolean(bar?.ending) && (!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending);
                    const isEndingEnd = Boolean(bar?.ending) && (!row.bars[bIdx + 1] || row.bars[bIdx + 1].ending !== bar.ending);
                    const isUnusedBar = !bar;
                    const showAddBarButton = Boolean(
                      isUnusedBar
                      && onAddBarClick
                      && (
                        (row.addSectionAfter && bIdx === 0 && row.startBIdx % 4 === 0)
                        || (!row.addSectionAfter && row.bars.length > 0 && bIdx === row.bars.length)
                      )
                    );
                    const labelLane: BarLabelLane = bar?.labelLane === 'rhythm' ? 'rhythm' : 'riff';
                    const labelUsesStandaloneRhythmLane = hasBarLabelInContentLane && labelLane === 'rhythm' && hasRiff && !showBottomRhythmLane;
                    const hasThreeNotationRows = hasChordContent && hasRhythm && hasRiff;
                    const lowerLaneCount = bar
                      ? hasThreeNotationRows
                        ? 2
                        : showBottomRhythmLane && hasRiff
                          ? 2
                          : labelUsesStandaloneRhythmLane
                            ? 2
                            : (labelSharesNotationLane || showBottomRhythmLane || hasRiff ? 1 : 0)
                      : 0;
                    const barPaddingBottom = hasThreeNotationRows
                      ? 58
                      : lowerLaneCount >= 2
                        ? 38
                        : lowerLaneCount === 1
                          ? 20
                          : barRowCount === 1
                            ? 6
                            : 24;
                    const sharedLaneClass = previewBottomLaneClass;
                    const { numerator: displayNumerator, denominator: displayDenominator } = splitDisplayTimeSignature(effectiveTimeSignature);
                    const contentLeftInsetClass = showInlineTimeSignatureBarLabel
                      ? bar?.repeatStart ? 'pl-9' : 'pl-8'
                      : hasInlineTimeSignature && !showSectionGutterTimeSignature
                        ? 'pl-6'
                      : bar?.repeatStart
                        ? 'pl-3.5'
                        : '';
                    const canDragLabelLane = Boolean(onBarLabelLaneChange && barRowCount === 3 && hasBarLabelInMeasure && (showBottomRhythmLane || hasRiff));
                    const inlineTimeSignatureLabelBottomClass = labelLane === 'rhythm' ? 'bottom-[30px]' : 'bottom-[6px]';
                    const shouldOffsetInlineTimeSignatureForLabel = Boolean(
                      barRowCount === 3
                      && showInlineTimeSignatureBarLabel
                      && labelLane === 'rhythm'
                    );
                    const inlineTimeSignaturePositionClass = shouldOffsetInlineTimeSignatureForLabel
                      ? 'top-[10px]'
                      : 'top-1/2 -translate-y-1/2';
                    const renderBarLabelBadge = (className: string, options?: { shrink?: boolean; inlineTimeSignature?: boolean }) => (
                      <div
                        data-preview-inline-time-signature-label={options?.inlineTimeSignature ? true : undefined}
                        data-preview-bar-label
                        data-preview-label-lane={labelLane}
                        data-preview-suppress-pan={canDragLabelLane ? true : undefined}
                        className={`${className} select-none ${canDragLabelLane ? 'active:cursor-grabbing sm:cursor-grab' : ''}`}
                        style={canDragLabelLane ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                        onMouseDown={canDragLabelLane ? (event) => event.stopPropagation() : undefined}
                        onPointerDown={canDragLabelLane ? (event) => handleLabelLanePointerDown(event, row.sIdx, row.startBIdx + bIdx, labelLane) : undefined}
                        onPointerMove={canDragLabelLane ? handleLabelLanePointerMove : undefined}
                        onPointerUp={canDragLabelLane ? finishLabelLaneDrag : undefined}
                        onPointerCancel={canDragLabelLane ? cancelLabelLaneDrag : undefined}
                        onClick={(e) => {
                          if (suppressLabelLaneClickRef.current) {
                            suppressLabelLaneClickRef.current = false;
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          e.stopPropagation();
                          emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'label');
                        }}
                        title={canDragLabelLane ? getLabelLaneDragTitle(language) : undefined}
                      >
                        {options?.shrink ? (
                          <AutoShrink align="center" minScale={0.64} className="h-full items-center overflow-visible">
                            <span className="inline-flex -translate-y-[1.5px] items-center justify-center whitespace-nowrap text-[8px] font-bold uppercase leading-none text-black">
                              {barLabel}
                            </span>
                          </AutoShrink>
                        ) : (
                          <span className="text-[8px] font-bold text-black uppercase leading-none">
                            {barLabel}
                          </span>
                        )}
                      </div>
                    );
                    const shouldReserveBarNumberForNavigationMarker = Boolean(bar?.leftMarker || previousBar?.rightMarker);
                    const showBarNumber = Boolean(
                      bar
                      && barNumberMode !== 'none'
                      && (barNumberMode === 'all' || bIdx === 0)
                      && !shouldReserveBarNumberForNavigationMarker
                    );
                    const barNumberTopClass = bar?.ending
                      ? 'top-[10px]'
                      : bar?.repeatStart
                        ? '-top-[8px]'
                        : '-top-[2px]';
                    const isActiveBar = activeBar?.sIdx === row.sIdx && activeBar?.bIdx === row.startBIdx + bIdx;
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
                    const endingDisplayText = formatEndingDisplay(bar?.ending);
                    const hasMultipleEndingNumbers = Boolean(bar?.ending?.includes(','));
                    const endingTopClass = '-top-[16px]';

                    return (
	                      <div
	                        key={bIdx}
	                        data-preview-lower-lanes={onElementClick ? lowerLaneCount : undefined}
	                        data-preview-three-notation-rows={hasThreeNotationRows ? true : undefined}
                        className={`sheet-bar relative min-h-0 px-1 pt-1.5 flex flex-col min-w-0 ${leftBorderClass} ${rightBorderClass} ${bar?.repeatStart ? 'sheet-has-repeat-start' : ''} ${
                          previousBar?.repeatEnd ? 'sheet-after-repeat-end' : ''
                        } ${previousBar?.finalBar ? 'sheet-after-final-bar' : ''} ${
                          suppressRightBarline ? 'sheet-has-terminal-right' : ''
                        } ${isActiveBar ? 'z-20' : projectsRhythmTieToNextBar ? 'z-10' : ''}`}
                        style={isActiveBar ? { gridColumn: `${bIdx + 1} / span ${restSpan}`, paddingBottom: `${barPaddingBottom}px`, backgroundColor: activeTone.barFill, boxShadow: `inset 0 0 0 2px ${activeTone.barStroke}, inset 0 0 0 1px rgba(255, 255, 255, 0.86), 0 12px 24px ${activeTone.barGlow}` } : { gridColumn: `${bIdx + 1} / span ${restSpan}`, paddingBottom: `${barPaddingBottom}px` }}
                      >
                        {showAddBarButton && (
                          <button
                            type="button"
                            data-preview-only-control="true"
                            data-preview-add-bar-after={section?.id}
                            className="group/addbar absolute inset-0 z-[1100] flex items-center justify-center"
                            aria-label={language === 'zh' ? '新增小節' : 'Add bar'}
                            onMouseDown={(event) => event.stopPropagation()}
                            onTouchStart={(event) => event.stopPropagation()}
                            onClick={() => onAddBarClick(row.sIdx)}
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-300 transition-colors group-hover/addbar:border-emerald-400 group-hover/addbar:bg-emerald-50 group-hover/addbar:text-emerald-600">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </span>
                          </button>
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
                          <div className="pointer-events-none absolute left-1 -top-[10px] z-10 inline-flex items-center rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black tracking-[0.04em] leading-none text-amber-800 shadow-[0_1px_0_rgba(251,191,36,0.14)]">
                            {copy.key}: {barCurrentKey}
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
                          <div
                            data-sheet-ending-bracket={bar.ending}
                            className={`sheet-ending-bracket absolute ${endingTopClass} h-[12px] border-t-[2px] border-gray-950 z-10 pointer-events-none ${isEndingStart ? `${getEndingLeftOffsetClass(endingLeftBarlineType)} border-l-[2px]` : ENDING_LEFT_OFFSETS.normal} ${isEndingEnd ? `${getEndingRightOffsetClass(endingRightBarlineType)} border-r-[2px]` : ENDING_RIGHT_OFFSETS.normalMeasure}`}
                          >
                             {(!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending) && (
                               <span
                                 data-sheet-ending-number={bar.ending}
                                 data-sheet-ending-multiple={hasMultipleEndingNumbers ? true : undefined}
                                 className={`sheet-ending-number absolute left-[2px] -top-[1px] inline-flex items-center justify-start font-semibold leading-none text-gray-950 ${
                                   hasMultipleEndingNumbers
                                     ? 'text-[11px] tracking-[-0.02em]'
                                     : 'text-[13px] tracking-[0.01em]'
                                 }`}
                               >
                                 {endingDisplayText}
                               </span>
                             )}
                          </div>
                        )}

                        {bar?.leftMarker && (
                          <NavigationMarkerIcon
                            marker={bar.leftMarker}
                            side="left"
                            onClick={onElementClick ? (event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {bar?.rightMarker && (
                          <NavigationMarkerIcon
                            marker={bar.rightMarker}
                            side="right"
                            onClick={onElementClick ? (event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {leftNavigationText && (
                          <NavigationTextTag
                            text={leftNavigationText}
                            side="left"
                            className={bar?.leftMarker ? 'left-5' : ''}
                            onClick={onElementClick ? (event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {rightNavigationText && (
                          <NavigationTextTag
                            text={rightNavigationText}
                            side="right"
                            placement={isRightTextOnlyMarker ? 'inside-bottom' : 'top'}
                            variant={isRightTextOnlyMarker ? 'highlight' : 'plain'}
                            className={isRightTextOnlyMarker ? 'text-[10px]' : bar?.rightMarker ? 'right-5' : ''}
                            onClick={onElementClick ? (event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'marker') : undefined}
                          />
                        )}

                        {isUnusedBar && !row.addSectionAfter && (
                          <div className="absolute inset-0 z-[1] flex items-center pointer-events-none">
                            <div className="h-[2px] w-full bg-gray-400" />
                          </div>
                        )}

                        {bar && (
                          <>
                            {(() => {
                              const showBottomLane = showBottomRhythmLane || hasRiff || labelSharesNotationLane;

                              return (
                                <>
                            {/* Annotation */}
                            {bar.annotation && (
                              <div
                                className={`absolute -top-[10px] z-10 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-black tracking-[0.05em] leading-none whitespace-nowrap cursor-pointer transition-colors ${
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
                            {bar.timeSignature && !showSectionGutterTimeSignature && (
                              <div
                                data-preview-inline-time-signature
                                data-preview-suppress-pan={canDragLabelLane && showInlineTimeSignatureBarLabel ? true : undefined}
                                className={`absolute ${inlineTimeSignaturePositionClass} z-10 flex w-5 flex-col items-center justify-center text-[19px] font-semibold italic leading-[0.78] text-[#1e3a8a] select-none ${
                                  canDragLabelLane && showInlineTimeSignatureBarLabel ? 'pointer-events-auto active:cursor-grabbing sm:cursor-grab' : 'pointer-events-none'
                                } ${bar.repeatStart ? 'left-2.5' : 'left-1.5'}`}
                                style={canDragLabelLane && showInlineTimeSignatureBarLabel ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                                title={canDragLabelLane && showInlineTimeSignatureBarLabel ? getLabelLaneDragTitle(language) : undefined}
                                onMouseDown={canDragLabelLane && showInlineTimeSignatureBarLabel ? (event) => event.stopPropagation() : undefined}
                                onPointerDown={canDragLabelLane && showInlineTimeSignatureBarLabel ? (event) => handleLabelLanePointerDown(event, row.sIdx, row.startBIdx + bIdx, labelLane) : undefined}
                                onPointerMove={canDragLabelLane && showInlineTimeSignatureBarLabel ? handleLabelLanePointerMove : undefined}
                                onPointerUp={canDragLabelLane && showInlineTimeSignatureBarLabel ? finishLabelLaneDrag : undefined}
                                onPointerCancel={canDragLabelLane && showInlineTimeSignatureBarLabel ? cancelLabelLaneDrag : undefined}
                                aria-hidden="true"
                              >
                                <span>{displayNumerator}</span>
                                {displayDenominator && <span>{displayDenominator}</span>}
                              </div>
                            )}
                            {showInlineTimeSignatureBarLabel && (
                              renderBarLabelBadge(
                                `absolute ${inlineTimeSignatureLabelBottomClass} z-10 flex h-[14px] w-[30px] items-center justify-center rounded-sm border border-black bg-gray-300/70 px-1 mix-blend-multiply leading-none transition-colors ${
                                  bar.repeatStart ? 'left-1.5' : 'left-0.5'
                                } ${onElementClick ? 'cursor-pointer hover:bg-indigo-200/70' : ''}`,
                                { shrink: true, inlineTimeSignature: true }
                              )
                            )}
                            {/* Chords */}
                                  {(() => {
                                    const renderRhythmInChordLane = showRhythmInChordLane;

                                    if (renderRhythmInChordLane) {
                                      return (
                                        <div
                                          data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|rhythm|all`}
                                          className={`relative z-[30] flex flex-1 items-center justify-center w-full h-full cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${notationLaneHitClass} ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'rhythm')}
                                        >
                                          {activeRhythmCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded bg-indigo-100/45 ring-2 ring-inset ring-indigo-500/70" />}
                                          <div className="w-full max-w-full overflow-visible">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact scale={1.34} beamStrokeScale={1.14} tieFontScale={0.88} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" selectionMode="insert" selectedInsertIndex={activeRhythmCursor?.cursorUnit ?? null} onInsertSelect={onElementClick ? emitRhythmSelection : undefined} />
                                          </div>
                                        </div>
                                      );
                                    }

                                      const chordSlotOwnership = getChordDisplaySlotOwnership(bar.chords, beatsPerBar);
                                      const occupiedChordAnchors = (() => {
                                        const anchors = chordSlotOwnership.flatMap((entry, slotIndex) => {
                                          if (!entry?.chord || entry.covered) return [];
                                          return [{ chord: entry.chord, chordIndex: entry.rawIndex, slotIndex, span: entry.span }];
                                        });
                                        return anchors.map((anchor, index) => {
                                          const nextSlotIndex = anchors[index + 1]?.slotIndex ?? beatsPerBar;
                                          const slotsUntilNext = Math.max(1, nextSlotIndex - anchor.slotIndex);
                                          return { ...anchor, slotsUntilNext };
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
                                        {Array.from({ length: beatsPerBar }, (_, slotIndex) => {
                                          const ownership = chordSlotOwnership[slotIndex];
                                          if (ownership?.covered) return null;
                                          const isSelectedSlot = Boolean(
                                            resolvedActiveChordSlot
                                            && resolvedActiveChordSlot.sectionId === section?.id
                                            && resolvedActiveChordSlot.barId === bar.id
                                            && resolvedActiveChordSlot.slotIndex === slotIndex
                                          );
                                          const slotHasChord = Boolean(displayChordEntries[slotIndex]?.chord);
                                          const slotSpan = ownership?.span ?? 1;
                                          return (
                                            <div
                                              key={`slot-hit-${slotIndex}`}
                                              data-preview-slot-hit
                                              data-preview-slot-index={slotIndex}
                                              data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|chords|${slotIndex}`}
                                              aria-hidden="true"
                                              className={`pointer-events-none relative h-[26px] rounded-[4px] transition-shadow ${isSelectedSlot ? 'bg-indigo-100/65 shadow-[inset_0_0_0_2px_rgba(79,70,229,0.92),0_0_0_1px_rgba(255,255,255,0.88)]' : ''}`}
                                              style={{ gridColumn: `${slotIndex + 1} / span ${slotSpan}`, gridRow: '1' }}
                                            >
                                              {isSelectedSlot && !slotHasChord && <PreviewChordInputCaret className="absolute bottom-[4px] left-[5px]" />}
                                            </div>
                                          );
                                        })}
                                        {(() => {
                                          const fullRenderedAnchors = occupiedChordAnchors.map((anchor) => {
                                            const renderedChord = getDisplayedChordString(anchor.chord, barOffset, barPlayKey, song.showNashvilleNumbers, false, barWrittenKey);
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
                                                const renderedChord = getDisplayedChordString(anchor.chord, barOffset, barPlayKey, song.showNashvilleNumbers, true, barWrittenKey);
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
                                            const isSelectedChord = Boolean(
                                              resolvedActiveChordSlot
                                              && resolvedActiveChordSlot.sectionId === section?.id
                                              && resolvedActiveChordSlot.barId === bar.id
                                              && resolvedActiveChordSlot.slotIndex === anchor.slotIndex
                                            );
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
	                                                data-preview-token-span={anchor.span}
	                                                data-preview-owner-slot={anchor.slotIndex}
	                                                className="flex h-[24px] min-w-0 items-end px-[3px]"
	                                                style={{ gridColumn: `${anchor.slotIndex + 1} / span ${anchor.span}`, gridRow: '1' }}
	                                                  onClick={(event) => {
	                                                  event.stopPropagation();
	                                                  emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords', anchor.slotIndex, anchor.chordIndex);
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
	                                                  <div className="inline-flex min-w-0 origin-center items-end leading-none">
	                                                    <FormattedChord
	                                                      chordString={renderedChord}
	                                                      compactModifier={compactModifier}
                                                      abbreviateMajorQuality={shouldAbbreviateCrowdedQuality}
                                                      nashvilleFontFamily={nashvilleFontFamily}
                                                      chordFontFamily={chordFontFamily}
                                                      color={getChordMarkTextColor(bar, anchor.chordIndex)}
                                                      specialLabel={getChordSpecialLabel(bar, anchor.chordIndex, language)}
                                                      avoidEndingCollision={Boolean(bar.ending && anchor.slotIndex === 0)}
                                                    />
                                                    {isSelectedChord && <PreviewChordInputCaret className="mb-px ml-px" />}
                                                  </div>
                                                </AutoShrink>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    );
                                    const hasCenteredPercentRepeat = occupiedChordAnchors.length === 1 && occupiedChordAnchors[0].chord.trim() === '%';
                                    const isCenteredSpecialSelected = Boolean(
                                      resolvedActiveChordSlot
                                      && resolvedActiveChordSlot.sectionId === section?.id
                                      && resolvedActiveChordSlot.barId === bar.id
                                      && resolvedActiveChordSlot.slotIndex === 0
                                    );

                                    if (hasCenteredPercentRepeat) {
                                      return (
                                        <div
                                          data-preview-token-span={beatsPerBar}
                                          data-preview-owner-slot="0"
                                          className={`relative flex-1 flex items-center justify-center w-full h-full cursor-pointer rounded ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          {isCenteredSpecialSelected && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded bg-indigo-100/65 shadow-[inset_0_0_0_2px_rgba(79,70,229,0.92)]" />}
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
                                          data-preview-token-span={beatsPerBar}
                                          data-preview-owner-slot="0"
                                          className={`relative flex flex-1 h-full w-full items-center justify-center cursor-pointer rounded transition-colors hover:bg-indigo-50/50 ${contentLeftInsetClass}`}
                                          onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          {isCenteredSpecialSelected && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded bg-indigo-100/65 shadow-[inset_0_0_0_2px_rgba(79,70,229,0.92)]" />}
                                          <FormattedChord
                                            chordString={getDisplayedChordString(centeredWholeRestAnchor.chord, barOffset, barPlayKey, song.showNashvilleNumbers, false, barWrittenKey)}
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
                            {hasBarLabelInContentLane && !labelSharesNotationLane && (
                              renderBarLabelBadge(`absolute bottom-[6px] left-1 z-10 border border-black px-1 rounded-sm flex h-[14px] items-center bg-gray-300/70 mix-blend-multiply cursor-pointer transition-colors hover:bg-indigo-200/70 ${contentLeftInsetClass}`)
                            )}
                            {showBottomLane && (
                              <div
                                data-preview-bottom-lane
                                className={`absolute left-1 right-1 ${contentLeftInsetClass}`}
                                style={{ bottom: '4px' }}
                              >
	                                {showBottomRhythmLane && hasRiff ? (
	                                  <div className={`flex gap-1 ${hasThreeNotationRows ? 'items-stretch' : ''}`}>
                                    {hasBarLabelInContentLane && (
                                      <div
                                        data-preview-bar-label-column
                                        className={`flex flex-shrink-0 flex-col ${hasThreeNotationRows ? 'gap-1.5' : 'gap-0.5'}`}
                                      >
                                        <div className={`${sharedLaneClass} flex items-end`}>
                                          {labelLane === 'rhythm' ? (
                                            renderBarLabelBadge('border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors')
                                          ) : (
                                            <span className="mb-0.5 h-[14px]" aria-hidden="true" />
                                          )}
                                        </div>
                                        <div className={`${sharedLaneClass} flex items-end`}>
                                          {labelLane === 'riff' ? (
                                            renderBarLabelBadge('border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors')
                                          ) : (
                                            <span className="mb-0.5 h-[14px]" aria-hidden="true" />
                                          )}
                                        </div>
                                      </div>
                                    )}

	                                    <div className={`flex flex-1 min-w-0 flex-col ${hasThreeNotationRows ? 'gap-1.5' : 'gap-0.5'}`}>
	                                      <div className="flex items-end">
	                                        <div
	                                          data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|rhythm|all`}
	                                          className={`relative z-[30] bg-gray-300/70 mix-blend-multiply rounded-sm px-1 py-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} ${notationLaneHitClass} flex-1`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'rhythm');
                                          }}
                                        >
                                          {activeRhythmCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded-sm bg-indigo-100/45 ring-1 ring-inset ring-indigo-500/70" />}
                                          {activeRhythmCursor && renderActiveNotationCursor()}
                                          <div className="w-full">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact accentScale={0.86} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" selectionMode="insert" selectedInsertIndex={activeRhythmCursor?.cursorUnit ?? null} onInsertSelect={onElementClick ? emitRhythmSelection : undefined} />
                                          </div>
                                        </div>
                                      </div>

	                                      <div className="flex items-end">
	                                        <div
	                                          data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|jianpu|all`}
	                                          className={`relative z-[30] bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} ${notationLaneHitClass}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'riff');
                                          }}
                                        >
                                          {activeJianpuCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded-sm bg-indigo-100/45 ring-1 ring-inset ring-indigo-500/70" />}
                                          {activeJianpuCursor && renderActiveNotationCursor()}
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
                                            timeSignature={effectiveTimeSignature}
                                            gridSlotCount={notationBeatUnits}
                                            className="w-full min-w-0"
                                            previousNotationForCrossBar={previewPreviousRiffNotation}
                                            nextNotationForCrossBar={previewNextRiffNotation}
                                            activeTokenIndex={activeJianpuCursor?.beatIndex ?? null}
                                            activeInsertPosition={activeJianpuCursor && activeJianpuCursor.noteIndex == null ? {
                                              tokenIndex: activeJianpuCursor.beatIndex,
                                              slotIndex: activeJianpuCursor.unitIndex,
                                              slotCount: notationBeatUnits
                                            } : null}
                                            activeNote={activeJianpuCursor?.noteIndex != null ? {
                                              tokenIndex: activeJianpuCursor.beatIndex,
                                              noteIndex: activeJianpuCursor.noteIndex
                                            } : null}
                                            onTokenClick={onElementClick ? emitJianpuInsertSelection : undefined}
                                          onNoteClick={onElementClick ? emitJianpuNoteSelection : undefined}
                                          />
                                        </div>
                                      </div>
                                  </div>
                                </div>
                                ) : labelUsesStandaloneRhythmLane ? (
                                  <div className="flex flex-col gap-1.5 overflow-visible">
                                    <div className="flex h-[14px] items-end gap-1 overflow-visible">
                                      {renderBarLabelBadge('border border-black px-1 rounded-sm flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors')}
                                    </div>

                                    <div className="flex items-end gap-1 h-[18px] overflow-visible">
                                      <div
                                        data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|jianpu|all`}
                                        className={`relative z-[30] bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} ${notationLaneHitClass}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          emitElementClick(e, row.sIdx, row.startBIdx + bIdx, 'riff');
                                        }}
                                      >
                                        {activeJianpuCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded-sm bg-indigo-100/45 ring-1 ring-inset ring-indigo-500/70" />}
                                        {activeJianpuCursor && renderActiveNotationCursor()}
                                        <Jianpu
                                          notation={previewRiffNotation}
                                          compact
                                          scale={previewJianpuScale}
                                          timeSignature={effectiveTimeSignature}
                                          gridSlotCount={notationBeatUnits}
                                          className="w-full min-w-0"
                                          previousNotationForCrossBar={previewPreviousRiffNotation}
                                          nextNotationForCrossBar={previewNextRiffNotation}
                                          activeTokenIndex={activeJianpuCursor?.beatIndex ?? null}
                                          activeInsertPosition={activeJianpuCursor && activeJianpuCursor.noteIndex == null ? {
                                            tokenIndex: activeJianpuCursor.beatIndex,
                                            slotIndex: activeJianpuCursor.unitIndex,
                                            slotCount: notationBeatUnits
                                          } : null}
                                          activeNote={activeJianpuCursor?.noteIndex != null ? {
                                            tokenIndex: activeJianpuCursor.beatIndex,
                                            noteIndex: activeJianpuCursor.noteIndex
                                          } : null}
                                          onTokenClick={onElementClick ? emitJianpuInsertSelection : undefined}
                                          onNoteClick={onElementClick ? emitJianpuNoteSelection : undefined}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-end gap-1 h-[18px] overflow-visible">
                                    {hasBarLabelInContentLane && (
                                      renderBarLabelBadge('border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors')
                                    )}

                                    {(showBottomRhythmLane || hasRiff) && (
                                      <div
                                        data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|${showBottomRhythmLane ? 'rhythm' : 'jianpu'}|all`}
                                        className={`relative z-[30] bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} ${notationLaneHitClass}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          emitElementClick(e, row.sIdx, row.startBIdx + bIdx, showBottomRhythmLane ? 'rhythm' : 'riff');
                                        }}
                                        >
                                          {showBottomRhythmLane && activeRhythmCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded-sm bg-indigo-100/45 ring-1 ring-inset ring-indigo-500/70" />}
                                          {!showBottomRhythmLane && activeJianpuCursor && <span data-preview-edit-ui className="pointer-events-none absolute inset-0 rounded-sm bg-indigo-100/45 ring-1 ring-inset ring-indigo-500/70" />}
                                          {(showBottomRhythmLane ? activeRhythmCursor : activeJianpuCursor) && renderActiveNotationCursor()}
                                          {showBottomRhythmLane ? (
                                            <div className="w-full">
	                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact accentScale={0.86} tieFromPrevious={showIncomingRhythmTie} nextNotationForCrossBar={nextRhythmBar?.rhythm} nextTimeSignatureForCrossBar={nextRhythmTimeSignature} color={rhythmMarkColor} className="w-full" selectionMode="insert" selectedInsertIndex={activeRhythmCursor?.cursorUnit ?? null} onInsertSelect={onElementClick ? emitRhythmSelection : undefined} />
                                          </div>
                                        ) : (
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
                                            timeSignature={effectiveTimeSignature}
                                            gridSlotCount={notationBeatUnits}
                                            className="w-full min-w-0"
                                            previousNotationForCrossBar={previewPreviousRiffNotation}
                                            nextNotationForCrossBar={previewNextRiffNotation}
                                            activeTokenIndex={activeJianpuCursor?.beatIndex ?? null}
                                            activeInsertPosition={activeJianpuCursor && activeJianpuCursor.noteIndex == null ? {
                                              tokenIndex: activeJianpuCursor.beatIndex,
                                              slotIndex: activeJianpuCursor.unitIndex,
                                              slotCount: notationBeatUnits
                                            } : null}
                                            activeNote={activeJianpuCursor?.noteIndex != null ? {
                                              tokenIndex: activeJianpuCursor.beatIndex,
                                              noteIndex: activeJianpuCursor.noteIndex
                                            } : null}
                                            onTokenClick={onElementClick ? emitJianpuInsertSelection : undefined}
                                            onNoteClick={onElementClick ? emitJianpuNoteSelection : undefined}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <span
                              data-preview-edit-anchor={`${previewIdentity || 'preview'}|${section?.id || row.sIdx}|${bar.id || row.startBIdx + bIdx}|lower|all`}
                              className="pointer-events-none absolute bottom-1 left-1 right-1 h-[18px]"
                              aria-hidden="true"
                            />
                            {showEmptyLowerHit && (
                              <button
                                type="button"
                                data-preview-edit-ui
                                data-preview-lower-hit
                                className="absolute bottom-1 left-1 right-1 z-[2] h-[18px] rounded-sm border border-dashed border-indigo-200/0 bg-transparent transition-colors hover:border-indigo-300 hover:bg-indigo-50/55 focus-visible:border-indigo-400 focus-visible:bg-indigo-50/70 focus-visible:outline-none"
                                onClick={(event) => emitElementClick(event, row.sIdx, row.startBIdx + bIdx, 'lower')}
                                aria-label={language === 'zh' ? '在下方輸入節奏或簡譜' : 'Enter rhythm or jianpu below'}
                              >
                                {renderActiveNotationCursor()}
                              </button>
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

            {/* Keep the remaining page as writable ruled chart space. */}
            {pIdx === pages.length - 1 && Array.from({ length: Math.max(0, (pIdx === 0 ? ROWS_PER_PAGE_FIRST : ROWS_PER_PAGE_OTHER) - pageRows.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-1 flex w-full min-h-0">
                <div className="w-16 sm:w-20 shrink-0" />
                <div className="flex-1 grid min-h-0 grid-cols-4 w-full">
                  {Array.from({ length: 4 }).map((_, bIdx) => (
                    <div key={bIdx} className={`sheet-bar relative min-h-0 border-l border-gray-900 px-1 pt-1.5 pb-6 flex flex-col min-w-0 ${bIdx === 3 ? 'border-r border-r-gray-900 sheet-bar-right-edge' : ''} ${bIdx === 0 ? 'border-l-2 sheet-bar-left-edge' : ''} ${bIdx === 3 ? 'border-r-2' : ''}`} />
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
