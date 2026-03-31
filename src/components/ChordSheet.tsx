/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Song, Section, Bar, Key } from '../types';
import { getTransposeOffset, transposeChord, getSectionColor, getNashvilleNumber, isNashville, parseNashvilleToChord, getPlayKey } from '../utils/musicUtils';
import { Repeat, Anchor, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Jianpu from './Jianpu';
import RhythmNotation from './RhythmNotation';
import { getEffectiveTimeSignature, getRestGlyph, getShuffleSymbolGlyphs, parseRhythmNotation } from '../utils/rhythmUtils';

interface FormattedChordProps {
  chordString: string;
  compactModifier?: boolean;
}

const FormattedChord: React.FC<FormattedChordProps> = ({ chordString, compactModifier = false }) => {
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
    // Beat slash: shorter and even thinner
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="w-2.5 h-[2px] bg-gray-400 rounded-full rotate-[-45deg] transform origin-center" />
      </div>
    );
  }

  // Detect push/pull/accent markers
  let marker: 'push' | 'pull' | null = null;
  let accent = false;
  let cleanChord = chordString;

  // Extract modifiers from the end
  while (cleanChord.endsWith('<') || cleanChord.endsWith('>') || cleanChord.endsWith('^')) {
    if (cleanChord.endsWith('<')) {
      marker = 'push';
      cleanChord = cleanChord.slice(0, -1);
    } else if (cleanChord.endsWith('>')) {
      marker = 'pull';
      cleanChord = cleanChord.slice(0, -1);
    } else if (cleanChord.endsWith('^')) {
      accent = true;
      cleanChord = cleanChord.slice(0, -1);
    }
  }

  const markerWrapperClass = compactModifier
    ? 'absolute -top-[15px] left-1/2 -translate-x-1/2 w-7 h-5 z-20 pointer-events-none'
    : 'absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-6 pointer-events-none';
  const accentWrapperClass = compactModifier
    ? `absolute ${marker ? '-top-[20px]' : '-top-[15px]'} left-1/2 -translate-x-1/2 w-4 h-4 z-20 pointer-events-none`
    : `absolute ${marker ? '-top-9' : '-top-5'} left-1/2 -translate-x-1/2 w-4 h-4 pointer-events-none`;

  const renderModifiers = () => (
    <>
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
  const isWholeRest = cleanChord === '0w' || cleanChord.toUpperCase() === 'RW' || normalizedRest === 'restw' || normalizedRest === 'whole_rest';
  const isHalfRest = cleanChord === '0h' || cleanChord.toUpperCase() === 'RH' || normalizedRest === 'resth' || normalizedRest === 'half_rest';
  const isQuarterRest = cleanChord === '0' || cleanChord.toUpperCase() === 'R' || normalizedRest === 'rest' || normalizedRest === 'quarter_rest';
  const isEighthRest = cleanChord === '0_' || cleanChord.toUpperCase() === 'R_' || normalizedRest === 'rest_' || normalizedRest === 'eighth_rest' || normalizedRest === '8th_rest';

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

  // Parse chord: Root(A-G or 1-7)(#|b)? Quality(...) / Bass(A-G or 1-7)(#|b)?
  const match = cleanChord.match(/^([A-G1-7])([#b]?)([^/]*)(?:\/([A-G1-7][#b]?))?$/);

  if (!match) {
    return (
      <div className="relative inline-block">
        <span className="text-lg font-bold font-serif tracking-tight text-gray-900">{cleanChord}</span>
        {renderModifiers()}
      </div>
    );
  }

  const [, root, accidental, quality, bass] = match;
  const bassMatch = bass?.match(/^([A-G1-7])([#b]?)$/);
  const bassRoot = bassMatch?.[1] || bass || '';
  const bassAccidental = bassMatch?.[2] || '';

  return (
    <div className={`relative inline-block ${accidental ? 'translate-x-[4.5px]' : ''}`}>
      <span className="inline-flex items-baseline text-gray-900 font-bold font-serif whitespace-nowrap">
        <span className="text-lg leading-none">{root}</span>
        {accidental && <span className="text-xs -translate-y-1.5 ml-[0.5px]">{accidental}</span>}
        {quality && <span className="text-[10px] -translate-y-1 ml-[0.5px]">{quality}</span>}
        {bass && (
          <span className="inline-flex items-baseline -ml-[2px]">
            <span className="text-[16px] font-bold text-gray-900 leading-none scale-y-110 origin-bottom">/</span>
            <span className={`relative inline-block text-[14px] ${bassAccidental ? 'pr-[0.12em]' : '-ml-[0.5px]'}`}>
              {bassAccidental && (
                <span className="absolute left-full top-0 text-[9px] -translate-x-[0.28em] -translate-y-[0.38em]">
                  {bassAccidental}
                </span>
              )}
              <span>{bassRoot}</span>
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
  currentKey: Key;
  onElementClick?: (sIdx: number, bIdx: number, field: 'chords' | 'riff' | 'riffLabel' | 'rhythmLabel' | 'annotation' | 'rhythm') => void;
  highlightedSectionIds?: string[];
  activeSectionId?: string | null;
  activeBar?: { sIdx: number; bIdx: number } | null;
}

const hasMeaningfulChordContent = (chords: string[]) =>
  chords.some((chord) => {
    const normalized = chord.trim();
    return normalized !== '' && normalized !== '/';
  });

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
      className={`sheet-repeat-marker absolute top-0 bottom-0 z-[999] w-[13px] pointer-events-none ${isStart ? 'sheet-repeat-start left-0' : ''} ${isEnd ? 'sheet-repeat-end right-0' : ''} ${type === 'final-bar' ? 'sheet-final-bar right-0' : ''}`}
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

const AutoShrink: React.FC<{ children: React.ReactNode; className?: string; align?: 'left' | 'right' }> = ({ children, className = "", align = 'left' }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);

  React.useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current && contentRef.current) {
        const containerWidth = containerRef.current.getBoundingClientRect().width;
        
        // Measure natural width by preventing wrapping temporarily
        const originalWS = contentRef.current.style.whiteSpace;
        contentRef.current.style.whiteSpace = 'nowrap';
        const contentWidth = contentRef.current.scrollWidth;
        contentRef.current.style.whiteSpace = originalWS;

        if (contentWidth > containerWidth && containerWidth > 30) {
          // Don't shrink below 0.6 to avoid "tiny text" bug
          const newScale = Math.max(0.6, (containerWidth - 2) / contentWidth);
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
  }, [children]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full overflow-hidden flex ${align === 'left' ? 'justify-start' : 'justify-end'} ${className}`}
    >
      <div 
        ref={contentRef} 
        style={{ 
          transform: `scale(${scale})`, 
          transformOrigin: align === 'left' ? 'left center' : 'right center',
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

const ChordSheet: React.FC<ChordSheetProps> = ({ song, currentKey, onElementClick, highlightedSectionIds = [], activeSectionId = null, activeBar = null }) => {
  const capo = song.capo || 0;
  const playKey = getPlayKey(currentKey, capo);
  const offset = getTransposeOffset(song.originalKey, playKey);

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
    const sectionRows = Math.ceil(section.bars.length / 4);
    for (let i = 0; i < sectionRows; i++) {
      allRows.push({
        sectionTitle: i === 0 ? section.title : null,
        bars: section.bars.slice(i * 4, i * 4 + 4),
        sIdx,
        startBIdx: i * 4
      });
    }
  });

  // Pagination logic - Reduced slightly to give more breathing room for riffs/labels
  const ROWS_PER_PAGE_FIRST = 12;
  const ROWS_PER_PAGE_OTHER = 14;

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
      {pages.map((pageRows, pIdx) => (
        <div 
          key={pIdx} 
          data-print-page
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
                  <div className="flex items-center gap-3 text-xs font-medium text-gray-500 tracking-widest">
                    <div className="shrink-0">
                      <span>Key - </span>
                      <span className="text-gray-900 font-bold">
                        <FormattedChord chordString={currentKey} />
                      </span>
                    </div>
                    <span className="text-gray-400">|</span>
                    <div className="shrink-0">
                      <span>Tempo - </span>
                      <span className="text-gray-900 font-bold">{song.tempo}</span>
                    </div>
                    <span className="text-gray-400">|</span>
                    <div className="shrink-0 flex items-center gap-2">
                      <span>Time - </span>
                      <span className="text-gray-900 font-bold">{song.timeSignature}</span>
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
                        <div className="flex items-center gap-2 shrink-0">
                          <Anchor size={14} className="text-indigo-600" />
                          <span className="text-indigo-600">Capo:</span>
                          <span className="text-indigo-700 font-bold">{capo}</span>
                          <span className="text-gray-400 font-medium">(Play: <FormattedChord chordString={playKey} />)</span>
                        </div>
                      </>
                    )}
                  </div>
                </AutoShrink>
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{song.title} (Cont.)</span>
              <span className="text-xs font-bold text-gray-400">Page {pIdx + 1}</span>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 flex flex-col gap-y-2 sm:gap-y-3 min-h-0 w-full">
            {pageRows.map((row, rIdx) => {
              const section = song.sections[row.sIdx];
              const colors = getSectionColor(section?.title || '', song.useSectionColors !== false);
              const activeTone = getSectionActiveTone(colors.accent);
              const isHighlighted = highlightedSectionIds.includes(section?.id || '');
              const isActiveSection = Boolean(section?.id) && section.id === activeSectionId;
              
              return (
                <motion.div 
                  key={`${section?.id || row.sIdx}-${row.startBIdx}`}
                  data-preview-section-id={section?.id || ''}
                  layout
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
                    layout: { type: 'spring', stiffness: 300, damping: 30 },
                    backgroundColor: { duration: isHighlighted ? 0.2 : 0.25 },
                    boxShadow: { duration: 0.2 }
                  }}
                  className="flex-1 flex w-full min-h-0 rounded-lg transition-all"
                >
                  {/* Left Column: Section Title */}
                <div className="w-16 sm:w-20 shrink-0 flex items-start pr-2 pt-1">
                    {row.sectionTitle && (() => {
                      const colors = getSectionColor(row.sectionTitle, song.useSectionColors !== false);
                      return (
                        <div className={`w-full ${colors.bg} border ${colors.border} rounded py-1 px-1 flex items-center justify-center min-h-[24px] transition-all ${
                          isActiveSection ? 'scale-[1.02]' : ''
                        }`}>
                          <div className={`text-[11px] font-bold ${colors.text} tracking-wide whitespace-nowrap`}>
                            {row.sectionTitle.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </div>
                        </div>
                      );
                    })()}
                </div>

                {/* Right Column: Bars */}
                <div className="flex-1 grid grid-cols-4 w-full">
                  {Array.from({ length: 4 }).map((_, bIdx) => {
                    const bar = row.bars[bIdx];
                    const previousBar = row.bars[bIdx - 1];
                    const effectiveTimeSignature = bar ? getEffectiveTimeSignature(bar.timeSignature, song.timeSignature) : song.timeSignature;
                    const beatsPerBar = parseInt(effectiveTimeSignature.split('/')[0]) || 4;
                    const hasRhythm = Boolean(bar?.rhythm);
                    const hasRiff = Boolean(bar?.riff);
                    const compactModifier = Boolean(bar?.ending || bar?.annotation);
                    const isEndingStart = Boolean(bar?.ending) && (!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending);
                    const isEndingEnd = Boolean(bar?.ending) && (!row.bars[bIdx + 1] || row.bars[bIdx + 1].ending !== bar.ending);
                    const lowerLaneCount = bar ? [hasRhythm, hasRiff].filter(Boolean).length : 0;
                    const barPaddingBottom = lowerLaneCount >= 2 ? 34 : lowerLaneCount === 1 ? 20 : 24;
                    const sharedLaneClass = 'h-[18px] flex items-center overflow-visible';
                    const { numerator: displayNumerator, denominator: displayDenominator } = splitDisplayTimeSignature(effectiveTimeSignature);
                    const hasInlineTimeSignature = Boolean(bar?.timeSignature);
                    const inlineTimeSignatureOffsetClass = hasInlineTimeSignature ? 'pl-3' : '';
                    const isEmpty = !bar || (bar.chords.length === 0 && !bar.riff && !bar.rhythm && !bar.annotation);
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
                          <div className={`sheet-ending-bracket absolute -top-[1px] h-4 border-t-2 border-gray-900 z-10 pointer-events-none ${isEndingStart ? getEndingLeftOffsetClass(endingLeftBarlineType) : 'left-0'} ${isEndingEnd ? getEndingRightOffsetClass(endingRightBarlineType) : 'right-0'} ${isEndingStart ? 'border-l-2' : ''}`}>
                             {(!row.bars[bIdx - 1] || row.bars[bIdx - 1].ending !== bar.ending) && (
                               <span className="sheet-ending-number absolute -top-4 left-0 text-[10px] font-bold font-serif">{bar.ending}.</span>
                             )}
                          </div>
                        )}

                        {/* Default placeholder line for empty bars - only for actual sections */}
                        {isEmpty && (
                          <div className="absolute inset-0 flex items-center pointer-events-none">
                            <div className="w-full h-[2px] bg-gray-400" />
                          </div>
                        )}

                        {bar && (
                          <>
                            {(() => {
                              const hasChordContent = hasMeaningfulChordContent(bar.chords);
                              const showRhythmInChordLane = !hasChordContent && Boolean(bar.rhythm?.trim());
                              const showBottomRhythmLane = Boolean(bar.rhythm?.trim()) && !showRhythmInChordLane;
                              const showBottomLane = showBottomRhythmLane || Boolean(bar.riff);

                              return (
                                <>
                            {/* Annotation */}
                            {bar.annotation && (
                              <div 
                                className={`absolute -top-4 text-[9px] font-bold tracking-wider text-indigo-600 bg-gray-100/90 backdrop-blur-sm border border-gray-200 rounded-sm px-1.5 py-0.5 z-10 whitespace-nowrap cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors ${isEndingStart ? 'left-7' : 'left-1'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'annotation');
                                }}
                              >
                                {bar.annotation.split(' ').map(word => {
                                  const upper = word.toUpperCase();
                                  const abbreviations = ['AG', 'PNO', 'EG1', 'EG2', 'A.GTR', 'E.GTR', 'EG', 'GTR', 'DR', 'BS', 'KEY'];
                                  if (abbreviations.includes(upper)) return upper;
                                  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                                }).join(' ')}
                              </div>
                            )}
                            {bar.timeSignature && (
                              <div
                                className={`absolute top-1/2 -translate-y-1/2 z-10 flex w-5 flex-col items-center justify-center text-[19px] font-semibold italic leading-[0.78] text-[#1e3a8a] pointer-events-none select-none ${bar.repeatStart ? 'left-3.5' : 'left-1.5'}`}
                                aria-hidden="true"
                              >
                                <span>{displayNumerator}</span>
                                {displayDenominator && <span>{displayDenominator}</span>}
                              </div>
                            )}
                            {/* Chords */}
                                  {(() => {
                                    // Special case for full bar repeat symbol
                                    if (bar.chords.length === 1 && bar.chords[0] === '%') {
                                      return (
                                        <div
                                          className={`flex-1 flex items-center justify-center w-full h-full cursor-pointer ${inlineTimeSignatureOffsetClass}`}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <FormattedChord chordString="%" />
                                        </div>
                                      );
                                    }

                                    // Smart distribution for common cases if not explicitly spaced
                                    const renderRhythmInChordLane = showRhythmInChordLane;

                                    if (renderRhythmInChordLane) {
                                      return (
                                        <div
                                          className={`flex flex-1 items-center justify-center w-full h-full cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${inlineTimeSignatureOffsetClass}`}
                                          onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                        >
                                          <div className="w-full max-w-full overflow-visible translate-y-[3px]">
                                            <RhythmNotation notation={bar.rhythm} timeSignature={effectiveTimeSignature} compact scale={1.34} beamOffsetUnits={0.05} beamVerticalOffset={-0.28} beamStrokeScale={1.14} tieVerticalOffset={-2.1} tieFontScale={0.88} accentVerticalOffset={2.5} accentHorizontalOffset={0.9} className="w-full" />
                                          </div>
                                        </div>
                                      );
                                    }

                                    let displayChords = [...bar.chords];
                                    if (displayChords.length === 2 && beatsPerBar === 4 && !displayChords.includes('')) {
                                      displayChords = [displayChords[0], '', displayChords[1], ''];
                                    }
                                    
                                    return (
                                      <div 
                                        className={`flex-1 grid w-full items-center cursor-pointer hover:bg-indigo-50/50 transition-colors rounded ${inlineTimeSignatureOffsetClass}`}
                                        style={{ gridTemplateColumns: `repeat(${beatsPerBar}, 1fr)` }}
                                        onClick={() => onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords')}
                                      >
                                        {Array.from({ length: beatsPerBar }).map((_, i) => {
                                          const chord = displayChords[i] || '';
                                          return (
                                            <div 
                                              key={i} 
                                              className={`flex items-center justify-center w-full overflow-visible ${chord ? 'cursor-pointer' : ''}`}
                                              onClick={chord ? (e) => {
                                                e.stopPropagation();
                                                onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'chords');
                                              } : undefined}
                                            >
                                              {chord && (
                                                <FormattedChord 
                                                  chordString={(() => {
                                                    const transposed = transposeChord(chord, offset, playKey);
                                                    if (song.showNashvilleNumbers) {
                                                      return isNashville(transposed) ? transposed : getNashvilleNumber(transposed, playKey);
                                                    } else {
                                                      return isNashville(transposed) ? parseNashvilleToChord(transposed, playKey) : transposed;
                                                    }
                                                  })()}
                                                  compactModifier={compactModifier}
                                                />
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                            {showBottomLane && (
                              <div className={`absolute bottom-1 left-1 right-1 ${inlineTimeSignatureOffsetClass}`}>
                                {showBottomRhythmLane && bar.riff ? (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-end gap-1">
                                      {bar.rhythmLabel && (
                                        <div 
                                          className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'rhythmLabel');
                                          }}
                                        >
                                          <span className="text-[8px] font-bold text-black uppercase leading-none">
                                            {bar.rhythmLabel}
                                          </span>
                                        </div>
                                      )}
                                      <div
                                        className={`bg-gray-300/70 mix-blend-multiply rounded-sm px-1 py-0 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass} ${bar.rhythmLabel ? 'flex-1' : ''}`}
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
                                      {bar.riffLabel && (
                                        <div 
                                          className="border border-black px-1 rounded-sm mr-1 mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'riffLabel');
                                          }}
                                        >
                                          <span className="text-[8px] font-bold text-black uppercase leading-none">
                                            {bar.riffLabel}
                                          </span>
                                        </div>
                                      )}
                                      <div 
                                        className={`bg-gray-300/70 mix-blend-multiply rounded-sm px-1 py-0 flex-1 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'riff');
                                        }}
                                      >
                                        <Jianpu
                                          notation={bar.riff}
                                          compact
                                          scale={0.86}
                                          className="w-full"
                                          previousNotationForCrossBar={bIdx > 0 ? row.bars[bIdx - 1]?.riff : undefined}
                                          nextNotationForCrossBar={bIdx < row.bars.length - 1 ? row.bars[bIdx + 1]?.riff : undefined}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-end gap-1 h-[18px] overflow-visible">
                                    {showBottomRhythmLane && bar.rhythmLabel && (
                                      <div 
                                        className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'rhythmLabel');
                                        }}
                                      >
                                        <span className="text-[8px] font-bold text-black uppercase leading-none">
                                          {bar.rhythmLabel}
                                        </span>
                                      </div>
                                    )}

                                    {bar.riff && bar.riffLabel && (
                                      <div 
                                        className="border border-black px-1 rounded-sm mb-0.5 flex-shrink-0 bg-gray-300/70 mix-blend-multiply z-10 flex items-center h-[14px] cursor-pointer hover:bg-indigo-200/70 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onElementClick?.(row.sIdx, row.startBIdx + bIdx, 'riffLabel');
                                        }}
                                      >
                                        <span className="text-[8px] font-bold text-black uppercase leading-none">
                                          {bar.riffLabel}
                                        </span>
                                      </div>
                                    )}

                                    <div
                                      className={`bg-gray-300/70 mix-blend-multiply rounded-sm px-1 py-0 flex-1 cursor-pointer hover:bg-indigo-200/70 transition-colors ${sharedLaneClass}`}
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
                                          notation={bar.riff!}
                                          compact
                                          scale={0.86}
                                          className="w-full"
                                          previousNotationForCrossBar={bIdx > 0 ? row.bars[bIdx - 1]?.riff : undefined}
                                          nextNotationForCrossBar={bIdx < row.bars.length - 1 ? row.bars[bIdx + 1]?.riff : undefined}
                                        />
                                      )}
                                    </div>
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
            <span>Generated by ChordMaster</span>
            <span>Page {pIdx + 1} of {pages.length}</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChordSheet;
