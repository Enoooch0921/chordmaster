import { ArrowLeft, ArrowLeftRight, ArrowRight, LockKeyhole } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef } from 'react';
import type { AppLanguage, Bar } from '../../types';
import type { ChordBeatOffsetValue } from '../../lib/chordTimingReview';
import { getChordDisplaySlotOwnership, type ChordDisplaySlotOwnership } from '../../utils/chordSlots';
import { chordBeatPositionLabel, getChordBeatOffset } from '../../utils/chordBeatOffsets';

export interface OffbeatMoveAction {
  available: boolean;
  swap?: boolean;
  label: string;
  shortTarget: string;
  run: () => void;
}

export interface OffbeatMoveControls {
  left: OffbeatMoveAction;
  right?: OffbeatMoveAction;
}

interface Props {
  bar: Bar;
  beats: number;
  beat: number;
  offset: ChordBeatOffsetValue;
  language: AppLanguage;
  offbeatMove?: OffbeatMoveControls;
  onSelect: (beat: number, offset: ChordBeatOffsetValue) => void;
}

export function canSelectOffbeat(slot: ChordDisplaySlotOwnership | null | undefined) {
  return !slot?.covered && !/^(?:0|%|\|)/.test(slot?.chord.trim() ?? '');
}

const SHORT_OFFSETS: Record<Exclude<ChordBeatOffsetValue, 0>, string> = {
  0.25: 'e',
  0.5: '&',
  0.75: 'a'
};

export default function ChordBeatStrip({ bar, beats, beat, offset, language, onSelect, offbeatMove }: Props) {
  const zh = language === 'zh';
  const currentPosition = chordBeatPositionLabel(beat, offset);
  const offbeatDescription = zh
    ? `第 ${beat + 1} 拍${offset === 0.5 ? '後半拍' : ` ${SHORT_OFFSETS[offset as 0.25 | 0.5 | 0.75]} 拍位`}`
    : `Beat ${beat + 1} ${offset === 0.5 ? 'offbeat' : SHORT_OFFSETS[offset as 0.25 | 0.5 | 0.75]}`;
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedPairRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const pair = selectedPairRef.current;
    if (!strip || !pair || strip.scrollWidth <= strip.clientWidth) return;
    const left = pair.offsetLeft;
    const right = left + pair.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, [beat, offset, beats]);

  return <div ref={stripRef} className="chord-beat-strip" role="group" aria-label={zh ? '和弦拍位' : 'Chord beat positions'}>
    {getChordDisplaySlotOwnership(bar.chords, beats).map((slot, index) => {
      const primaryOffset = (slot ? getChordBeatOffset(bar, slot.rawIndex) ?? 0 : 0) as ChordBeatOffsetValue;
      const beatSubdivisions = (bar.chordSubdivisions ?? []).filter(entry => entry.beat === index);
      const presentOffsets = new Set<ChordBeatOffsetValue>([0]);
      if (!slot?.covered && primaryOffset !== 0) presentOffsets.add(primaryOffset);
      beatSubdivisions.forEach(entry => presentOffsets.add(entry.offset));
      if (beat === index && offset !== 0) presentOffsets.add(offset);
      const positions = Array.from(presentOffsets).sort((a, b) => a - b);
      const hasSplit = positions.length > 1;
      const isSelectedBeatWithMove = index === beat && Boolean(offbeatMove) && offset !== 0;
      const hasDownbeatChord = Boolean(slot && !slot.covered && primaryOffset === 0 && slot.chord.trim() && slot.chord.trim() !== '/');
      // Hide a redundant empty/disabled downbeat slot while inline nudge controls sit beside the active offbeat pill.
      const visiblePositions = isSelectedBeatWithMove && !hasDownbeatChord
        ? positions.filter(pos => pos !== 0)
        : positions;
      const showRight = Boolean(isSelectedBeatWithMove && offbeatMove?.right?.available);
      const totalCols = visiblePositions.length + (isSelectedBeatWithMove ? 1 : 0) + (showRight ? 1 : 0);

      return <div
        className="chord-beat-pair"
        data-split={hasSplit || undefined}
        data-move-action={isSelectedBeatWithMove ? totalCols : undefined}
        style={totalCols > 2 ? { minWidth: `calc(${totalCols} * var(--beat-key-width))`, flexGrow: totalCols * 0.72 } : undefined}
        key={index}
        ref={index === beat ? selectedPairRef : undefined}
      >
        {visiblePositions.map(position => {
          const selected = beat === index && offset === position;
          const label = position === 0
            ? (zh ? `第 ${index + 1} 拍正拍` : `Beat ${index + 1} downbeat`)
            : position === 0.5
              ? (zh ? `第 ${index + 1} 拍反拍` : `Beat ${index + 1} offbeat`)
              : (zh ? `第 ${index + 1} 拍 ${SHORT_OFFSETS[position]}` : `Beat ${index + 1} ${SHORT_OFFSETS[position]}`);
          const subChord = position !== 0 ? beatSubdivisions.find(entry => entry.offset === position)?.chord : undefined;
          const chord = slot && !slot.covered && primaryOffset === position ? slot.chord : subChord;
          const isSelectedOffbeat = isSelectedBeatWithMove && selected;
          const leftAction = isSelectedOffbeat ? offbeatMove!.left : null;
          const rightAction = isSelectedOffbeat && showRight ? offbeatMove!.right! : null;

          return <Fragment key={position}>{leftAction && (leftAction.available
            ? <button
                type="button"
                className="beat-snap-action"
                data-swap={leftAction.swap || undefined}
                onClick={leftAction.run}
                title={leftAction.label}
                aria-label={leftAction.label}
              >
                {leftAction.swap ? <ArrowLeftRight size={13} aria-hidden="true" /> : <ArrowLeft size={13} aria-hidden="true" />}
                <span aria-hidden="true">{leftAction.shortTarget}</span>
              </button>
            : <span className="beat-snap-locked" role="status" title={leftAction.label}>
                <LockKeyhole size={13} aria-hidden="true" /><span className="sr-only">{leftAction.label}</span>
              </span>)}
            <button
              type="button"
              aria-label={label}
              aria-description={chord || undefined}
              aria-pressed={selected}
              title={chord ? `${label} · ${chord}` : label}
              disabled={position !== 0 ? !canSelectOffbeat(slot) : Boolean(slot?.covered || primaryOffset)}
              onClick={() => onSelect(index, position)}
            >
              <span>{selected || position === 0 ? chordBeatPositionLabel(index, position) : SHORT_OFFSETS[position]}</span>
              <span className="chord-beat-value">{chord}</span>
            </button>
            {rightAction && (
              <button
                type="button"
                className="beat-snap-action"
                data-swap={rightAction.swap || undefined}
                onClick={rightAction.run}
                title={rightAction.label}
                aria-label={rightAction.label}
              >
                <span aria-hidden="true">{rightAction.shortTarget}</span>
                {rightAction.swap ? <ArrowLeftRight size={13} aria-hidden="true" /> : <ArrowRight size={13} aria-hidden="true" />}
              </button>
            )}
          </Fragment>;
        })}
      </div>;
    })}
    <span aria-live="polite" aria-atomic="true" className="sr-only">
      {offset !== 0 ? offbeatDescription : (zh ? `拍位 ${currentPosition}` : `Beat ${currentPosition}`)}
    </span>
  </div>;
}
