import React, { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JianpuVoice, Song } from '../types';
import { duplicateBar, isBarCompletelyEmpty } from '../lib/songEditing';
import { normalizeSongBars } from '../lib/workspace';
import { normalizeJianpuVoices } from '../utils/jianpuVoices';
import ChordSheet from './ChordSheet';
import JianpuVoicesEditor from './JianpuVoicesEditor';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const voices: JianpuVoice[] = [{ id: 'bass', label: 'Bass', riff: "1, | 5, | 1, | 5," }];
const song: Song = {
  title: 'Pitched voices', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 's', title: 'Intro', bars: [{ id: 'b', chords: ['C'], riff: '1 | 3 | 5 | 3', riffLabel: 'Pno', riffVoices: voices }] }]
};

describe('independent jianpu voices', () => {
  it('keeps all lines through normalization, JSON round trips, and bar duplication', () => {
    const normalized = normalizeSongBars(JSON.parse(JSON.stringify(song)));
    expect(normalized.sections[0].bars[0].riffVoices).toEqual(voices);
    expect(duplicateBar(normalized, { sectionId: 's', barId: 'b' }).sections[0].bars[1].riffVoices).toEqual(voices);
    expect(isBarCompletelyEmpty({ chords: [], riffVoices: voices })).toBe(false);
  });

  it('normalizes malformed voices and duplicate ids without inventing notes', () => {
    const result = normalizeJianpuVoices([null, { id: 'bass', label: 'Bass', riff: '1,' }, { id: 'bass', riff: '' }, { id: 'invalid', riff: 5 }]);
    expect(result).toEqual([
      { id: 'bass', label: 'Bass', riff: '1,' },
      { id: 'bass-copy', label: '', riff: '' },
    ]);
    expect(normalizeJianpuVoices(result)).toEqual(result);
  });

  it.each([1, 2, 3] as const)('shows both pitched lines in a %s-row sheet', barRowCount => {
    const { container } = render(<ChordSheet song={{ ...song, barRowCount }} language="zh" currentKey="C" />);
    expect(container.querySelectorAll('[data-jianpu-voice="primary"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-jianpu-voice="bass"]')).toHaveLength(1);
    expect(container.querySelector('[data-jianpu-voice="bass"]')).toHaveTextContent('Bass');
    expect(Number(container.querySelector('[data-preview-layout-weight]')?.getAttribute('data-preview-layout-weight'))).toBeGreaterThan(1);
    cleanup();
  });

  it('shows the lower line without a blank primary line when the primary riff is empty', () => {
    const { container } = render(<ChordSheet song={{ ...song, sections: [{ ...song.sections[0], bars: [{ chords: [], riffVoices: voices }] }] }} language="zh" currentKey="C" />);
    expect(container.querySelectorAll('[data-jianpu-voice="bass"]')).toHaveLength(1);
    expect(container.querySelector('[data-jianpu-voice="primary"]')).toBeNull();
    cleanup();
  });

  it('preserves and displays an additional pitched line in a pickup', () => {
    const withPickup: Song = { ...song, pickup: {
      id: 'pickup', riff: "3'_ 4'_ | | |",
      riffVoices: [{ id: 'pickup-lower', label: '下聲部', riff: "1'_ 2'_ | | |" }],
    } };
    const normalized = normalizeSongBars(JSON.parse(JSON.stringify(withPickup)));
    expect(normalized.pickup?.riffVoices).toEqual(withPickup.pickup?.riffVoices);
    const { container } = render(<ChordSheet song={normalized} language="zh" currentKey="C" />);
    expect(container.querySelectorAll('[data-jianpu-voice="pickup-lower"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-jianpu-voice="bass"]')).toHaveLength(1);
    cleanup();
  });

  it('edits one extra line without changing the others', async () => {
    const user = userEvent.setup();
    let latest: JianpuVoice[] | undefined;
    function Harness() {
      const [value, setValue] = useState([...voices, { id: 'flute', label: 'Flute', riff: '5 | 0 | 5 | 0' }]);
      return <JianpuVoicesEditor voices={value} timeSignature="4/4" language="zh" onChange={next => { latest = next; setValue(next ?? []); }} />;
    }
    const { container } = render(<Harness />);
    await user.click(screen.getByText('其他簡譜聲部 (2)'));
    const bass = within(container.querySelector('[data-jianpu-voice-editor="bass"]') as HTMLElement);
    await user.clear(bass.getByLabelText('簡譜聲部記法'));
    await user.type(bass.getByLabelText('簡譜聲部記法'), '1, | 1, | 1, | 1,');
    expect(latest?.[0].riff).toBe('1, | 1, | 1, | 1,');
    expect(latest?.[1]).toEqual({ id: 'flute', label: 'Flute', riff: '5 | 0 | 5 | 0' });
    cleanup();
  });
});
