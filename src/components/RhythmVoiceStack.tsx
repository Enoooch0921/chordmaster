import React from 'react';
import type { RhythmVoice } from '../types';
import RhythmNotation from './RhythmNotation';
import { rhythmEndsWithTieToNext } from '../utils/rhythmUtils';

type Props = React.ComponentProps<typeof RhythmNotation> & {
  voices: RhythmVoice[];
  primaryLabel: string;
  previousVoices?: RhythmVoice[];
  nextVoices?: RhythmVoice[];
  previousTimeSignature?: string;
  activeVoiceId?: string;
  onVoiceInsertSelect?: (voiceId: string, unit: number, event?: React.MouseEvent<HTMLElement>) => void;
};
export default function RhythmVoiceStack({ voices, primaryLabel, previousVoices, nextVoices, previousTimeSignature, activeVoiceId, onVoiceInsertSelect, ...primary }: Props) {
  const main = activeVoiceId ? { ...primary, selectedInsertIndex: null, showInsertCursor: false } : primary;
  if (!voices.length) return <RhythmNotation {...main} />;
  const lane = (label: string, notation: React.ReactNode, id: string) => (
    <div key={id} data-rhythm-voice={id} data-preview-active-voice={id === activeVoiceId ? true : undefined} className="relative flex w-full items-center gap-1" style={{ height: 18 }}>
      {id === activeVoiceId ? <span data-preview-edit-ui aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-sm ring-1 ring-indigo-400" /> : null}
      <span className="w-7 shrink-0 truncate text-[7px] font-semibold leading-none" title={label}>{label}</span>
      <div className="min-w-0 flex-1">{notation}</div>
    </div>
  );
  return <div data-rhythm-voice-stack className="flex w-full flex-col gap-1">
    {primary.notation.trim() && lane(primaryLabel, <RhythmNotation {...main} />, 'primary')}
    {voices.map(voice => {
      const previous = previousVoices?.find(v => v.id === voice.id);
      return lane(voice.label, <RhythmNotation
      notation={voice.rhythm}
      selectionMode={primary.selectionMode}
      selectedInsertIndex={voice.id === activeVoiceId ? primary.selectedInsertIndex : null}
      showInsertCursor={voice.id === activeVoiceId && primary.showInsertCursor}
      onInsertSelect={onVoiceInsertSelect ? (unit, event) => onVoiceInsertSelect(voice.id, unit, event) : undefined}
      timeSignature={primary.timeSignature} compact={primary.compact}
      color={primary.color} accentScale={primary.accentScale}
      tieFromPrevious={Boolean(previous?.rhythm && rhythmEndsWithTieToNext(previous.rhythm, previousTimeSignature || primary.timeSignature))}
      nextNotationForCrossBar={nextVoices?.find(v => v.id === voice.id)?.rhythm}
      nextTimeSignatureForCrossBar={primary.nextTimeSignatureForCrossBar}
      className="w-full"
    />, voice.id); })}
  </div>;
}
