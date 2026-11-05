import type { SongMapStep } from '../types';
import { songMapLabel } from '../lib/songMap';
import { getSectionColor } from '../utils/musicUtils';
import { getSectionBadgeStyle } from '../utils/sectionBadgeStyle';

export default function SongMapToken({ step, zh }: { step: SongMapStep; zh: boolean }) {
  const { name, code } = songMapLabel(step.label);
  const description = zh ? `${name}，共 ${step.repeats} 遍` : `${name}, ${step.repeats}×`;
  return <span className="chart-map-token" data-code-length={/^[A-Za-z]+\d+$/.test(code) ? code.length : undefined}
    title={description} aria-label={description} role="img" style={getSectionBadgeStyle(getSectionColor(name).accent)}>
    <span aria-hidden="true">{code}</span>
    {step.repeats > 1 && <sup aria-hidden="true">{step.repeats}</sup>}
  </span>;
}
