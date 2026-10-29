import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NotationAlignedChordRow from './NotationAlignedChordRow';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('moves the subbeat label with its fitted chord center', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(160);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const naturalWidth = Number(this.firstElementChild?.getAttribute('data-natural-width')) || 160;
    const width = naturalWidth * (Number(this.dataset.fitScale) || 1);
    const left = Number.parseFloat(this.style.left) || 0;
    return { x: left, y: 0, left, right: left + width, top: 0, bottom: 24, width, height: 24, toJSON() {} };
  });
  const widths = [30, 12, 24, 42];
  const { container } = render(<NotationAlignedChordRow anchors={[.125, .5625, .6875, .875]} spans={[1,.5,.5,1]} labels={['','3','3&','']}>
    {widths.map((width, index) => <div key={index} data-natural-width={width}>Chord {index}</div>)}
  </NotationAlignedChordRow>);
  const label = [...container.querySelectorAll<HTMLElement>('[data-chord-beat-labels]')].find(node => node.textContent === '3&')!;
  const chord = container.querySelectorAll<HTMLElement>('[data-aligned-chord-content]')[2];
  const center = Number.parseFloat(chord.style.left) + widths[2] * Number(chord.dataset.fitScale) / 2;
  expect(Number.parseFloat(label.style.left)).toBeCloseTo(center, 4);
  expect(Math.abs(center - .6875 * 160)).toBeGreaterThan(.5);
});
