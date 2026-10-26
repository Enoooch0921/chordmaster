import React from 'react';
import type { AppLanguage, Key, PickupMeasure } from '../types';
import { getPickupDisplay, PICKUP_EDITOR_BAR_ID, PICKUP_EDITOR_SECTION_ID } from '../utils/pickupUtils';
import type { PreviewNotationCursor } from '../lib/previewEditSession';
import { convertRelativeJianpuToAbsoluteNotation } from '../utils/jianpuUtils';
import { visibleJianpuVoices } from '../utils/jianpuVoices';
import JianpuVoiceStack from './JianpuVoiceStack';
import RhythmNotation from './RhythmNotation';
import { parseTimeSignature } from '../utils/rhythmUtils';

interface Props {
  pickup?: PickupMeasure;
  meter: string;
  language: AppLanguage;
  playKey: Key;
  absolute?: boolean;
  active?: boolean;
  previewIdentity?: string;
  cursor?: PreviewNotationCursor;
  nextRiff?: string;
  nextRhythm?: string;
  nextTimeSignature?: string;
  notationTop?: number;
  rhythmLaneHeight?: number;
  onSelect?: (event: React.MouseEvent<HTMLElement>, field: 'riff' | 'rhythm', cursor?: PreviewNotationCursor) => void;
}

export default function PickupPreview({ pickup, meter, language, playKey, absolute, active,
  nextRiff, nextRhythm, nextTimeSignature, notationTop, rhythmLaneHeight, onSelect, previewIdentity = 'preview', cursor }: Props) {
  const zh = language === 'zh';
  const anchor = (mode: string) => `${previewIdentity}|${PICKUP_EDITOR_SECTION_ID}|${PICKUP_EDITOR_BAR_ID}|${mode}|all`;
  if (!pickup) return onSelect ? <button type="button" data-preview-only-control="true"
    data-preview-edit-anchor={anchor('jianpu')}
    className="mt-2 self-center whitespace-nowrap rounded border border-dashed border-gray-200 px-1 py-1 text-[9px] text-gray-400 hover:border-emerald-400 hover:text-emerald-700"
    aria-label={zh ? '新增弱起拍（第 0 小節）' : 'Add pickup (bar 0)'}
    onClick={event => onSelect(event, 'riff')}>{zh ? '＋ 弱起' : '+ Pickup'}</button> : null;
  const display = getPickupDisplay(pickup, meter);
  if (!display.hasContent && !onSelect) return null;
  const convert = (riff: string) => absolute ? convertRelativeJianpuToAbsoluteNotation(riff, playKey) : riff;
  const voices = visibleJianpuVoices(display.riffVoices).map(voice => ({
    id: voice.id, label: voice.label, notation: convert(voice.riff)
  }));
  const hasPrimary = Boolean(pickup.riff?.trim());
  const { beatUnits, barUnits, beats } = parseTimeSignature(display.timeSignature);
  const jianpuCursor = active && cursor?.kind === 'jianpu' ? cursor : null;
  const cursorUnit = jianpuCursor ? Math.min(barUnits, jianpuCursor.beatIndex * beatUnits + jianpuCursor.unitIndex) : null;
  const laneClass = `relative block w-full rounded-sm bg-gray-300/70 px-1 text-left mix-blend-multiply ${active ? 'ring-1 ring-emerald-300' : ''}`;
  const selectLane = (event: React.MouseEvent<HTMLElement>, field: 'riff' | 'rhythm', nextCursor?: PreviewNotationCursor) => {
    event.stopPropagation();
    onSelect?.(event, field, nextCursor);
  };
  return <div data-preview-pickup role="group" aria-label={zh ? '第 0 小節・弱起拍' : 'Bar 0 · Pickup'}
    data-preview-edit-anchor={anchor('lower')}
    data-pickup-duration-units={display.durationUnits}
    className={`${notationTop === undefined ? 'relative mt-auto gap-0.5' : 'absolute inset-x-0 gap-1.5'} flex w-full min-w-0 flex-col py-1`} style={notationTop === undefined ? undefined : { top: notationTop - 4 }}>
    {(pickup.rhythm?.trim() || active && cursor?.kind === 'rhythm') && <div role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} className={laneClass} style={rhythmLaneHeight ? { minHeight: rhythmLaneHeight } : undefined}
      data-preview-edit-anchor={anchor('rhythm')}
      aria-label={zh ? '編輯弱起節奏' : 'Edit pickup rhythm'} onClick={event => selectLane(event, 'rhythm')}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}>
      <RhythmNotation notation={display.rhythm ?? ''} timeSignature={display.rhythmTimeSignature} compact
        selectionMode="insert" selectedInsertIndex={active && cursor?.kind === 'rhythm' ? cursor.cursorUnit : null}
        onInsertSelect={onSelect ? (unit, event) => { if (event) selectLane(event, 'rhythm', { kind: 'rhythm', cursorUnit: unit }); } : undefined}
        nextNotationForCrossBar={nextRhythm} nextTimeSignatureForCrossBar={nextTimeSignature} />
    </div>}
    {(hasPrimary || voices.length > 0 || !display.hasContent || active && cursor?.kind === 'jianpu') && <div role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} className={`${laneClass} min-h-5`}
      data-preview-edit-anchor={anchor('jianpu')}
      aria-label={zh ? '編輯弱起簡譜' : 'Edit pickup jianpu'} onClick={event => selectLane(event, 'riff')}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}>
      <div className="relative w-full min-w-0">
      {jianpuCursor && <>
        <span data-preview-edit-ui data-preview-notation-cursor-beat
          className="notation-beat-frame pointer-events-none absolute z-[0]"
          style={{ left: `${Math.min(beats - 1, jianpuCursor.beatIndex) / beats * 100}%`, width: `${100 / beats}%`, top: -4, bottom: -4 }} />
        {jianpuCursor.noteIndex == null && <span data-preview-edit-ui data-preview-notation-cursor-caret
          className="notation-note-pointer pointer-events-none absolute z-[2]"
          style={{ left: `${cursorUnit! / barUnits * 100}%`, top: 'calc(100% + 6px)' }} />}
      </>}
      <JianpuVoiceStack voices={voices} primaryLabel={zh ? '主聲部' : 'Main'} showPrimary={hasPrimary || Boolean(jianpuCursor)}
        notation={convert(display.riff)} timeSignature={display.timeSignature} literalDurations compact scale={0.86}
        gridSlotCount={beatUnits}
        activeNote={active && cursor?.kind === 'jianpu' && cursor.noteIndex != null ? { tokenIndex: cursor.beatIndex, noteIndex: cursor.noteIndex } : null}
        showPlaceholders={Boolean(active)}
        onNoteClick={onSelect ? (beatIndex, noteIndex, event) => { if (event) selectLane(event, 'riff', { kind: 'jianpu', beatIndex, unitIndex: 0, noteIndex }); } : undefined}
        onTokenClick={onSelect ? (beatIndex, slotIndex, event) => { if (event) selectLane(event, 'riff', { kind: 'jianpu', beatIndex, unitIndex: slotIndex, noteIndex: null }); } : undefined}
        nextNotationForCrossBar={nextRiff ? convert(nextRiff) : undefined} className="w-full min-w-0" />
      </div>
    </div>}
  </div>;
}
