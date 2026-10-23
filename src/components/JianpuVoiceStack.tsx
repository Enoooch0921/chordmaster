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
};

export default function JianpuVoiceStack({ voices, primaryLabel, showPrimary, ...primary }: Props) {
  if (!voices.length) return <Jianpu {...primary} />;
  const lane = (label: string, notation: React.ReactNode, id: string) => (
    <div key={id} data-jianpu-voice={id} className="flex w-full min-w-0 items-center gap-1">
      <span className="w-7 shrink-0 truncate text-[7px] font-semibold leading-none" title={label}>{label}</span>
      <div className="min-w-0 flex-1">{notation}</div>
    </div>
  );
  return <div data-jianpu-voice-stack className="flex w-full min-w-0 flex-col gap-1">
    {showPrimary && lane(primaryLabel, <Jianpu {...primary} />, 'primary')}
    {voices.map(voice => lane(voice.label, <Jianpu
      notation={voice.notation}
      timeSignature={primary.timeSignature}
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
