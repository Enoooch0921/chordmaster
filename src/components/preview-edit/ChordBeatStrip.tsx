import { useLayoutEffect, useRef } from 'react';
import type { AppLanguage, Bar } from '../../types';
import { getChordDisplaySlotOwnership, type ChordDisplaySlotOwnership } from '../../utils/chordSlots';
import { chordBeatPositionLabel, getChordBeatOffset } from '../../utils/chordBeatOffsets';

interface Props {
  bar: Bar;
  beats: number;
  beat: number;
  offset: number;
  language: AppLanguage;
  onSelect: (beat: number, offset: 0 | 0.5) => void;
}

export function canSelectOffbeat(slot: ChordDisplaySlotOwnership | null | undefined) {
  return !slot?.covered && !/^(?:0|%|\|)/.test(slot?.chord.trim() ?? '');
}

export default function ChordBeatStrip({bar, beats, beat, offset, language, onSelect}: Props) {
  const zh = language === 'zh';
  const currentPosition = chordBeatPositionLabel(beat, offset);
  const offbeatDescription = zh ? `第 ${beat + 1} 拍後半拍` : `Beat ${beat + 1} offbeat`;
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
      const primaryOffset = slot ? getChordBeatOffset(bar, slot.rawIndex) ?? 0 : 0;
      const offbeat = bar.chordSubdivisions?.find(entry => entry.beat === index && entry.offset === 0.5);
      const showOffbeat = (beat === index && offset === 0.5) || (!slot?.covered && primaryOffset === 0.5) || Boolean(offbeat);
      const positions = showOffbeat ? [0, 0.5] as const : [0] as const;
      return <div className="chord-beat-pair" data-split={showOffbeat || undefined} key={index} ref={index === beat ? selectedPairRef : undefined}>
        {positions.map(position => {
          const selected = beat === index && offset === position;
          const label = zh ? `第 ${index + 1} 拍${position ? '反拍' : '正拍'}` : `Beat ${index + 1}${position ? ' offbeat' : ' downbeat'}`;
          const chord = slot && !slot.covered && primaryOffset === position
            ? slot.chord : position === 0.5 ? offbeat?.chord : undefined;
          return <button type="button" key={position}
            aria-label={label} aria-description={chord || undefined} aria-pressed={selected}
            title={chord ? `${label} · ${chord}` : label}
            disabled={position ? !canSelectOffbeat(slot) : Boolean(slot?.covered || primaryOffset)}
            onClick={() => onSelect(index, position)}>
            <span>{selected || !position ? chordBeatPositionLabel(index, position) : '&'}</span>
            <span className="chord-beat-value">{chord}</span>
          </button>;
        })}
      </div>;
    })}
    <span aria-live="polite" aria-atomic="true" className="sr-only">
      {offset === 0.5 ? offbeatDescription : (zh ? `拍位 ${currentPosition}` : `Beat ${currentPosition}`)}
    </span>
  </div>;
}
