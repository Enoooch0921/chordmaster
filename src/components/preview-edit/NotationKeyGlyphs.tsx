import type {
  JianpuAccidental,
  JianpuDuration,
  JianpuOctave
} from '../../utils/jianpuUtils';
import {
  getRhythmEventGlyph,
  type RhythmBase
} from '../../utils/rhythmUtils';
import { getBachGlyphAnchor } from '../../lib/bachRhythmMetrics';

export interface RhythmStaffKeyGlyphProps {
  base: RhythmBase;
  isRest?: boolean;
  triplet?: boolean;
  className?: string;
}

/**
 * A keyboard-sized rhythm preview using the same Bach glyphs as the score.
 * Only the notation symbol is shown so compact keys remain quiet and legible.
 */
export function RhythmStaffKeyGlyph({
  base,
  isRest = false,
  triplet = false,
  className = ''
}: RhythmStaffKeyGlyphProps) {
  const glyph = getRhythmEventGlyph({
    base,
    isRest,
    dotted: false,
    isHidden: false,
    isSlash: false
  });
  const anchor = getBachGlyphAnchor(base, isRest);

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-12 min-w-0 w-full select-none items-center justify-center overflow-visible text-current ${className}`}
      data-rhythm-staff-key-glyph
      data-rhythm-base={base}
      data-rhythm-rest={isRest ? 'true' : 'false'}
      data-rhythm-triplet={triplet ? 'true' : 'false'}
    >
      <span
        className="z-[1] whitespace-pre font-rhythm text-[40px] leading-none"
        data-rhythm-symbol
        style={{
          fontFamily: 'Bach, NotoMusic, serif',
          transform: `translate(${anchor.xEm}em, ${anchor.yEm}em)`
        }}
      >
        {glyph}
      </span>

      {triplet && (
        <span
          className="absolute left-[calc(50%+11px)] top-1/2 z-[2] -translate-y-[21px] text-[11px] font-black leading-none"
          data-rhythm-triplet-mark
        >
          3
        </span>
      )}
    </span>
  );
}

export interface JianpuInputGlyphProps {
  pitch: string;
  accidental?: JianpuAccidental;
  octave?: JianpuOctave;
	  duration?: JianpuDuration;
	  dotted?: boolean;
	  triplet?: boolean;
	  className?: string;
	}

const durationLineCount = (duration: JianpuDuration) => {
  if (duration === 'sixteenth') return 2;
  if (duration === 'eighth') return 1;
  return 0;
};

const OctaveDots = ({
  count,
  placement
}: {
  count: number;
  placement: 'high' | 'low';
}) => (
  <span
    className="flex h-[5px] items-center justify-center gap-[3px]"
    data-jianpu-octave-dots={placement}
  >
    {Array.from({ length: count }, (_, index) => (
      <span
        key={index}
        className="h-[4px] w-[4px] rounded-full bg-current"
        data-jianpu-octave-dot
      />
    ))}
  </span>
);

/**
 * A large, composed jianpu symbol for keyboard keys. It deliberately does not
 * depend on a jianpu font: pitch, accidental, octave dots and duration lines
 * keep their relative size and remain legible on phones and tablets.
 */
export function JianpuInputGlyph({
  pitch,
  accidental = '',
	  octave = 0,
	  duration = 'quarter',
	  dotted = false,
	  triplet = false,
	  className = ''
	}: JianpuInputGlyphProps) {
  const normalizedOctave = Math.trunc(octave);
  const octaveDotCount = Math.min(2, Math.abs(normalizedOctave));
  const underlineCount = durationLineCount(duration);
  const accidentalGlyph = accidental === '#' ? '♯' : accidental === 'b' ? '♭' : '';

  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-12 min-w-0 w-full select-none content-center grid-rows-[5px_31px_5px_5px] items-center justify-items-center overflow-visible text-current ${className}`}
      data-jianpu-input-glyph
      data-jianpu-pitch={pitch}
      data-jianpu-accidental={accidental || 'natural'}
      data-jianpu-octave={normalizedOctave}
	      data-jianpu-duration={duration}
	      data-jianpu-dotted={dotted ? 'true' : 'false'}
	      data-jianpu-triplet={triplet ? 'true' : 'false'}
	    >
      <OctaveDots
        count={normalizedOctave > 0 ? octaveDotCount : 0}
        placement="high"
      />

	      <span className="flex h-[31px] items-center justify-center leading-none" data-jianpu-pitch-row>
	        {triplet && (
	          <span
	            className="absolute left-[calc(50%+13px)] top-[5px] text-[11px] font-black leading-none"
	            data-jianpu-triplet-mark
	          >
	            3
	          </span>
	        )}
	        {accidentalGlyph && (
          <span
            className="mr-[2px] text-[19px] font-semibold leading-none"
            data-jianpu-accidental-mark
          >
            {accidentalGlyph}
          </span>
        )}
        <span className="text-[30px] font-black leading-none" data-jianpu-pitch-symbol>
          {pitch}
        </span>
        {dotted && (
          <span
            className="ml-[3px] mt-[13px] h-[5px] w-[5px] rounded-full bg-current"
            data-jianpu-dot
          />
        )}
      </span>

      <span className="flex h-[5px] flex-col items-center justify-center gap-[2px]" data-jianpu-duration-lines>
        {Array.from({ length: underlineCount }, (_, index) => (
          <span
            key={index}
            className="h-[1.5px] w-7 rounded-full bg-current"
            data-jianpu-duration-line
          />
        ))}
      </span>

      <OctaveDots
        count={normalizedOctave < 0 ? octaveDotCount : 0}
        placement="low"
      />
    </span>
  );
}
