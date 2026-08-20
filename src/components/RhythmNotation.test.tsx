import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RhythmNotation from './RhythmNotation';

describe('RhythmNotation', () => {
  it('anchors compact preview ties below the lower notehead contour', () => {
    const { container } = render(
      <RhythmNotation notation="q~ q q q" timeSignature="4/4" compact />
    );

    const tiePath = container.querySelector('[data-rhythm-tie]');

    expect(tiePath).not.toBeNull();
    expect(tiePath?.getAttribute('d')).toMatch(/^M 12\.5 18\.96 C .* 37\.5 18\.96$/);
  });

  it('renders Bach glyphs inside the shared SVG coordinate system', () => {
    const { container } = render(
      <RhythmNotation notation="q q q q" timeSignature="4/4" compact />
    );

    const glyphs = container.querySelectorAll('[data-rhythm-glyph]');
    const heads = container.querySelectorAll('[data-rhythm-notehead]');

    expect(glyphs).toHaveLength(4);
    expect(heads).toHaveLength(4);
    expect(container.querySelector('[data-rhythm-geometry-svg]')).not.toBeNull();
    expect(heads[0].getAttribute('data-rhythm-head-x')).toBe('12.5');
    expect(container.querySelectorAll('[data-rhythm-formal-symbol]')).toHaveLength(4);
  });

  it('renders slash placeholders as visible rhythm occupancy marks', () => {
    const { container } = render(
      <RhythmNotation notation="/ q" timeSignature="4/4" compact />
    );

    const slash = container.querySelector('[data-rhythm-slash="true"]');

    expect(slash).not.toBeNull();
    expect(slash?.querySelector('path')?.getAttribute('d')).toBe('M3 13L13 3');
    expect(slash).not.toHaveAttribute('data-rhythm-notehead');
  });

  it('does not shrink compact preview overlays away from glyph anchors', () => {
    const { container } = render(
      <RhythmNotation notation="e e e e" timeSignature="4/4" compact />
    );

    const overlay = container.querySelector<HTMLElement>('[data-rhythm-overlay]');

    expect(overlay?.style.transform).toBe('scale(1)');
  });

  it('keeps compact triplet numbers above the rhythm bracket', () => {
    const { container } = render(
      <RhythmNotation notation="q3 q3 q3" timeSignature="4/4" compact />
    );

    const tripletNumber = container.querySelector('[data-rhythm-triplet-number][data-rhythm-triplet-base="q"]');
    const tripletBracket = container.querySelector('[data-rhythm-triplet-bracket]');
    const symbols = container.querySelectorAll('[data-rhythm-formal-symbol]');
    const bracketPath = tripletBracket?.getAttribute('d') ?? '';
    const bracketY = Number(bracketPath.match(/ L [^ ]+ ([^ ]+) L/)?.[1]);
    const numberY = Number(tripletNumber?.getAttribute('y'));

    expect(tripletNumber).not.toBeNull();
    expect(numberY).toBeLessThan(bracketY);
    expect(symbols).toHaveLength(3);
  });

  it('connects compact eighth-note stems and keeps the triplet number above the beam', () => {
    const { container } = render(
      <RhythmNotation notation="e3 e3 e3" timeSignature="4/4" compact />
    );

    const tripletNumber = container.querySelector('[data-rhythm-triplet-number][data-rhythm-triplet-base="e"]');
    const primaryBeam = container.querySelector('[data-rhythm-primary-beam]');
    const beamedSymbols = container.querySelectorAll('[data-rhythm-beamed-symbol]');
    const numberY = Number(tripletNumber?.getAttribute('y'));
    const beamY = Number(primaryBeam?.getAttribute('y1'));

    expect(tripletNumber).not.toBeNull();
    expect(primaryBeam).not.toBeNull();
    expect(beamY).toBeGreaterThan(0);
    expect(numberY).toBeLessThan(beamY);
    expect(beamedSymbols).toHaveLength(3);
    expect(container.querySelector('[data-rhythm-triplet-bracket]')).toBeNull();
  });

  it('keeps compact sixteenth-note beams above the stem tops', () => {
    const { container } = render(
      <RhythmNotation notation="s s s s q q q" timeSignature="4/4" compact />
    );

    const primaryBeam = container.querySelector('[data-rhythm-primary-beam]');
    const secondaryBeam = container.querySelector('[data-rhythm-secondary-beam]');
    const beamedSymbols = container.querySelectorAll('[data-rhythm-beamed-symbol]');
    const beamY = Number(primaryBeam?.getAttribute('y1'));

    expect(primaryBeam).not.toBeNull();
    expect(secondaryBeam).not.toBeNull();
    expect(beamedSymbols.length).toBeGreaterThan(1);
    expect(Number(secondaryBeam?.getAttribute('y1'))).toBeGreaterThan(beamY);
  });

  it('places compact preview accents above the notehead instead of across the stem', () => {
    const { container } = render(
      <RhythmNotation notation="q^ q q q" timeSignature="4/4" compact />
    );

    const accent = container.querySelector('[data-rhythm-accent]');
    const head = container.querySelector('[data-rhythm-notehead]');
    const pathNumbers = (accent?.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const accentCenterX = (pathNumbers[0] + pathNumbers[2]) / 2;
    const accentBottomY = pathNumbers[5];

    expect(accentCenterX).toBeCloseTo(Number(head?.getAttribute('data-rhythm-head-x')), 5);
    expect(accentBottomY).toBeLessThan(Number(head?.getAttribute('y')));
  });

  it('keeps augmentation dots on compact rest glyphs', () => {
    const { container } = render(
      <RhythmNotation notation="qr. q q" timeSignature="4/4" compact />
    );

    expect(container.querySelector('[data-rhythm-glyph][data-rhythm-base="q"] [data-rhythm-dot]')).not.toBeNull();
  });

  it('uses the original Bach symbol for standalone eighth notes', () => {
    const { container } = render(
      <RhythmNotation notation="e q q q" timeSignature="4/4" compact />
    );

    expect(container.querySelector('[data-rhythm-glyph][data-rhythm-base="e"] [data-rhythm-formal-symbol]')).not.toBeNull();
    expect(container.querySelector('[data-rhythm-flag]')).toBeNull();
  });
});
