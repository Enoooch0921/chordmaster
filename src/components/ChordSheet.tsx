/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Song, Section, Bar, Key, AppLanguage, NavigationMarker } from '../types';
import { getTransposeOffset, transposeChord, getSectionColor, getNashvilleNumber, isNashville, parseNashvilleToChord, getPlayKey, transposeKeyPreferFlats } from '../utils/musicUtils';
import { getChordFontFamily } from '../constants/chordFonts';
import { getNashvilleFontFamily } from '../constants/nashvilleFonts';
import { getUiCopy, localizeSectionTitle } from '../constants/i18n';
import { Repeat, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Jianpu from './Jianpu';
import RhythmNotation from './RhythmNotation';
import { convertRelativeJianpuToAbsoluteNotation, findJianpuNoteRanges, findJianpuPlaceholderRanges, getCanonicalJianpuBeatTokens, serializeJianpuBeatTokens } from '../utils/jianpuUtils';
import { hasMeaningfulChordContent, hasVisibleChordTokens } from '../utils/barUtils';
import { getChordDisplaySlots, getLyricAnchors, getLyricFitScale, getLyricFontScale, getLyricTrackingEm, getTwoChordSplitSlotIndex } from '../utils/lyricsUtils';
import { getEffectiveTimeSignature, getRestGlyph, getShuffleSymbolGlyphs, parseRhythmNotation, parseTimeSignature } from '../utils/rhythmUtils';

interface FormattedChordProps {
  chordString: string;
  compactModifier?: boolean;
  nashvilleFontFamily?: string;
  chordFontFamily?: string;
  compactSlashBass?: boolean;
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

const getBarDisplayLabel = (bar?: Bar) => (
  bar?.label?.trim() || bar?.riffLabel?.trim() || bar?.rhythmLabel?.trim() || ''
);

const isWholeRestChord = (chordString?: string) => {
  const trimmed = chordString?.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  return trimmed === '0w' || trimmed.toUpperCase() === 'RW' || normalized === 'restw' || normalized === 'whole_rest';
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

const FormattedChord: React.FC<FormattedChordProps> = ({ chordString, compactModifier = false, nashvilleFontFamily, chordFontFamily, compactSlashBass = false }) => {
  if (chordString === '%') {
    return (
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
    return (
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

    return (
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
      <div className="relative inline-block">
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
                <span className={`relative inline-flex items-end leading-none -ml-[0.06em] ${bassAccidental ? 'pr-[0.12em]' : ''}`}>
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
      </div>
    );
  }

  // Parse chord: optional accidental + Root(A-G or 1-7) + optional accidental + Quality(...) / optional accidental + Bass(A-G or 1-7) + optional accidental
  const match = cleanChord.match(/^([b#]?)([A-G1-7])([#b]?)([^/]*)(?:\/([b#]?)([A-G1-7])([#b]?))?$/);

  if (!match) {
    return (
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
  const isSingleExtensionToken = extensionTokens.length === 1;
  const isNumericRoot = /^[1-7]$/.test(root);
  const numericFigureStyle = isNumericRoot
    ? ({ fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1, "tnum" 1' } as const)
    : undefined;
  const numericQualityReserveEm = isNumericRoot && qualityText
    ? Math.max(0.34, qualityText.length * 0.42)
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
  const numericQualityTextClass = qualityText === 'm'
    ? 'text-[11px] leading-none'
    : /^dim/i.test(qualityText)
      ? 'text-[10px] leading-none'
      : 'text-[10px] leading-none';
  const numericQualityStyle = numericFigureStyle;
  if (isNumericRoot) {
    const numericTextStyle = {
      ...(numericSuffixReserveEm > 0 ? { paddingRight: `${numericSuffixReserveEm}em` } : {}),
      ...(nashvilleFontFamily ? { fontFamily: nashvilleFontFamily } : {})
    };

    return (
      <div className={`relative inline-block ${numericChordOffsetClass}`}>
        <span
          className="relative inline-flex h-[1.02em] items-end text-gray-900 font-bold font-serif whitespace-nowrap"
          style={numericTextStyle}
        >
          <span className="relative inline-block leading-none">
            {renderNumericDegree({
              degree: root,
              accidentalGlyph: accidental,
              degreeClassName: `${numericRootSizeClass} origin-bottom`,
              degreeStyle: numericRootStyle
            })}
            {qualityText && (
              <span className="absolute left-full bottom-0 ml-[0.03em] inline-flex items-end whitespace-nowrap">
                <span className={`relative inline-flex items-end -translate-y-[0.6em] ${numericQualityTextClass}`} style={numericQualityStyle}>
                  <span>{qualityText}</span>
                  {hasExtensionTokens && (
                    <span
                      className={`absolute inline-flex ${isSingleExtensionToken ? 'items-center' : 'items-start'} gap-[0.06em] text-[7px] leading-none tracking-[-0.02em] whitespace-nowrap ${
                        isSingleExtensionToken
                          ? 'left-full top-[-0.08em] ml-[-1.24em]'
                          : 'left-[0.18em] top-[-0.86em]'
                      }`}
                    >
                      <span className={isSingleExtensionToken ? 'inline-flex h-[1em] items-center leading-none' : ''}>(</span>
                      {extensionTokens.map((token, index) => {
                        const accidentalGlyph = token[0];
                        const degreeText = token.slice(1);
                        return (
                          <span key={`${token}-${index}`} className={`inline-flex ${isSingleExtensionToken ? 'items-center' : 'items-start'}`}>
                            <span className={`relative ${accidentalGlyph === '#' ? '-top-[0.14em]' : '-top-[0.02em]'}`}>
                              {accidentalGlyph}
                            </span>
                            <span style={numericFigureStyle}>{degreeText}</span>
                            {index < extensionTokens.length - 1 && <span className="ml-[0.14em]" />}
                          </span>
                        );
                      })}
                      <span className={isSingleExtensionToken ? 'inline-flex h-[1em] items-center leading-none' : ''}>)</span>
                    </span>
                  )}
                </span>
              </span>
            )}
            {bass && (
              <span
                className="absolute left-full bottom-0 inline-flex items-end gap-[0.03em] whitespace-nowrap"
                style={qualityText ? { marginLeft: `${numericQualityReserveEm + 0.04}em` } : { marginLeft: '0.02em' }}
              >
                <span className="text-lg font-bold text-gray-900 leading-none">/</span>
                {renderNumericDegree({
                  degree: bassRoot,
                  accidentalGlyph: bassAccidental,
                  compact: compactSlashBass,
                  degreeClassName: compactSlashBass ? 'text-[13px] leading-none' : 'text-lg leading-none',
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

  return (
    <div className="relative inline-block">
      <span className="inline-flex items-baseline text-gray-900 font-bold font-serif whitespace-nowrap" style={chordFontFamily ? { fontFamily: chordFontFamily } : undefined}>
        <span className="text-lg leading-none">{root}</span>
        {accidental && <span className="text-xs -translate-y-1.5 ml-[0.5px]">{accidental}</span>}
        {qualityText && (
          <span className="relative inline-block ml-[0.5px]">
            <span className="text-[10px] -translate-y-[0.55em]">{qualityText}</span>
            {hasExtensionTokens && (
              <span
                className={`absolute inline-flex ${isSingleExtensionToken ? 'items-center' : 'items-start'} gap-[0.08em] text-[8px] leading-none tracking-[-0.02em] whitespace-nowrap ${
                  isSingleExtensionToken
                    ? 'left-full top-[-0.08em] ml-[-1.32em]'
                    : 'left-[0.18em] top-[-0.86em]'
                }`}
              >
                <span className={isSingleExtensionToken ? 'inline-flex h-[1em] items-center leading-none' : ''}>(</span>
                {extensionTokens.map((token, index) => {
                  const accidentalGlyph = token[0];
                  const degreeText = token.slice(1);
                  return (
                    <span key={`${token}-${index}`} className={`inline-flex ${isSingleExtensionToken ? 'items-center' : 'items-start'}`}>
                      <span className={`relative ${accidentalGlyph === '#' ? '-top-[0.14em] -mr-[0.08em]' : '-top-[0.02em] -mr-[0.04em]'}`}>
                        {accidentalGlyph}
                      </span>
                      <span>{degreeText}</span>
                      {index < extensionTokens.length - 1 && <span className="ml-[0.14em]" />}
                    </span>
                  );
                })}
                <span className={isSingleExtensionToken ? 'inline-flex h-[1em] items-center leading-none' : ''}>)</span>
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
            <span className={`relative inline-flex items-end leading-none -ml-[0.06em] ${bassAccidental ? 'pr-[0.12em]' : ''}`}>
              <span className={compactSlashBass ? 'text-[14px] leading-none' : 'text-lg leading-none'}>{bassRoot}</span>
              {bassAccidental && (
                <span className={`absolute left-full top-0 ${compactSlashBass ? 'text-[9px] -translate-x-[0.18em] -translate-y-[0.26em]' : 'text-xs -translate-x-[0.22em] -translate-y-[0.38em]'}`}>
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

interface ChordSheetProps {
  song: Song;
  language: AppLanguage;
  currentKey: Key;
  transposeFromOriginal?: boolean;
  onElementClick?: (sIdx: number, bIdx: number, field: 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'lyrics') => void;
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
}> = ({ marker, side, offsetPx = 0 }) => {
  if (TEXT_ONLY_NAVIGATION_MARKERS.has(marker)) {
    return null;
  }

  return (
    <div
      className={`absolute top-0 z-[1100] select-none leading-none text-gray-900 pointer-events-none ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{
        transform: `translate(${side === 'left' ? `calc(-50% + ${offsetPx}px)` : `calc(50% + ${offsetPx}px)`}, -54%)`
      }}
      aria-hidden="true"
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
}> = ({ text, side, placement = 'top', className = '', variant = 'plain' }) => (
  <div
    className={`absolute z-20 max-w-[calc(100%-8px)] whitespace-nowrap ${side === 'left' ? 'left-1' : 'right-1'} ${
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

const getCrowdedChordScaleClass = (displayChords: string[]) => {
  const normalizedChords = displayChords.map((chord) => chord.trim());
  const meaningfulChords = normalizedChords.filter((chord) => chord && chord !== '/');
  if (meaningfulChords.length <= 1) return '';

  const maxChordLength = meaningfulChords.reduce((maximum, chord) => Math.max(maximum, chord.length), 0);
  let longestAdjacentRun = 0;
  let currentRun = 0;

  normalizedChords.forEach((chord) => {
    if (chord && chord !== '/') {
      currentRun += 1;
      longestAdjacentRun = Math.max(longestAdjacentRun, currentRun);
    } else {
      currentRun = 0;
    }
  });

  if (meaningfulChords.length >= 4 || longestAdjacentRun >= 4 || (meaningfulChords.length >= 3 && maxChordLength >= 6)) {
    return 'scale-x-[0.72]';
  }

  if (meaningfulChords.length >= 3 || longestAdjacentRun >= 3 || maxChordLength >= 7) {
    return 'scale-x-[0.8]';
  }

  if ((meaningfulChords.length >= 2 && longestAdjacentRun >= 2) || maxChordLength >= 5) {
    return 'scale-x-[0.9]';
  }

  return '';
};

const getLyricDisplayText = (text: string) => text.replace(/\s+/g, ' ').trim();
const getLyricMeasureText = (text: string) => getLyricDisplayText(text).replace(/[ \t]+/g, '');

const getSingleChordScaleClass = (chord: string) => {
  const trimmed = chord.trim();
  if (!trimmed || trimmed === '/') return '';
  if (trimmed.length >= 9) return 'scale-x-[0.76]';
  if (trimmed.includes('/')) return trimmed.length >= 6 ? 'scale-x-[0.86]' : 'scale-x-[0.92]';
  if (trimmed.length >= 7) return 'scale-x-[0.86]';
  if (trimmed.length >= 6) return 'scale-x-[0.92]';
  return '';
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
  overflowVisible?: boolean;
  shrinkAxis?: 'uniform' | 'x-only';
}> = ({
  children,
  className = "",
  align = 'left',
  minScale = 0.6,
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

        if (contentWidth > containerWidth && containerWidth > 30) {
          const newScale = Math.max(minScale, (containerWidth - 2) / contentWidth);
          setScale(newScale);
        } else {
          setScale(1);
        }
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
  }, [children, minScale]);

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

const ChordSheet: React.FC<ChordSheetProps> = ({ song, language, currentKey, transposeFromOriginal = true, onElementClick, highlightedSectionIds = [], activeSectionId = null, activeBar = null, previewIdentity = null }) => {
  const copy = getUiCopy(language);
  const nashvilleFontFamily = getNashvilleFontFamily(song.nashvilleFontPreset);
  const chordFontFamily = getChordFontFamily(song.chordFontPreset);
  const previousPreviewIdentityRef = React.useRef(previewIdentity);
  const [keepTransitionsSuppressed, setKeepTransitionsSuppressed] = React.useState(false);
  const isPreviewIdentityChanged = previousPreviewIdentityRef.current !== previewIdentity;
  const suppressSectionTransitions = isPreviewIdentityChanged || keepTransitionsSuppressed;

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
  const playKey = getPlayKey(currentKey, capo);
  const baseWrittenKey = transposeFromOriginal ? song.originalKey : currentKey;
  const globalKeyShift = transposeFromOriginal ? getTransposeOffset(song.originalKey, currentKey) : 0;
  const sectionStartKeys: Key[] = [];
  let activeSectionKey = baseWrittenKey;
  song.sections.forEach((section) => {
    if (section.keyChangeTo) {
      activeSectionKey = section.keyChangeTo;
    }
    sectionStartKeys.push(activeSectionKey);
  });

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
  const sectionBarOffsets: number[] = [];
  let accumulatedBarCount = 0;
  song.sections.forEach((section) => {
    sectionBarOffsets.push(accumulatedBarCount);
    accumulatedBarCount += section.bars.length;
  });
  const barNumberMode = song.barNumberMode ?? 'none';
  const globalLyricsScale = (() => {
    if (!song.showLyrics) return 1;

    let minimumScale = 1;

    song.sections.forEach((section) => {
      section.bars.forEach((bar) => {
        const effectiveTimeSignature = getEffectiveTimeSignature(bar.timeSignature, song.timeSignature);
        const beatsPerBar = parseInt(effectiveTimeSignature.split('/')[0]) || 4;
        const lyricAnchors = getLyricAnchors(bar.chords, bar.lyrics, beatsPerBar);

        lyricAnchors.forEach((anchor) => {
          if (!anchor.lyric) return;
          const measureText = getLyricMeasureText(anchor.lyric);
          minimumScale = Math.min(minimumScale, getLyricFitScale(measureText || anchor.lyric, anchor.span));
        });
      });
    });

    return Math.max(0.14, minimumScale);
  })();
  const lyricsChordScaleClass = globalLyricsScale < 0.42
    ? 'scale-[0.62]'
    : globalLyricsScale < 0.58
      ? 'scale-[0.68]'
      : globalLyricsScale < 0.76
        ? 'scale-[0.74]'
        : 'scale-[0.8]';
  const previewJianpuScale = song.showLyrics
    ? globalLyricsScale < 0.42
      ? 0.68
      : globalLyricsScale < 0.58
        ? 0.72
        : globalLyricsScale < 0.76
          ? 0.76
          : 0.8
    : 0.86;
  const riffLanePaddingXClass = song.showLyrics ? 'px-1.5' : 'px-1';
  const previewBottomLaneClass = song.showLyrics
    ? 'h-[16px] flex items-center overflow-visible'
    : 'h-[18px] flex items-center overflow-visible';

  // Lyrics mode needs a little more vertical room on continuation pages because bars can include chord, lyric, and riff/rhythm lanes.
  const ROWS_PER_PAGE_FIRST = 12;
  const ROWS_PER_PAGE_OTHER = song.showLyrics ? 13 : 14;

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
                <AutoShrink className="mb-0">
                  <h1 className="text-3xl font-bold tracking-tight">{song.title}</h1>
                </AutoShrink>
                {hasCredits && (
                  <div className="absolute left-0 right-0 top-[38px] text-xs font-semibold text-gray-900 tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {creditLine}
                  </div>
                )}
                <AutoShrink className="min-w-0 overflow-visible mt-4.5">
                  <div className="flex items-center gap-3 text-xs font-medium text-gray-500 tracking-widest" style={{ fontFamily: chordFontFamily }}>
                    <div className="shrink-0">
                      <span>{copy.key} - </span>
                      <span className="text-gray-900 font-bold">
                        <FormattedChord chordString={currentKey} nashvilleFontFamily={nashvilleFontFamily} chordFontFamily={chordFontFamily} />
                      </span>
                    </div>
                    {typeof song.tempo === 'number' && (
                      <>
                        <span className="text-gray-400">|</span>
                        <div className="shrink-0">
                          <span>{copy.editor.tempo} - </span>
                          <span className="text-gray-900 font-bold">{song.tempo}</span>
                        </div>
                      </>
                    )}
                    <span className="text-gray-400">|</span>
                    <div className="shrink-0 flex items-center gap-2">
                      <span>{copy.editor.timeSignature} - </span>
                      <span className="text-gray-900 font-bold">{song.timeSignature}</span>
                      {song.showAbsoluteJianpu && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-900 font-bold">{copy.fixedDoMode}</span>
                        </>
                      )}
                      {isShuffle && (
                        <>
                          <span className="text-gray-400">|</span>
                          <ShuffleSymbol className="self-center -translate-y-[3px]" />
                        </>
                      )}
                    </div>
                    {capo > 0 && (
                      <>
                        <span className="text-gray-400">|</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-indigo-600 font-semibold">Capo {capo}</span>
                          <span className="text-gray-400 font-medium">(<FormattedChord chordString={playKey} nashvilleFontFamily={nashvilleFontFamily} chordFontFamily={chordFontFamily} />)</span>
                        </div>
                      </>
                    )}
                  </div>
                </AutoShrink>
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{song.title} ({copy.continued})</span>
              <span className="text-xs font-bold text-gray-400">{language === 'zh' ? `${copy.page} ${pIdx + 1} 頁` : `${copy.page} ${pIdx + 1}`}</span>
            </div>
          )}

          {/* Content Area */}
          <div className={`flex-1 flex flex-col min-h-0 w-full ${song.showLyrics ? 'gap-y-1 sm:gap-y-1.5' : 'gap-y-2 sm:gap-y-3'}`}>
            {pageRows.map((row, rIdx) => {
              const section = song.sections[row.sIdx];
              const sectionWrittenKey = sectionStartKeys[row.sIdx] || song.originalKey;
              const previousWrittenKey = row.sIdx > 0 ? (sectionStartKeys[row.sIdx - 1] || song.originalKey) : song.originalKey;
              const sectionCurrentKey = transposeKeyPreferFlats(sectionWrittenKey, globalKeyShift);
              const previousSectionKey = row.sIdx > 0 ? transposeKeyPreferFlats(previousWrittenKey, globalKeyShift) : currentKey;
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
                              className="flex w-full items-center justify-center rounded-sm border px-1 py-1 min-h-[24px] overflow-visible"
                              style={getSectionBadgeStyle(colors.accent)}
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
                            onClick={() => onElementClick?.(0, -1, 'rhythm')}
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
                            onClick={() => onElementClick?.(0, -1, 'riff')}
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
                              <Jianpu notation={pickupPreviewNotation} compact scale={previewJianpuScale} className="relative z-10 w-full min-w-0" />
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                </div>

                {/* Right Column: Bars */}
                <div className="flex-1 grid grid-cols-4 w-full">
                  {Array.from({ length: 4 }).map((_, bIdx) => {
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
                    const displayChords = bar ? getChordDisplaySlots(bar.chords, beatsPerBar) : [];
                    const lyricAnchors = bar ? getLyricAnchors(bar.chords, bar.lyrics, beatsPerBar) : [];
                    const hasRhythm = Boolean(bar?.rhythm);
                    const hasRiff = Boolean(bar?.riff);
                    const hasChordContent = Boolean(bar && hasMeaningfulChordContent(bar.chords));
                    const showRhythmInChordLane = !hasChordContent && hasRhythm;
                    const showLyricsLane = Boolean(song.showLyrics && bar && hasVisibleChordTokens(bar.chords) && !showRhythmInChordLane);
                    const showBottomRhythmLane = hasRhythm && !showRhythmInChordLane;
                    const showBottomLane = showBottomRhythmLane || Boolean(bar?.riff) || hasBarLabel;
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
                    const showBarNumber = Boolean(
                      bar && barNumberMode !== 'none' && (barNumberMode === 'all' || bIdx === 0)
                    );
                    const barNumberTopClass = bar?.ending
                      ? 'top-[8px]'
                      : bar?.repeatStart
                        ? '-top-[8px]'
                        : '-top-[2px]';
                    const isActiveBar = activeBar?.sIdx === row.sIdx && activeBar?.bIdx === row.startBIdx + bIdx;
                    const suppressLeftBarline = Boolean(bar?.repeatStart) || Boolean(previousBar?.repeatEnd || previousBar?.finalBar);
                    const suppressRightBarline = bIdx === 3 && Boolean(bar?.repeatEnd || bar?.finalBar);
                    const leftBorderClass = suppressLeftBarline
                      ? 'border-l-0'
                      : bIdx === 0
                        ? 'border-l-2 border-gray-900 sheet-bar-left-edge'
                        : 'border-l border-gray-900';
                    const rightBorderClass = bIdx === 3
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
                        className={`sheet-bar relative px-1 pt-1.5 flex flex-col min-w-0 ${leftBorderClass} ${rightBorderClass} ${bar?.repeatStart ? 'sheet-has-repeat-start' : ''} ${
                          previousBar?.repeatEnd ? 'sheet-after-repeat-end' : ''
                        } ${previousBar?.finalBar ? 'sheet-after-final-bar' : ''} ${
                          suppressRightBarline ? 'sheet-has-terminal-right' : ''
                        } ${isActiveBar ? 'z-20' : ''}`}
                        style={isActiveBar ? { paddingBottom: `${barPaddingBottom}px`, backgroundColor: activeTone.barFill, boxShadow: `inset 0 0 0 2px ${activeTone.barStroke}, inset 0 0 0 1px rgba(255, 255, 255, 0.86), 0 12px 24px ${activeTone.barGlow}` } : { paddingBottom: `${barPaddingBottom}px` }}
                      >
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
                          />
                        )}

                        {bar?.rightMarker && (
                          <NavigationMarkerIcon
                            marker={bar.rightMarker}
                            side="right"
                          />
                        )}

                        {leftNavigationText && (
                          <NavigationTextTag
                            text={leftNavigationText}
                            side="left"
                            className={bar?.leftMarker ? 'left-5' : ''}
                          />
                        )}

                        {rightNavigationText && (
                          <NavigationTextTag
                            text={rightNavigationText}
                            side="right"
                            placement={isRightTextOnlyMarker ? 'outside-bottom-tight' : 'top'}
                            variant={isRightTextOnlyMarker ? 'highlight' : 'plain'}
                            className={isRightTextOnlyMarker ? 'right-0 text-[10px]' : bar?.rightMarker ? 'right-5' : ''}
                          />
                        )}

                        {isUnusedBar && (
                          <div className="absolute inset-0 z-[1] flex items-center pointer-events-none">
                            <div className="h-[2px] w-full bg-gray-400" />
                          </div>
                        )}

                        {bar && (
                          <>
                            {(() => {
                              const showBottomLane = showBottomRhythmLane || Boolean(bar.riff) || hasBarLabel;

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
                                  onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'annotation');
                                }}
                              >
                                {formatBarAnnotation(bar.annotation)}
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
                                    // Special case for full bar repeat symbol when lyrics are hidden.
                                    if (!showLyricsLane && hasVisibleChordTokens(bar.chords) && bar.chords.length === 1 && bar.chords[0] === '%') {
                                      return (
                                        <div
                                          className={`flex-1 flex items-center justify-center w-full h-full cursor-pointer ${contentLeftInsetClass}`}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <FormattedChord chordString="%" nashvilleFontFamily={nashvilleFontFamily} chordFontFamily={chordFontFamily} />
                                        </div>
                                      );
                                    }

                                    const renderRhythmInChordLane = showRhythmInChordLane;

                                    if (renderRhythmInChordLane) {
                                      return (
                                        <div
                                          className={`flex flex-1 items-center justify-center w-full h-full cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${contentLeftInsetClass}`}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <div className="w-full max-w-full overflow-visible translate-y-[3px]">
                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact scale={1.34} beamOffsetUnits={0.05} beamVerticalOffset={-0.28} beamStrokeScale={1.14} tieVerticalOffset={-2.1} tieFontScale={0.88} accentVerticalOffset={2.5} accentHorizontalOffset={0.9} className="w-full" />
                                          </div>
                                        </div>
                                      );
                                    }

                                    const lyricsAnchorCount = Math.max(1, lyricAnchors.length);
                                    const evenAnchorUnitSpan = beatsPerBar / lyricsAnchorCount;
                                    const crowdedChordScaleClass = !showLyricsLane ? getCrowdedChordScaleClass(displayChords) : '';
                                    const meaningfulChordFlags = displayChords.map((token) => {
                                      const trimmed = token.trim();
                                      return Boolean(trimmed && trimmed !== '/');
                                    });
                                    const occupiedChordAnchors = displayChords.flatMap((displayChord, slotIndex) => {
                                      if (!displayChord) return [];

                                      const nextOccupiedSlot = displayChords.findIndex((candidate, candidateIndex) => (
                                        candidateIndex > slotIndex && Boolean(candidate)
                                      ));
                                      const span = nextOccupiedSlot === -1
                                        ? beatsPerBar - slotIndex
                                        : nextOccupiedSlot - slotIndex;

                                      return [{
                                        chord: displayChord,
                                        slotIndex,
                                        span: Math.max(1, span)
                                      }];
                                    });
                                    const halfSplitSlotIndex = getTwoChordSplitSlotIndex(beatsPerBar);
                                    const isDefaultTwoChordSpread = occupiedChordAnchors.length === 2
                                      && occupiedChordAnchors[0]?.slotIndex === 0
                                      && occupiedChordAnchors[1]?.slotIndex === halfSplitSlotIndex;
                                    const centeredWholeRestAnchor = occupiedChordAnchors.length === 1 && isWholeRestChord(occupiedChordAnchors[0]?.chord)
                                      ? occupiedChordAnchors[0]
                                      : null;

                                    if (!showLyricsLane) {
                                      if (centeredWholeRestAnchor) {
                                        return (
                                          <div
                                            className={`flex flex-1 h-full w-full items-center justify-center cursor-pointer rounded transition-colors hover:bg-indigo-50/50 ${contentLeftInsetClass}`}
                                            onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                          >
                                            <FormattedChord
                                              chordString={(() => {
                                                const transposed = transposeChord(centeredWholeRestAnchor.chord, sectionOffset, sectionPlayKey);
                                                if (song.showNashvilleNumbers) {
                                                  return isNashville(transposed) ? transposed : getNashvilleNumber(transposed, sectionPlayKey);
                                                }

                                                return isNashville(transposed) ? parseNashvilleToChord(transposed, sectionPlayKey) : transposed;
                                              })()}
                                              compactModifier={compactModifier}
                                              nashvilleFontFamily={nashvilleFontFamily}
                                              chordFontFamily={chordFontFamily}
                                            />
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          className={`flex-1 grid w-full content-start items-start pt-[3px] cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${contentLeftInsetClass}`}
                                          style={{ gridTemplateColumns: `repeat(${beatsPerBar}, 1fr)` }}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          {occupiedChordAnchors.map((anchor) => {
                                            const singleChordScaleClass = getSingleChordScaleClass(anchor.chord);
                                            const effectiveChordScaleClass = singleChordScaleClass || crowdedChordScaleClass;
                                            const isFirstAnchor = anchor.slotIndex === 0;
                                            const isTwoChordSecondHalfAnchor = isDefaultTwoChordSpread && anchor.slotIndex === halfSplitSlotIndex;
                                            const isTerminalAnchor = anchor.slotIndex + anchor.span >= beatsPerBar
                                              && anchor.slotIndex > 0
                                              && !isDefaultTwoChordSpread;
                                            const align: 'left' | 'center' | 'right' = isFirstAnchor
                                              ? 'left'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'left'
                                              : isTerminalAnchor
                                                ? 'right'
                                                : 'center';
                                            const anchorPaddingClass = isFirstAnchor
                                              ? 'pl-[2px]'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'pl-[2px] pr-[6px]'
                                              : isTerminalAnchor
                                                ? 'pl-[14px] pr-[6px]'
                                                : 'px-[3px]';
                                            const shrinkMinScale = isTerminalAnchor ? 0.2 : 0.44;
                                            const compactSlashBass = anchor.chord.includes('/')
                                              && anchor.chord.trim() !== '/'
                                              && (
                                                meaningfulChordFlags[anchor.slotIndex - 1] === true
                                                || meaningfulChordFlags[anchor.slotIndex + 1] === true
                                              );

                                            return (
                                              <div
                                                key={`${row.sIdx}-${row.startBIdx + bIdx}-anchor-${anchor.slotIndex}`}
                                                className={`min-w-0 ${anchorPaddingClass}`}
                                                style={{ gridColumn: `${anchor.slotIndex + 1} / span ${anchor.span}` }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords');
                                                }}
                                              >
                                                <AutoShrink
                                                  align={align}
                                                  minScale={shrinkMinScale}
                                                  overflowVisible
                                                  shrinkAxis={isTerminalAnchor ? 'x-only' : 'uniform'}
                                                >
                                                  <div
                                                    className={`min-w-0 ${
                                                      effectiveChordScaleClass
                                                        ? `${align === 'right' ? 'origin-right' : align === 'center' ? 'origin-center' : 'origin-left'} ${effectiveChordScaleClass}`
                                                        : ''
                                                    }`.trim()}
                                                  >
                                                    <FormattedChord
                                                      chordString={(() => {
                                                        const transposed = transposeChord(anchor.chord, sectionOffset, sectionPlayKey);
                                                        if (song.showNashvilleNumbers) {
                                                          return isNashville(transposed) ? transposed : getNashvilleNumber(transposed, sectionPlayKey);
                                                        }

                                                        return isNashville(transposed) ? parseNashvilleToChord(transposed, sectionPlayKey) : transposed;
                                                      })()}
                                                      compactModifier={compactModifier}
                                                      nashvilleFontFamily={nashvilleFontFamily}
                                                      chordFontFamily={chordFontFamily}
                                                      compactSlashBass={compactSlashBass}
                                                    />
                                                  </div>
                                                </AutoShrink>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className={`flex flex-1 min-h-0 flex-col justify-start gap-[2px] w-full cursor-pointer rounded px-0.5 pt-0 hover:bg-amber-50/60 transition-colors ${contentLeftInsetClass}`}>
                                        <div
                                          className="grid w-full content-start items-start"
                                          style={{ gridTemplateColumns: `repeat(${beatsPerBar}, minmax(0, 1fr))` }}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          {lyricAnchors.map((anchor) => {
                                            const isFirstAnchor = anchor.slotIndex === 0;
                                            const isTwoChordSecondHalfAnchor = isDefaultTwoChordSpread && anchor.slotIndex === halfSplitSlotIndex;
                                            const isTerminalAnchor = anchor.slotIndex + anchor.span >= beatsPerBar
                                              && anchor.slotIndex > 0
                                              && !isDefaultTwoChordSpread;
                                            const originClass = isFirstAnchor
                                              ? 'origin-top-left'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'origin-top-left'
                                              : isTerminalAnchor
                                                ? 'origin-top-right'
                                                : 'origin-top';
                                            const anchorPaddingClass = isFirstAnchor
                                              ? 'pl-[2px]'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'pl-[2px] pr-[6px]'
                                              : isTerminalAnchor
                                                ? 'pl-[14px] pr-[6px]'
                                                : 'px-[3px]';
                                            const shrinkMinScale = isTerminalAnchor ? 0.2 : 0.44;
                                            const align: 'left' | 'center' | 'right' = isFirstAnchor
                                              ? 'left'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'left'
                                              : isTerminalAnchor
                                                  ? 'right'
                                                  : 'center';

                                            return (
                                            <div
                                              key={`${row.sIdx}-${row.startBIdx + bIdx}-chord-${anchor.rawIndex}`}
                                              className={`min-w-0 ${anchorPaddingClass}`}
                                              style={{ gridColumn: `${anchor.slotIndex + 1} / span ${Math.max(1, anchor.span)}` }}
                                            >
                                              <AutoShrink
                                                align={align}
                                                minScale={shrinkMinScale}
                                                overflowVisible
                                                shrinkAxis={isTerminalAnchor ? 'x-only' : 'uniform'}
                                              >
                                                <div className={`${originClass} ${lyricsChordScaleClass}`.trim()}>
                                                  <FormattedChord
                                                    chordString={(() => {
                                                      const transposed = transposeChord(anchor.chord, sectionOffset, sectionPlayKey);
                                                      if (song.showNashvilleNumbers) {
                                                        return isNashville(transposed) ? transposed : getNashvilleNumber(transposed, sectionPlayKey);
                                                      }

                                                      return isNashville(transposed) ? parseNashvilleToChord(transposed, sectionPlayKey) : transposed;
                                                    })()}
                                                    compactModifier={compactModifier}
                                                    nashvilleFontFamily={nashvilleFontFamily}
                                                    chordFontFamily={chordFontFamily}
                                                  />
                                                </div>
                                              </AutoShrink>
                                            </div>
                                          )})}
                                        </div>

                                        <div
                                          className="grid h-[14px] min-h-0 w-full shrink-0 content-start items-start overflow-hidden"
                                          style={{ gridTemplateColumns: `repeat(${beatsPerBar}, minmax(0, 1fr))` }}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'lyrics')}
                                        >
                                          {lyricAnchors.map((anchor) => {
                                            const isFirstAnchor = anchor.slotIndex === 0;
                                            const isTwoChordSecondHalfAnchor = isDefaultTwoChordSpread && anchor.slotIndex === halfSplitSlotIndex;
                                            const isTerminalAnchor = anchor.slotIndex + anchor.span >= beatsPerBar
                                              && anchor.slotIndex > 0
                                              && !isDefaultTwoChordSpread;
                                            const lyricText = getLyricDisplayText(anchor.lyric);
                                            const measureText = getLyricMeasureText(lyricText);
                                            const lyricScale = getLyricFontScale(measureText || lyricText, anchor.span);
                                            const lyricTracking = getLyricTrackingEm(measureText || lyricText, anchor.span);
                                            const anchorPaddingClass = isFirstAnchor
                                              ? 'pl-[2px]'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'pl-[2px] pr-[6px]'
                                              : isTerminalAnchor
                                                ? 'pl-[14px] pr-[6px]'
                                                : 'px-[3px]';
                                            const justifyClass = isFirstAnchor
                                              ? 'justify-start'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'justify-start'
                                              : isTerminalAnchor
                                                  ? 'justify-end'
                                                  : 'justify-center';
                                            const textAlignClass = isFirstAnchor
                                              ? 'text-left'
                                              : isTwoChordSecondHalfAnchor
                                                ? 'text-left'
                                              : isTerminalAnchor
                                                  ? 'text-right'
                                                  : 'text-center';

                                            return (
                                              <div
                                                key={`${row.sIdx}-${row.startBIdx + bIdx}-lyric-${anchor.rawIndex}`}
                                                className={`min-w-0 overflow-hidden ${anchorPaddingClass}`}
                                                style={{ gridColumn: `${anchor.slotIndex + 1} / span ${Math.max(1, anchor.span)}` }}
                                              >
                                                <div
                                                  className={`flex min-w-0 py-0 ${justifyClass}`}
                                                  style={{
                                                    fontSize: `${Math.max(4.75, 11.75 * Math.min(globalLyricsScale, lyricScale))}px`
                                                  }}
                                                >
                                                  <span
                                                    className={`block max-w-full whitespace-nowrap font-display font-semibold leading-none tracking-[0.002em] text-gray-900 ${textAlignClass}`}
                                                    style={{ letterSpacing: lyricTracking > 0 ? `${lyricTracking}em` : undefined }}
                                                  >
                                                    {lyricText || ' '}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })()}
                            {showBottomLane && (
                              <div
                                className={`absolute left-1 right-1 ${contentLeftInsetClass}`}
                                style={{ bottom: '4px' }}
                              >
                                {showBottomRhythmLane && bar.riff ? (
                                  <div className="flex gap-1">
                                    {hasBarLabel && (
                                      <div className="flex items-end">
                                        <div 
                                          className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'label');
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
                                            onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'rhythm');
                                          }}
                                        >
                                          <div className="w-full translate-y-[3px]">
                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact tieVerticalOffset={-0.8} accentHorizontalOffset={0.9} accentScale={0.86} className="w-full" />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-end">
                                        <div 
                                          className={`bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'riff');
                                          }}
                                        >
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
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
                                          onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'label');
                                        }}
                                      >
                                        <span className="text-[8px] font-bold text-black uppercase leading-none">
                                          {barLabel}
                                        </span>
                                      </div>
                                    )}

                                    {(showBottomRhythmLane || bar.riff) && (
                                      <div
                                        className={`bg-gray-300/70 mix-blend-multiply rounded-sm ${riffLanePaddingXClass} py-0 flex-1 min-w-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onElementClick?.(row.sIdx, row.startBIdx + bIdx, showBottomRhythmLane ? 'rhythm' : 'riff');
                                        }}
                                      >
                                        {showBottomRhythmLane ? (
                                          <div className="w-full translate-y-[3px]">
                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact tieVerticalOffset={-0.8} accentHorizontalOffset={0.9} accentScale={0.86} className="w-full" />
                                          </div>
                                        ) : (
                                          <Jianpu
                                            notation={previewRiffNotation}
                                            compact
                                            scale={previewJianpuScale}
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
                  })}
                </div>
              </motion.div>
            );
          })}
            
            {/* Fill empty space on last page if needed - No placeholder lines here */}
            {pIdx === pages.length - 1 && Array.from({ length: Math.max(0, (pIdx === 0 ? ROWS_PER_PAGE_FIRST : ROWS_PER_PAGE_OTHER) - pageRows.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex-1 flex w-full min-h-0">
                <div className="w-16 sm:w-20 shrink-0" />
                <div className="flex-1 grid grid-cols-4 w-full">
                  {Array.from({ length: 4 }).map((_, bIdx) => (
                    <div key={bIdx} className={`sheet-bar relative border-l border-gray-900 px-1 pt-1.5 pb-6 flex flex-col min-w-0 ${bIdx === 3 ? 'border-r border-r-gray-900 sheet-bar-right-edge' : ''} ${bIdx === 0 ? 'border-l-2 sheet-bar-left-edge' : ''} ${bIdx === 3 ? 'border-r-2' : ''}`}>
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
