import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RhythmNotation from './RhythmNotation';

describe('RhythmNotation', () => {
  it('can clear and restore crosshead notation without changing hook order or losing layout width', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240);
    const { container, rerender } = render(<RhythmNotation notation="" timeSignature="4/4" compact />);
    for (const notation of ['qc', '', 'ecu e']) {
      rerender(<RhythmNotation notation={notation} timeSignature="4/4" compact />);
      if (notation) await waitFor(() => expect(container.querySelector('[data-rhythm-geometry-svg]')).toHaveAttribute('viewBox', '0 0 240 16'));
      else expect(container.textContent).toBe('No Rhythm');
    }
  });

  it.each([true, false])('renders the Joy cross/solid pattern with four connected pairs (compact=%s)', (compact) => {
    const { container } = render(<RhythmNotation notation="ecu e ecu e ecu e ecu e" timeSignature="4/4" compact={compact} />);
    const crosses = container.querySelectorAll('[data-rhythm-cross-head="upper"]');
    const solids = container.querySelectorAll('text[data-rhythm-notehead]');
    expect(crosses).toHaveLength(4);
    expect(solids).toHaveLength(4);
    expect(container.querySelectorAll('[data-rhythm-primary-beam]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-rhythm-stem]')).toHaveLength(4);
    expect(container.querySelectorAll('ellipse[data-rhythm-notehead]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-rhythm-flag]')).toHaveLength(0);
    crosses.forEach((cross, index) => expect(Number(cross.getAttribute('data-rhythm-head-y'))).toBeLessThan(Number(solids[index].getAttribute('data-rhythm-head-y'))));
  });

  it('renders a cross quarter, rests and sixteenths without adding hidden-gap glyphs', () => {
    const { container, rerender } = render(<RhythmNotation notation="qc qr er s s s s s s" timeSignature="4/4" compact />);
    expect(container.querySelectorAll('[data-rhythm-cross-head]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-rhythm-glyph]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-rhythm-notehead]')).toHaveLength(7);
    rerender(<RhythmNotation notation="qc ex sc" timeSignature="4/4" compact />);
    expect(container.querySelectorAll('[data-rhythm-glyph]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-rhythm-flag]')).toHaveLength(2);
  });

  it('anchors compact preview ties below the lower notehead contour', () => {
    const { container } = render(
      <RhythmNotation notation="q~ q q q" timeSignature="4/4" compact />
    );

    const tiePath = container.querySelector('[data-rhythm-tie]');

    expect(tiePath).not.toBeNull();
    expect(tiePath).toHaveAttribute('data-rhythm-tie-start-y', '18.96');
    expect(tiePath).toHaveAttribute('data-rhythm-tie-end-y', '18.96');
    expect(tiePath).toHaveAttribute('stroke', 'none');
    expect(tiePath?.getAttribute('d')).toMatch(/^M 12\.5 18\.96 C .* Z$/);
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

  it('uses untransformed layout width when the preview sheet is visually scaled', async () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    const boundingRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 154,
      bottom: 16,
      left: 0,
      width: 154,
      height: 16,
      toJSON: () => ({})
    });

    try {
      const { container } = render(
        <RhythmNotation notation="q q q q" timeSignature="4/4" compact />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-rhythm-geometry-svg]')?.getAttribute('viewBox')).toBe('0 0 200 16');
      });
    } finally {
      clientWidth.mockRestore();
      offsetWidth.mockRestore();
      boundingRect.mockRestore();
    }
  });

  it('centers compact triplet numbers in a gap between two bracket arms', () => {
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
    expect(numberY).toBeCloseTo(bracketY);
    expect(bracketPath.match(/M /g)).toHaveLength(2);
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

  it.each(['w^', 'h^ h', 'ec^ e q q q', 'e3 e3^ e3 q q q'])('keeps a visible wide accent on %s', notation => {
    const { container } = render(<RhythmNotation notation={notation} timeSignature="4/4" compact />);
    const accent = container.querySelector('[data-rhythm-accent]');
    expect(accent).not.toBeNull();
    const n = accent!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(n[2] - n[0]).toBeGreaterThan(n[5] - n[1]);
    expect(accent).not.toHaveAttribute('stroke');
  });

  it.each([1, 1.8])('keeps the triplet number outside the accented middle note at scale %s', scale => {
    const { container } = render(<RhythmNotation notation="e3 e3^ e3 q q q" timeSignature="4/4" compact scale={scale} />);
    const accentTop = Number(container.querySelector('[data-rhythm-accent]')!.getAttribute('d')!.split(' ')[2]);
    const numberY = Number(container.querySelector('[data-rhythm-triplet-number]')!.getAttribute('y'));
    expect(accentTop - numberY).toBeGreaterThanOrEqual(5 * scale);
    expect(container.querySelector('[data-rhythm-primary-beam]')).not.toHaveAttribute('vector-effect');
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
  it('frames the active beat and keeps the subdivision arrow inside it across note lengths', () => {
    const onInsertSelect = vi.fn();
    const props = { notation: 'h e s s q', timeSignature: '4/4', compact: true, showInsertCursor: true, onInsertSelect };
    const { container, rerender, getByRole } = render(<RhythmNotation {...props} selectedInsertIndex={0} />);
    const caret = () => container.querySelector<HTMLElement>('[data-rhythm-cursor-unit]')!;
    expect(caret().style.left).toBe('12.5%');
    expect(container.querySelector('[data-preview-notation-cursor-beat]')).toHaveStyle({ left: '0%', width: '25%' });
    expect(caret()).toHaveClass('notation-note-pointer');
    expect(container.querySelector('[data-rhythm-selected-note-highlight]')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Select rhythm note 3' }));
    expect(onInsertSelect).toHaveBeenCalledWith(10, expect.anything());
    rerender(<RhythmNotation {...props} selectedInsertIndex={10} />);
    expect(caret().style.left).toBe('65.625%');
    expect(container.querySelector('[data-preview-notation-cursor-beat]')).toHaveStyle({ left: '50%', width: '25%' });
    expect(caret()).toHaveClass('notation-note-pointer');
    expect(caret()).not.toHaveClass('notation-insert-caret');
    expect(container.querySelector('[data-rhythm-geometry-svg]')).toHaveClass('z-[2]');
    expect(getByRole('button', { name: 'Select rhythm note 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: 'Select rhythm note 1' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<RhythmNotation {...props} selectedInsertIndex={16} />);
    expect(container.querySelector('[data-rhythm-selected-note-highlight]')).toBeNull();
    expect(caret().style.left).toBe('100%');
    expect(container.querySelector('[data-preview-notation-cursor-beat]')).toHaveStyle({ left: '75%', width: '25%' });
    expect(caret()).toHaveClass('notation-note-pointer');
  });

});

it('shows a triplet marker even when its group is incomplete, without joining notes across beats', () => {
  const { container, rerender } = render(<RhythmNotation notation="e3r e q e e q" timeSignature="4/4" compact />);
  expect(container.querySelector('[data-rhythm-incomplete-triplet]')).toHaveTextContent('3');
  expect(container.querySelectorAll('[data-rhythm-primary-beam]')).toHaveLength(0);
  rerender(<RhythmNotation notation="er e q e e q" timeSignature="4/4" compact />);
  expect(container.querySelector('[data-rhythm-incomplete-triplet]')).toBeNull();
  expect(container.querySelectorAll('[data-rhythm-primary-beam]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-rhythm-beamed-symbol]')).toHaveLength(2);
});

it('restores the selected rhythm event frame when returning from another input mode', () => {
  const { getByRole, rerender } = render(<RhythmNotation notation="er e q e e q" timeSignature="4/4" compact selectedInsertIndex={8} showInsertCursor onInsertSelect={() => {}} />);
  expect(getByRole('button', { name: 'Select rhythm note 4' })).toHaveStyle({ backgroundColor: 'rgba(99, 102, 241, 0.18)' });
  rerender(<RhythmNotation notation="er e q e e q" timeSignature="4/4" compact selectedInsertIndex={null} showInsertCursor={false} onInsertSelect={() => {}} />);
  expect(getByRole('button', { name: 'Select rhythm note 4' })).toHaveAttribute('aria-pressed', 'false');
  rerender(<RhythmNotation notation="er e q e e q" timeSignature="4/4" compact selectedInsertIndex={8} showInsertCursor onInsertSelect={() => {}} />);
  expect(getByRole('button', { name: 'Select rhythm note 4' })).toHaveAttribute('aria-pressed', 'true');
  expect(getByRole('button', { name: 'Select rhythm note 4' })).toHaveStyle({ boxShadow: 'inset 0 0 0 1px rgba(99, 102, 241, 0.22)' });
});

it.each(['q q e. s er e','er e q e. s er e'])('anchors %s beams to visible Bach stems rather than the SVG font line box', notation => {
  const original=Object.getOwnPropertyDescriptor(SVGElement.prototype,'getBBox');
  Object.defineProperty(SVGElement.prototype,'getBBox',{configurable:true,value:function(this:SVGElement){
    return {x:0,y:this.hasAttribute('data-rhythm-metric-probe')?-15.015625:4.8125,width:6.71875,height:20.015625};
  }});
  try {
    const {container}=render(<RhythmNotation notation={notation} timeSignature="4/4" compact scale={1.34}/>);
    const beam=container.querySelector('[data-rhythm-primary-beam]')!;
    const top=4.8125-(-15.015625)-.802*(17*1.34);
    expect(Number(beam.getAttribute('y1'))).toBeCloseTo(top,5);
    expect(Number(beam.getAttribute('y2'))).toBeCloseTo(top,5);
    expect(container.querySelectorAll('[data-rhythm-beamed-symbol]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-rhythm-secondary-beam]')).toHaveLength(1);
  } finally {
    if(original)Object.defineProperty(SVGElement.prototype,'getBBox',original);
    else Reflect.deleteProperty(SVGElement.prototype,'getBBox');
  }
});

it.each([true, false])('honors disabled beams and keeps the triplet grouping visible (compact=%s)', compact => {
  const { container } = render(<RhythmNotation notation="e3 e3 e3 q q q" timeSignature="4/4" compact={compact} beamGroups={false} />);
  expect(container.querySelector('[data-rhythm-primary-beam]')).toBeNull();
  expect(container.querySelector('[data-rhythm-secondary-beam]')).toBeNull();
  expect(container.querySelectorAll('[data-rhythm-rendered-beamed="true"]')).toHaveLength(0);
  expect(container.querySelector('[data-rhythm-triplet-number]')).toHaveTextContent('3');
  expect(container.querySelector('[data-rhythm-triplet-bracket]')).not.toBeNull();
});

it.each(['e e q q q', 'e. s q q q', 's e. q q q', 's s s s q q q', 'e3 e3 e3 q q q'])(
  'covers the outer stem contours at both ends of %s', notation => {
    const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
    Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: function(this: SVGElement) {
      const font = Number(this.getAttribute('font-size'));
      return { x: Number(this.getAttribute('x')) - .147 * font,
        y: this.hasAttribute('data-rhythm-metric-probe') ? -15.015625 : 4.8125,
        width: .294 * font, height: 20.015625 };
    } });
    try {
      const { container } = render(<RhythmNotation notation={notation} timeSignature="4/4" compact scale={1.34} />);
      const font = 17 * 1.34;
      const beam = container.querySelector('[data-rhythm-primary-beam]')!;
      const stems = [...container.querySelectorAll('[data-rhythm-beamed-symbol]')];
      const left = Number(stems[0].getAttribute('x')) + (.239 - .147) * font;
      const right = Number(stems.at(-1)!.getAttribute('x')) + (.252 - .147) * font;
      expect(Number(beam.getAttribute('x1'))).toBeCloseTo(left, 5);
      expect(Number(beam.getAttribute('x2'))).toBeCloseTo(right, 5);
      expect(Number(beam.getAttribute('y1'))).toBeCloseTo(4.8125 + 15.015625 - .802 * font, 5);
      for (const secondary of container.querySelectorAll('[data-rhythm-secondary-beam]')) {
        expect(Number(secondary.getAttribute('x1'))).toBeGreaterThanOrEqual(left - .0001);
        expect(Number(secondary.getAttribute('x2'))).toBeLessThanOrEqual(right + .0001);
      }
    } finally {
      if (original) Object.defineProperty(SVGElement.prototype, 'getBBox', original);
      else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
    }
  }
);

it.each(['e. s q q q', 'q. e q q'])('aligns the augmentation dot of %s with the actual notehead', notation => {
  const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: function(this: SVGElement) {
    return { x: 0, y: this.hasAttribute('data-rhythm-metric-probe') ? -15.015625 : 4.8125,
      width: 6.71875, height: 20.015625 };
  } });
  try {
    const { container } = render(<RhythmNotation notation={notation} timeSignature="4/4" compact scale={1.34} />);
    const baseline = 4.8125 + 15.015625;
    expect(Number(container.querySelector('[data-rhythm-dot]')!.getAttribute('cy')))
      .toBeCloseTo(baseline - .197 * (17 * 1.34) / 2, 5);
  } finally {
    if (original) Object.defineProperty(SVGElement.prototype, 'getBBox', original);
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  }
});

it('keeps disabled crosshead beams as individual flagged notes', () => {
  const { container } = render(<RhythmNotation notation="ecu e q q q" timeSignature="4/4" compact beamGroups={false} />);
  expect(container.querySelector('[data-rhythm-primary-beam]')).toBeNull();
  expect(container.querySelectorAll('[data-rhythm-flag]')).toHaveLength(1);
  expect(container.querySelector('[data-rhythm-formal-symbol][data-rhythm-display-base="e"]')).not.toBeNull();
});
