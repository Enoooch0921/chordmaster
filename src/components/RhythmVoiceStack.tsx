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
};
export default function RhythmVoiceStack({ voices, primaryLabel, previousVoices, nextVoices, previousTimeSignature, ...primary }: Props) {
  if (!voices.length) return <RhythmNotation {...primary} />;
  const lane = (label: string, notation: React.ReactNode, id: string) => (
    <div key={id} data-rhythm-voice={id} className="flex w-full items-center gap-1" style={{ height: 18 }}>
      <span className="w-7 shrink-0 truncate text-[7px] font-semibold leading-none" title={label}>{label}</span>
      <div className="min-w-0 flex-1">{notation}</div>
    </div>
  );
  return <div data-rhythm-voice-stack className="flex w-full flex-col gap-1">
    {primary.notation.trim() && lane(primaryLabel, <RhythmNotation {...primary} />, 'primary')}
    {voices.map(voice => {
      const previous = previousVoices?.find(v => v.id === voice.id);
      return lane(voice.label, <RhythmNotation
      notation={voice.rhythm} timeSignature={primary.timeSignature} compact={primary.compact}
      color={primary.color} accentScale={primary.accentScale}
      tieFromPrevious={Boolean(previous?.rhythm && rhythmEndsWithTieToNext(previous.rhythm, previousTimeSignature || primary.timeSignature))}
      nextNotationForCrossBar={nextVoices?.find(v => v.id === voice.id)?.rhythm}
      nextTimeSignatureForCrossBar={primary.nextTimeSignatureForCrossBar}
      className="w-full"
    />, voice.id); })}
  </div>;
}
