import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AppLanguage, Bar, Song } from '../types';
import { useAuditionPreferences } from '../hooks/useAuditionPreferences';
import { getSongTimeSignatureStates } from '../lib/songEditing';
import { isClosedBar } from '../utils/closedBar';
import { getChordEvents } from '../utils/chordSubdivisions';
import { chordBeatPositionLabel } from '../utils/chordBeatOffsets';
import { hasUnmeteredChords } from '../utils/unmeteredChords';
import ChordAuditionControl, { type ChordPlayback } from './preview-edit/ChordAuditionControl';
import './preview-edit/PreviewKeyboard.css';

interface Props {
  song: Song;
  identity: string;
  language: AppLanguage;
  userId?: string | null;
  triggerHost: HTMLSpanElement | null;
  chartVisible: boolean;
  hidePanel: boolean;
  onPlaybackChange: (playback: ChordPlayback | null) => void;
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

export default function ReaderAudition({ song, identity, language, chartRef, triggerHost, userId, chartVisible, hidePanel, onPlaybackChange }: Props) {
  const zh = language === 'zh';
  const [open, setOpen] = useState(false);
  const [choosingStart, setChoosingStart] = useState(false);
  const panelId = useId();
  const pickerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    setChoosingStart(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const preferences = useAuditionPreferences(userId, 'song');
  const byMap = preferences.scope === 'map';
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
  const sectionStarts = useMemo(() => measures.flatMap((m, index) =>
    m.sectionIndex !== measures[index - 1]?.sectionIndex ? [index] : []
  ), [measures]);
  const measureIndex = measures[selection.measure] ? selection.measure : 0;
  const measure = measures[measureIndex];
  const untimed = measure && (measure.bar.chordTimingUnspecified || hasUnmeteredChords(measure.bar));
  const positions = useMemo(() => measure ? auditionPositions(measure.bar, measure.beats) : [], [measure]);

  // Listen on the visible chart only. The reader never opens an editing session.
  useEffect(() => {
    const chart = chartRef.current;
    if (!open || !chart || !chartVisible) return;
    const pick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element) || event.target.closest('button,select,a,input')) return;
      const cell = event.target.closest<HTMLElement>('[data-audition-section-index][data-audition-bar-index]');
      if (!cell || cell.dataset.auditionChart !== identity) return;
      const index = measures.findIndex(m => m.sectionIndex === Number(cell.dataset.auditionSectionIndex)
        && m.barIndex === Number(cell.dataset.auditionBarIndex));
      if (index < 0) return;
      event.stopPropagation();
      if (byMap) return;
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
  }, [open, chartRef, chartVisible, identity, measures, byMap]);

  if (!measure) return null;
  const position = positions[selection.position] ?? positions[0];
  const sectionName = (index: number) => measures[index].sectionTitle.trim()
    || (zh ? `段落 ${measures[index].sectionIndex + 1}` : `Section ${measures[index].sectionIndex + 1}`);
  const barLabel = zh ? `第 ${measure.barIndex + 1} 小節` : `Bar ${measure.barIndex + 1}`;
  const beatDetail = position && (untimed || position.beat || position.offset)
    ? (untimed ? position.label : zh ? `第 ${position.label} 拍` : `Beat ${position.label}`) : '';
  const barLocation = `${sectionName(measureIndex)} · ${barLabel}`;
  const location = beatDetail ? `${barLocation} · ${beatDetail}` : barLocation;
  const changeStart = zh ? '更換起點' : 'Change start';
  const goToMeasure = (index: number) => setSelection({ measure: index, position: 0 });
  const beatLabel = untimed ? (zh ? '和弦' : 'Chord') : (zh ? '拍位' : 'Beat');
  const toggleLabel = open ? (zh ? '收起試聽' : 'Hide playback') : (zh ? '試聽' : 'Listen');
  return <>
    {triggerHost && createPortal(
      <button type="button" ref={triggerRef} className="reader-audition-toggle" data-preview-only-control
        aria-expanded={open} aria-controls={panelId} aria-label={toggleLabel} onClick={() => open ? close() : setOpen(true)}>
        <Headphones size={16} aria-hidden="true" />{open ? (zh ? '收起' : 'Hide') : toggleLabel}
      </button>, triggerHost)}
    <div ref={panelRef} id={panelId} tabIndex={-1} hidden={!open || hidePanel} role="region" aria-label={zh ? '和弦試聽' : 'Chord playback'}
      className="reader-audition" data-keyboard-refined data-preview-only-control
      onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) {
        event.stopPropagation(); close();
      } }}>
      {open && <>
        <div className="reader-audition-controls">
          <ChordAuditionControl song={song} identity={identity} language={language} selectionLabel=""
            target={{ sectionId: measure.sectionId, sectionOccurrence: measure.sectionOccurrence, barId: measure.barId,
              slotIndex: position?.beat ?? 0, offset: position?.offset, orderedIndex: position?.orderedIndex }}
            {...preferences} onPlaybackChange={onPlaybackChange} feedbackHost={feedbackHost}/>
          {byMap ? <div ref={setFeedbackHost} /> : <button type="button" className="reader-start" aria-expanded={choosingStart} aria-controls={pickerId}
            aria-label={`${changeStart} · ${location}`} title={zh ? `更換起點（也可點譜） · ${location}` : `Change start or tap the score · ${location}`} onClick={() => setChoosingStart(value => !value)}>
            <span className="reader-start-section">{sectionName(measureIndex)}</span>
            <span className="reader-start-bar">{barLabel}{beatDetail && ` · ${beatDetail}`}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>}
          <button type="button" className="reader-audition-close" aria-label={zh ? '收起試聽面板' : 'Collapse playback panel'}
            title={toggleLabel} onClick={close}><X size={17} aria-hidden="true" /></button>
        </div>
        <div className="reader-start-picker" id={pickerId} hidden={!choosingStart || byMap}>
          {choosingStart && !byMap && <>
            <label>{zh ? '段落' : 'Section'}
              <select name="audition-section" value={measure.sectionIndex}
                onChange={event => goToMeasure(sectionStarts[event.target.selectedIndex])}>
                {sectionStarts.map(index => <option key={index} value={measures[index].sectionIndex}>{sectionName(index)}</option>)}
              </select>
            </label>
            <div className="reader-bar-field" role="group" aria-label={zh ? '小節' : 'Bar'}>
              <span>{zh ? '小節' : 'Bar'}</span>
              <div className="reader-bar-stepper">
                <button type="button" disabled={measureIndex === 0} aria-label={zh ? '上一小節' : 'Previous bar'}
                  onClick={() => goToMeasure(measureIndex - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
                <output aria-label={zh ? '目前小節' : 'Selected bar'}>{measure.barIndex + 1}</output>
                <button type="button" disabled={measureIndex === measures.length - 1} aria-label={zh ? '下一小節' : 'Next bar'}
                  onClick={() => goToMeasure(measureIndex + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            </div>
            <label>{beatLabel}
              <select name="audition-position" value={Math.max(0, positions.indexOf(position))} disabled={!positions.length}
                onChange={e => setSelection({ measure: measureIndex, position: Number(e.target.value) })}>
                {positions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
            </label>
          </>}
        </div>
      </>}
      {!byMap && <div ref={setFeedbackHost} />}
    </div>
  </>;
}
