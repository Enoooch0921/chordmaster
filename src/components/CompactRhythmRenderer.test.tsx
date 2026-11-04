import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CompactRhythmRenderer from './CompactRhythmRenderer';
import RhythmNotation from './RhythmNotation';
import { buildCompactRhythmGeometry } from '../lib/rhythmGeometry';
import { parseRhythmNotation } from '../utils/rhythmUtils';

const installBounds = (fontReady = () => true) => {
  const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: function(this: SVGElement) {
    const font = Number(this.getAttribute('font-size'));
    if (this.hasAttribute('data-rhythm-tuplet-number-probe') || this.hasAttribute('data-rhythm-triplet-number')) {
      return { x:Number(this.getAttribute('x'))+.15*font, y:Number(this.getAttribute('y'))-.3*font, width:.5*font, height:.8*font };
    }
    const probe = this.hasAttribute('data-rhythm-metric-probe');
    return { x: Number(this.getAttribute('x')) - .147 * font, y: probe ? -15.015625 : 4.8125,
      width: .294 * font, height: probe && !fontReady() ? 0 : 20.015625 };
  } });
  return () => {
    if (original) Object.defineProperty(SVGElement.prototype, 'getBBox', original);
    else Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  };
};

it('keeps ordinary Bach glyphs unchanged when a crosshead is added to their measure', () => {
  const restore = installBounds();
  let dispose: (() => void) | undefined;
  try {
    const { container, rerender, unmount } = render(<RhythmNotation notation="e e q q q" timeSignature="4/4" compact scale={1.34} />);
    dispose = unmount;
    const solid = () => container.querySelector('[data-rhythm-formal-symbol][data-rhythm-event-index="1"]')!;
    const profile = (element: Element) => ['font-family', 'font-size', 'x', 'y'].map(name => element.getAttribute(name));
    const before = { text: solid().textContent, profile: profile(solid()) };
    rerender(<RhythmNotation notation="ecu e q q q" timeSignature="4/4" compact scale={1.34} />);
    expect({ text: solid().textContent, profile: profile(solid()) }).toEqual(before);
    expect(container.querySelector('ellipse[data-rhythm-notehead]')).toBeNull();
    const crossStem = container.querySelector('[data-rhythm-vector-note] [data-rhythm-stem]')!;
    expect(Number(crossStem.getAttribute('stroke-width'))).toBeCloseTo(.013 * 17 * 1.34);
    const solidHeadY = Number(solid().getAttribute('data-rhythm-head-y'));
    const crossHeadY = Number(container.querySelector('[data-rhythm-cross-head]')!.getAttribute('data-rhythm-head-y'));
    expect(solidHeadY - crossHeadY).toBeCloseTo(5 * 1.34);
  } finally { dispose?.(); restore(); }
});

it.each(['h3 h3 h3', 'q3 q3 q3', 'e3 e3 e3', 'e3 e3r e3', 'e3r e3 e3', 'e3 e3 e3r'])('centers the actual tuplet numeral and leaves clear bracket arms for %s', notation => {
  const restore = installBounds();
  let dispose: (()=>void) | undefined;
  try {
    const {container,unmount} = render(<RhythmNotation notation={notation} timeSignature="4/4" compact scale={1.34}/>);
    dispose = unmount;
    const number = container.querySelector<SVGTextElement>('[data-rhythm-triplet-number]')!;
    const box = number.getBBox();
    const bracket = container.querySelector('[data-rhythm-triplet-bracket]');
    if (bracket) {
      const p = bracket.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
      expect(box.x+box.width/2).toBeCloseTo((p[0]+p[8])/2);
      expect(box.y+box.height/2).toBeCloseTo(p[3]);
      expect(box.x-p[4]).toBeGreaterThan(.5);
      expect(p[6]-box.x-box.width).toBeGreaterThan(.5);
      expect(p[1]-p[3]).toBeGreaterThan(0);
    } else {
      const beam = container.querySelector('[data-rhythm-primary-beam]')!;
      expect(box.x+box.width/2).toBeCloseTo((Number(beam.getAttribute('x1'))+Number(beam.getAttribute('x2')))/2);
      expect(box.y+box.height).toBeLessThan(Number(beam.getAttribute('y1'))-Number(beam.getAttribute('stroke-width'))/2);
    }
  } finally { dispose?.(); restore(); }
});

it('centers visible numeral ink instead of its taller SVG line box', () => {
  const restore = installBounds();
  vi.stubGlobal('CanvasRenderingContext2D', function() {});
  const context = { measureText:()=>({ actualBoundingBoxLeft:2.8, actualBoundingBoxRight:2.2,
    actualBoundingBoxAscent:6, actualBoundingBoxDescent:1 }) };
  const canvas = vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let dispose: (()=>void)|undefined;
  try {
    const {container,unmount}=render(<RhythmNotation notation="q3 q3 q3" timeSignature="4/4" compact scale={1.34}/>);
    dispose=unmount;
    const number=container.querySelector('[data-rhythm-triplet-number]')!;
    const bracket=container.querySelector('[data-rhythm-triplet-bracket]')!;
    const p=bracket.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    expect(number).toHaveAttribute('data-rhythm-number-ink','true');
    expect(Number(number.getAttribute('y'))-2.5).toBeCloseTo(p[3]);
    expect(Number(number.getAttribute('x'))-.3).toBeCloseTo((p[0]+p[8])/2);
  } finally {dispose?.();canvas.mockRestore();vi.unstubAllGlobals();restore();}
});

it('keeps horizontal bracket arms longer than the hooks on a narrow large-symbol triplet', () => {
  const restore=installBounds();
  const width=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(128);
  let dispose:(()=>void)|undefined;
  try {
    const {container,unmount}=render(<RhythmNotation notation="s3 s3 s3 e q q q" timeSignature="4/4" compact scale={1.8} beamGroups={false}/>);
    dispose=unmount;
    const bracket=container.querySelector('[data-rhythm-triplet-bracket]')!;
    const p=bracket.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    const drop=p[1]-p[3];
    expect(p[4]-p[0]).toBeGreaterThan(drop*1.4);
    expect(p[8]-p[6]).toBeGreaterThan(drop*1.4);
  } finally {dispose?.();width.mockRestore();restore();}
});

it('remeasures after the music font loads and removes the loading listener on unmount', async () => {
  let fontReady = false;
  const restore = installBounds(() => fontReady);
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  const remove = vi.spyOn(fonts, 'removeEventListener');
  const parsed = parseRhythmNotation('e. s q q q', '4/4');
  const geometry = buildCompactRhythmGeometry(parsed.events, {
    width: 160, height: 16 * 1.34, scale: 1.34, beatUnits: parsed.beatUnits, barUnits: parsed.barUnits
  });
  const anchors = vi.fn();
  let dispose: (() => void) | undefined;
  try {
    const { container, unmount } = render(<CompactRhythmRenderer geometry={geometry} color="#111827" scale={1.34} beamStrokeScale={1.14} onGlyphAnchorsChange={anchors} />);
    dispose = unmount;
    const beam = container.querySelector('[data-rhythm-primary-beam]')!;
    expect(Number(beam.getAttribute('y1'))).toBeCloseTo(4.8125);
    await act(async () => {
      fontReady = true;
      fonts.dispatchEvent(new Event('loadingdone'));
      await fonts.ready;
    });
    expect(Number(beam.getAttribute('y1'))).toBeCloseTo(4.8125 + 15.015625 - .802 * 17 * 1.34);
    unmount(); dispose = undefined;
    expect(remove).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    const count = anchors.mock.calls.length;
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(anchors).toHaveBeenCalledTimes(count);
  } finally {
    dispose?.(); restore(); remove.mockRestore();
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});
