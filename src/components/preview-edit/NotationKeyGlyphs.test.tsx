import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getRestGlyph,
  getRhythmEventGlyph,
  type RhythmBase
} from '../../utils/rhythmUtils';
import {
  JianpuInputGlyph,
  RhythmStaffKeyGlyph
} from './NotationKeyGlyphs';

const bases: RhythmBase[] = ['w', 'h', 'q', 'e', 's'];

describe('RhythmStaffKeyGlyph', () => {
  it('renders every supported note duration as a large Bach glyph without staff lines', () => {
    const { container } = render(
      <div>
        {bases.map((base) => (
          <span key={base}>
            <RhythmStaffKeyGlyph base={base} />
          </span>
        ))}
      </div>
    );

    const keys = Array.from(container.querySelectorAll('[data-rhythm-staff-key-glyph]'));
    expect(keys).toHaveLength(5);

    keys.forEach((key, index) => {
      const base = bases[index];
      expect(key).toHaveAttribute('data-rhythm-base', base);
      expect(key).toHaveAttribute('data-rhythm-rest', 'false');
      expect(key).toHaveAttribute('data-rhythm-triplet', 'false');
      expect(key.querySelector('[data-rhythm-staff]')).not.toBeInTheDocument();
      expect(key.querySelector('[data-rhythm-staff-line]')).not.toBeInTheDocument();
      expect(key.querySelector('[data-rhythm-symbol]')).toHaveTextContent(
        getRhythmEventGlyph({
          base,
          isRest: false,
          dotted: false,
          isHidden: false
        })
      );
    });
  });

  it('renders rests and an optional compact triplet marker', () => {
    const { container } = render(
      <RhythmStaffKeyGlyph base="e" isRest triplet />
    );

    const key = container.querySelector('[data-rhythm-staff-key-glyph]');
    expect(key).toHaveAttribute('data-rhythm-rest', 'true');
    expect(key).toHaveAttribute('data-rhythm-triplet', 'true');
    expect(key?.querySelector('[data-rhythm-symbol]')).toHaveTextContent(getRestGlyph('e'));
    const tripletMark = key?.querySelector('[data-rhythm-triplet-mark]');
    expect(tripletMark).toHaveTextContent('3');
    expect(tripletMark).toHaveClass('top-1/2', '-translate-y-[21px]');
  });

  it('visually centers the whole-rest ink with a dedicated scalable correction', () => {
    const { container } = render(
      <RhythmStaffKeyGlyph base="w" isRest />
    );

    const symbol = container.querySelector('[data-rhythm-symbol]');
    expect(symbol).toHaveTextContent(getRestGlyph('w'));
    expect(symbol).toHaveStyle({
      transform: 'translate(-0.06em, 0.16em)'
    });
  });
});

describe('JianpuInputGlyph', () => {
  it('shows a large composed pitch with accidental, high-octave dots, duration lines and dot', () => {
    const { container } = render(
      <JianpuInputGlyph
        pitch="6"
        accidental="#"
        octave={2}
        duration="sixteenth"
        dotted
      />
    );

    const glyph = container.querySelector('[data-jianpu-input-glyph]');
    expect(glyph).toHaveClass('content-center');
    expect(glyph).toHaveAttribute('data-jianpu-duration', 'sixteenth');
    expect(glyph?.querySelector('[data-jianpu-pitch-symbol]')).toHaveTextContent('6');
    expect(glyph?.querySelector('[data-jianpu-accidental-mark]')).toHaveTextContent('♯');
    expect(glyph?.querySelectorAll('[data-jianpu-octave-dots="high"] [data-jianpu-octave-dot]')).toHaveLength(2);
    expect(glyph?.querySelectorAll('[data-jianpu-duration-line]')).toHaveLength(2);
    expect(glyph?.querySelector('[data-jianpu-dot]')).toBeInTheDocument();
  });

  it('uses low dots and no underline for a quarter note', () => {
    const { container } = render(
      <JianpuInputGlyph pitch="1" octave={-1} duration="quarter" />
    );

    const glyph = container.querySelector('[data-jianpu-input-glyph]');
    expect(glyph?.querySelectorAll('[data-jianpu-octave-dots="low"] [data-jianpu-octave-dot]')).toHaveLength(1);
    expect(glyph?.querySelectorAll('[data-jianpu-duration-line]')).toHaveLength(0);
    expect(glyph?.querySelector('[data-jianpu-accidental-mark]')).not.toBeInTheDocument();
    expect(glyph?.querySelector('[data-jianpu-dot]')).not.toBeInTheDocument();
  });
});
