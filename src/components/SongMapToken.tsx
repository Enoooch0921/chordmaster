import type { SongMapStep } from '../types';
import { songMapLabel } from '../lib/songMap';
import { getSectionColor } from '../utils/musicUtils';
import { getSectionBadgeStyle } from '../utils/sectionBadgeStyle';

export default function SongMapToken({ step, zh }: { step: SongMapStep; zh: boolean }) {
  const { name, code } = songMapLabel(step.label);
  const numbered = /^(I|V|Pc|C|Po|R|B|T|Ta|It|Is|Vp|Bd|E|O)(\d+(?:[/&,、]\d+)*)$/.exec(code);
  const description = zh ? `${name}，共 ${step.repeats} 遍` : `${name}, ${step.repeats}×`;
  return <span className="chart-map-token"
    data-numbered={numbered ? true : undefined}
    data-wide={numbered && (numbered[2].length > 1 || numbered[1].length > 1) ? true : undefined}
    data-repeated={step.repeats > 1 ? true : undefined}
    title={description} aria-label={description} role="img" style={getSectionBadgeStyle(getSectionColor(name).accent)}>
    <span className="chart-map-token-label" data-map-fit-label aria-hidden="true">
      {numbered ? <>
        <span data-map-label-line className="chart-map-token-code">{numbered[1]}</span>
        <span data-map-label-line className="chart-map-token-number">{numbered[2]}</span>
      </> : <span data-map-label-line>{code}</span>}
    </span>
    {step.repeats > 1 && <sup aria-hidden="true">×{step.repeats}</sup>}
  </span>;
}
