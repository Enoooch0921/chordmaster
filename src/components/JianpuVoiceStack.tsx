import React from 'react';
import Jianpu from './Jianpu';

export interface DisplayJianpuVoice {
  id: string;
  label: string;
  notation: string;
  previousNotation?: string;
  nextNotation?: string;
  incomingPhraseCount?: number;
}

type Props = React.ComponentProps<typeof Jianpu> & {
  voices: DisplayJianpuVoice[];
  primaryLabel: string;
  showPrimary: boolean;
  activeVoiceId?: string;
  onVoiceTokenClick?: (voiceId: string, beatIndex: number, unitIndex: number, event?: React.MouseEvent<HTMLElement>) => void;
  onVoiceNoteClick?: (voiceId: string, beatIndex: number, noteIndex: number, event?: React.MouseEvent<HTMLElement>) => void;
};

export default function JianpuVoiceStack({ voices, primaryLabel, showPrimary, activeVoiceId, onVoiceTokenClick, onVoiceNoteClick, ...primary }: Props) {
  const main = activeVoiceId ? { ...primary, activeNote: null, showPlaceholders: false } : primary;
  if (!voices.length) return <Jianpu {...main} />;
  const lane = (label: string, notation: React.ReactNode, id: string) => (
    <div key={id} data-jianpu-voice={id} data-preview-active-voice={id === activeVoiceId ? true : undefined} className="relative flex w-full min-w-0 items-center gap-1">
      {id === activeVoiceId ? <span data-preview-edit-ui aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-sm ring-1 ring-indigo-400" /> : null}
      <span className="w-7 shrink-0 truncate text-[7px] font-semibold leading-none" title={label}>{label}</span>
      <div className="min-w-0 flex-1">{notation}</div>
    </div>
  );
  return <div data-jianpu-voice-stack className="flex w-full min-w-0 flex-col gap-1">
    {showPrimary && lane(primaryLabel, <Jianpu {...main} />, 'primary')}
    {voices.map(voice => lane(voice.label, <Jianpu
      notation={voice.notation}
      activeNote={voice.id === activeVoiceId ? primary.activeNote : null}
      showPlaceholders={voice.id === activeVoiceId && primary.showPlaceholders}
      onTokenClick={onVoiceTokenClick ? (beat, unit, event) => onVoiceTokenClick(voice.id, beat, unit, event) : undefined}
      onNoteClick={onVoiceNoteClick ? (beat, note, event) => onVoiceNoteClick(voice.id, beat, note, event) : undefined}
      timeSignature={primary.timeSignature}
      literalDurations={primary.literalDurations}
      gridSlotCount={primary.gridSlotCount}
      compact={primary.compact}
      scale={primary.scale}
      color={primary.color}
      className="w-full min-w-0"
      previousNotationForCrossBar={voice.previousNotation}
      nextNotationForCrossBar={voice.nextNotation}
      incomingPhraseCount={voice.incomingPhraseCount}
    />, voice.id))}
  </div>;
}
