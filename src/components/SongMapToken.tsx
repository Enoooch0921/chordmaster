import type { SongMapStep } from '../types';
import { songMapDisplayParts, songMapLabel } from '../lib/songMap';
import { getSectionColor } from '../utils/musicUtils';

export default function SongMapToken({ step, zh }: { step: SongMapStep; zh: boolean }) {
  const { name } = songMapLabel(step.label);
  const { code, cue } = songMapDisplayParts(step.label);
  const numbered = /^(Intro|V|Pc|C|Po|Ref|B|Tag|Turn|Inter|Is|Vp|Break|End|Outro)(\d+(?:[/&,、]\d+)*)$/.exec(code);
  const description = zh ? `${name}，共 ${step.repeats} 遍` : `${name}, ${step.repeats}×`;
  return <span className="chart-map-token"
    data-numbered={numbered ? true : undefined}
    data-repeated={step.repeats > 1 ? true : undefined}
    data-accent={getSectionColor(name).accent}
    title={description} aria-label={description} role="img">
    <span className="chart-map-token-label" data-map-fit-label aria-hidden="true">
      <span data-map-label-line>
        <span className="chart-map-token-code">{numbered?.[1] ?? code}</span>
        {numbered && <span className="chart-map-token-number">{numbered[2]}</span>}
        {cue && <span className="chart-map-token-cue">{' · '}{cue}</span>}
      </span>
      {step.repeats > 1 && <span className="chart-map-token-repeat">×{step.repeats}</span>}
    </span>
  </span>;
}
