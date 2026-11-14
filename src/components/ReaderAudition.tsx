import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, ChevronUp } from 'lucide-react';
import type { AppLanguage, Bar, Song } from '../types';
import type { AuditionScope } from '../lib/chordAudition';
import { getSongTimeSignatureStates } from '../lib/songEditing';
import { isClosedBar } from '../utils/closedBar';
import { getChordEvents } from '../utils/chordSubdivisions';
import { chordBeatPositionLabel } from '../utils/chordBeatOffsets';
import { hasUnmeteredChords } from '../utils/unmeteredChords';
import ChordAuditionControl from './preview-edit/ChordAuditionControl';
import './preview-edit/PreviewKeyboard.css';

interface Props {
  song: Song;
  identity: string;
  language: AppLanguage;
  triggerHost: HTMLSpanElement | null;
  chartRef: React.RefObject<HTMLDivElement | null>;
}

function auditionPositions(bar: Bar, beats: number) {
  if (bar.chordTimingUnspecified || hasUnmeteredChords(bar)) {
    return (bar.unmeteredChordLines?.flat() ?? bar.chords).filter(token => token.trim())
      .map((token, orderedIndex) => ({ beat: 0, offset: 0, orderedIndex, label: token }));
  }
  const events = getChordEvents(bar, beats);
  return Array.from({ length: beats }, (_, beat) =>
    [0, ...new Set(events.filter(event => event.beat === beat && event.offset > 0).map(event => event.offset))]
      .map(offset => ({ beat, offset, orderedIndex: undefined, label: chordBeatPositionLabel(beat, offset) }))
  ).flat();
}

export default function ReaderAudition({ song, identity, language, chartRef, triggerHost }: Props) {
  const zh = language === 'zh';
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    if (open) measureRef.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const [scope, setScope] = useState<AuditionScope>('song');
  const [metronome, setMetronome] = useState(true);
  const [melody, setMelody] = useState(true);
  const [feedbackHost, setFeedbackHost] = useState<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState({ measure: 0, position: 0 });
  const measures = useMemo(() => {
    const meters = getSongTimeSignatureStates(song).barActiveTimeSignatures;
    const occurrences = new Map<string, number>();
    return song.sections.flatMap((section, s) => {
      const sectionId = section.id!;
      const occurrence = occurrences.get(sectionId) ?? 0;
      occurrences.set(sectionId, occurrence + 1);
      return section.bars.flatMap((bar, b) => isClosedBar(bar) ? [] : [{
        sectionId, sectionOccurrence: occurrence, barId: bar.id!, sectionTitle: section.title,
        sectionIndex: s, barIndex: b, bar, beats: Number(meters[s][b].split('/')[0])
      }]);
    });
  }, [song]);
  const measureIndex = measures[selection.measure] ? selection.measure : 0;
  const measure = measures[measureIndex];
  const untimed = measure && (measure.bar.chordTimingUnspecified || hasUnmeteredChords(measure.bar));
  const positions = useMemo(() => measure ? auditionPositions(measure.bar, measure.beats) : [], [measure]);

  // Listen on the visible chart only. The reader never opens an editing session.
  useEffect(() => {
    const chart = chartRef.current;
    if (!open || !chart) return;
    const pick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element) || event.target.closest('button,select,a,input')) return;
      const cell = event.target.closest<HTMLElement>('[data-audition-section-index][data-audition-bar-index]');
      if (!cell || cell.dataset.auditionChart !== identity) return;
      const index = measures.findIndex(m => m.sectionIndex === Number(cell.dataset.auditionSectionIndex)
        && m.barIndex === Number(cell.dataset.auditionBarIndex));
      if (index < 0) return;
      const mark = event.target.closest<HTMLElement>('[data-audition-token], [data-audition-beat], [data-preview-slot-index]');
      const m = measures[index];
      const beat = Number(mark?.dataset.auditionBeat ?? mark?.dataset.previewSlotIndex ?? 0);
      const offset = Number(mark?.dataset.auditionOffset ?? 0);
      const position = mark?.dataset.auditionToken !== undefined ? Number(mark.dataset.auditionToken)
        : auditionPositions(m.bar, m.beats).findIndex(p => p.beat === beat && p.offset === offset);
      setSelection({ measure: index, position: Math.max(0, position) });
    };
    chart.addEventListener('click', pick, true);
    return () => chart.removeEventListener('click', pick, true);
  }, [open, chartRef, identity, measures]);

  if (!measure) return null;
  const position = positions[selection.position] ?? positions[0];
  const measureLabel = zh ? '起始小節' : 'Starting bar';
  const beatLabel = untimed ? (zh ? '和弦' : 'Chord') : (zh ? '拍位' : 'Beat');
  const toggleLabel = open ? (zh ? '收起試聽' : 'Hide playback') : (zh ? '試聽' : 'Listen');
  return <>
    {triggerHost && createPortal(
      <button type="button" ref={triggerRef} className="reader-audition-toggle" data-preview-only-control
        aria-expanded={open} aria-controls={panelId} aria-label={toggleLabel} onClick={() => open ? close() : setOpen(true)}>
        <Headphones size={16} aria-hidden="true" />{open ? (zh ? '收起' : 'Hide') : toggleLabel}
      </button>, triggerHost)}
    <div id={panelId} hidden={!open} role="region" aria-label={zh ? '和弦試聽' : 'Chord playback'}
      className="reader-audition" data-keyboard-refined data-preview-only-control
      onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) {
        event.stopPropagation(); close();
      } }}>
      {open && <div className="reader-audition-controls">
        <label className="reader-measure"><span>{measureLabel}</span>
          <select ref={measureRef} value={measureIndex} onChange={e => setSelection({ measure: Number(e.target.value), position: 0 })}>
            {measures.map((m, index) => <option key={index} value={index}>{m.sectionTitle} · {zh ? `第 ${m.barIndex + 1} 小節` : `Bar ${m.barIndex + 1}`}</option>)}
          </select>
        </label>
        <label className="reader-beat"><span>{beatLabel}</span>
          <select value={Math.max(0, positions.indexOf(position))} disabled={!positions.length}
            onChange={e => setSelection({ measure: measureIndex, position: Number(e.target.value) })}>
            {positions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </label>
        <ChordAuditionControl song={song} identity={identity} language={language} selectionLabel="" prominent
          target={{ sectionId: measure.sectionId, sectionOccurrence: measure.sectionOccurrence, barId: measure.barId,
            slotIndex: position?.beat ?? 0, offset: position?.offset, orderedIndex: position?.orderedIndex }}
          scope={scope} setScope={setScope} melody={melody} setMelody={setMelody}
          metronome={metronome} setMetronome={setMetronome} feedbackHost={feedbackHost}/>
        <button type="button" className="reader-audition-close" aria-label={zh ? '收起試聽面板' : 'Collapse playback panel'}
          title={toggleLabel} onClick={close}><ChevronUp size={18} aria-hidden="true" /></button>
      </div>}
      <div ref={setFeedbackHost} />
    </div>
  </>;
}
