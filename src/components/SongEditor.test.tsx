import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import type { JianpuPitchContext } from '../lib/jianpuEditing';
import SongEditor from './SongEditor';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn()
  });
});

const makeSong = (bar: Partial<Song['sections'][number]['bars'][number]>): Song => ({
  title: 'Shared command test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{
    id: 'section-1',
    title: 'Verse',
    bars: [{ id: 'bar-1', chords: ['C'], ...bar }]
  }]
});

const renderEditor = (song: Song, jianpuPitchContext?: JianpuPitchContext) => {
  const onChange = vi.fn();
  render(
    <SongEditor
      song={song}
      language="zh"
      history={{ past: [], future: [] }}
      onUndo={() => undefined}
      onRedo={() => undefined}
      onChange={onChange}
      jianpuPitchContext={jianpuPitchContext}
      activeBar={{ sIdx: 0, bIdx: 0 }}
      onActiveBarChange={() => undefined}
    />
  );
  return onChange;
};

describe('SongEditor shared notation commands', () => {
  it('routes regular-bar rhythm replacement through the semantic rhythm rules', () => {
    const onChange = renderEditor(makeSong({ rhythm: 'q.^~' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select rhythm note 1' }));
    fireEvent.click(screen.getByTitle('八分音符 (E)'));

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].rhythm).toBe('e.^~');
  });

  it('routes selected jianpu replacement through the semantic command and preserves duration', () => {
    const onChange = renderEditor(makeSong({ riff: '1_' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 1' }));
    const input = screen.getByRole('textbox', { name: '簡譜 editor for bar 1' });
    fireEvent.keyDown(input, { key: '2' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('2_');
  });

  it('maps a legacy jianpu insertion point to the shared semantic cursor', () => {
    const onChange = renderEditor(makeSong({ riff: 'ssss' }));

    const beatHitArea = screen.getByRole('button', { name: 'Select jianpu beat 1' });
    Object.defineProperty(beatHitArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40 })
    });
    fireEvent.click(beatHitArea, { clientX: 1 });
    const input = screen.getByRole('textbox', { name: '簡譜 editor for bar 1' });
    fireEvent.keyDown(input, { key: '1' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('1');
  });

  it('continues from a full beat to the next writable jianpu beat', () => {
    const onChange = renderEditor(makeSong({ riff: '1 | ssss' }));

    const beatHitArea = screen.getByRole('button', { name: 'Select jianpu beat 1' });
    Object.defineProperty(beatHitArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40 })
    });
    fireEvent.click(beatHitArea, { clientX: 99 });
    const input = screen.getByRole('textbox', { name: '簡譜 editor for bar 1' });
    fireEvent.keyDown(input, { key: '2' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('1 | 2');
  });

  it('skips an occupied note after leading placeholders when finding the next writable beat', () => {
    const onChange = renderEditor(makeSong({ riff: 'ss2_ | ssss' }));

    const beatHitArea = screen.getByRole('button', { name: 'Select jianpu beat 1' });
    Object.defineProperty(beatHitArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40 })
    });
    fireEvent.click(beatHitArea, { clientX: 99 });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for bar 1' }), { key: '3' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('ss2_ | 3=sss');
  });

  it('appends after leading placeholders when the remainder of the beat is empty', () => {
    const onChange = renderEditor(makeSong({ riff: 'ss | ssss' }));

    const beatHitArea = screen.getByRole('button', { name: 'Select jianpu beat 1' });
    Object.defineProperty(beatHitArea, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40 })
    });
    fireEvent.click(beatHitArea, { clientX: 99 });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for bar 1' }), { key: '2' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('ss2=s | ssss');
  });

  it('uses fixed-do display coordinates for selected-note modifiers', () => {
    const fixedDoSong = {
      ...makeSong({ riff: '#6,' }),
      originalKey: 'D' as const,
      currentKey: 'D' as const,
      jianpuInputAbsolute: true
    };
    const onChange = renderEditor(fixedDoSong);

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for bar 1' }), { key: '#' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('7,');
  });

  it('uses the effective setlist pitch context for fixed-do modifiers', () => {
    const fixedDoSong = {
      ...makeSong({ riff: '#6,' }),
      jianpuInputAbsolute: true
    };
    const onChange = renderEditor(fixedDoSong, {
      playKeyBySectionId: { 'section-1': 'D' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for bar 1' }), { key: '#' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toBe('7,');
  });

  it('keeps pickup pitch stable while applying fixed-do modifiers through the fallback path', () => {
    const fixedDoSong: Song = {
      ...makeSong({}),
      originalKey: 'D',
      currentKey: 'D',
      jianpuInputAbsolute: true,
      pickup: { id: 'pickup-1', riff: '#6,' }
    };
    const onChange = renderEditor(fixedDoSong);

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for pickup bar' }), { key: '#' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.pickup?.riff).toBe('7,');
  });

  it('does not leak a previous pickup accidental into a newly selected natural note', () => {
    const pickupSong: Song = {
      ...makeSong({}),
      pickup: { id: 'pickup-1', riff: '1_2_' }
    };
    const onChange = vi.fn();
    const renderSongEditor = (currentSong: Song) => (
      <SongEditor
        song={currentSong}
        language="zh"
        history={{ past: [], future: [] }}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onChange={onChange}
        activeBar={{ sIdx: 0, bIdx: 0 }}
        onActiveBarChange={() => undefined}
      />
    );
    const view = render(renderSongEditor(pickupSong));

    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 1 in beat 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for pickup bar' }), { key: '#' });
    const firstSong = onChange.mock.calls.at(-1)?.[0] as Song;
    view.rerender(renderSongEditor(firstSong));
    fireEvent.click(screen.getByRole('button', { name: 'Select jianpu note 2 in beat 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '簡譜 editor for pickup bar' }), { key: '3' });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.pickup?.riff).toBe('#1_3_');
  });

  it('adds section bars from the bar count field', () => {
    const onChange = renderEditor(makeSong({}));

    fireEvent.change(screen.getByLabelText('小節數'), { target: { value: '4' } });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars).toHaveLength(4);
    expect(nextSong.sections[0].bars[0].chords).toEqual(['C']);
    expect(nextSong.sections[0].bars.slice(1).every((bar) => bar.id && bar.chords.length === 0)).toBe(true);
  });

  it('preserves sharp spelling for an explicit transposed section key', () => {
    renderEditor({
      ...makeSong({}),
      originalKey: 'Eb',
      currentKey: 'F',
      sections: [{
        id: 'section-1',
        title: 'Verse',
        keyChangeTo: 'E',
        bars: [{ id: 'bar-1', chords: ['C'] }]
      }]
    });

    expect(screen.getAllByRole('button', { name: /F#/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Gb/ })).not.toBeInTheDocument();
  });

  it('shrinks section bar count without removing written bars', () => {
    const song: Song = {
      ...makeSong({}),
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [
          { id: 'bar-1', chords: ['C'] },
          { id: 'bar-2', chords: ['G'] },
          { id: 'bar-3', chords: [] }
        ]
      }]
    };
    const onChange = renderEditor(song);

    fireEvent.change(screen.getByLabelText('小節數'), { target: { value: '1' } });

    const nextSong = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars).toHaveLength(2);
    expect(nextSong.sections[0].bars.map((bar) => bar.chords)).toEqual([['C'], ['G']]);
  });
});
