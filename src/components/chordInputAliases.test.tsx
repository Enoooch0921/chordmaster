import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bar } from '../types';
import ChordSubdivisionsEditor from './ChordSubdivisionsEditor';
import UnmeteredChordsEditor from './UnmeteredChordsEditor';

afterEach(cleanup);

describe('manual chord quality aliases in additional editors', () => {
  it('normalizes an edited subdivision while preserving its timing and other source chords', () => {
    const bar: Bar = {
      chords: ['C', '', '', ''],
      chordSubdivisions: [
        { beat: 0, offset: 0.5, chord: 'G/B' },
        { beat: 2, offset: 0.25, chord: 'Em7-5' }
      ]
    };
    const onChange = vi.fn();
    render(<ChordSubdivisionsEditor bar={bar} beats={4} language="zh" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '追加和弦 1' }), {
      target: { value: 'em7-5/Bb' }
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { beat: 0, offset: 0.5, chord: 'em7b5/Bb' },
      { beat: 2, offset: 0.25, chord: 'Em7-5' }
    ]);
    expect(bar.chordSubdivisions?.[0].chord).toBe('G/B');
  });

  it.each([['2e', 0.25], ['2a', 0.75]] as const)('adds %s directly while keeping the existing offbeat', (position, offset) => {
    const original: Bar = { chords: ['C', 'G', '', ''], chordSubdivisions: [{ beat: 1, offset: 0.5, chord: 'Am' }] };
    const onChange = vi.fn();
    const field = (bar: Bar) => <ChordSubdivisionsEditor bar={bar} beats={4} selectedBeat={1} language="zh" onChange={onChange} />;
    const { rerender } = render(field(original));
    expect(screen.queryByRole('button', { name: position })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '選擇其他拍位' }));
    expect(screen.queryByRole('button', { name: '2&' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: position }));
    expect(screen.queryByRole('group', { name: '可新增的拍位' })).not.toBeInTheDocument();
    const entries = onChange.mock.lastCall![0];
    expect(entries).toEqual([...original.chordSubdivisions!, { beat: 1, offset, chord: 'C' }]);
    rerender(field({ ...original, chordSubdivisions: entries }));
    const input = screen.getByRole('textbox', { name: '追加和弦 2' }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
    fireEvent.change(input, { target: { value: 'F#m' } });
    expect(onChange.mock.lastCall![0][1]).toEqual({ beat: 1, offset, chord: 'F#m' });
  });

  it.each([false, true])('normalizes typed unmetered chords while preserving lines and input spacing (withinMeasure=%s)', withinMeasure => {
    const onChange = vi.fn();
    const props = { language: 'zh' as const, onChange, withinMeasure, keyUnspecified: true };
    const { rerender } = render(<UnmeteredChordsEditor {...props} lines={[[ 'Em7-5', 'E-7' ]]} />);
    const input = screen.getByRole('textbox', { name: '未定拍位和弦序列' });
    expect(input).toHaveValue('Em7-5 E-7');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: { value: 'em7-5/Bb  C(add9)\nb3m7-5/5 E-7  ' }
    });
    const expectedLines = [['em7b5/Bb', 'C(add9)'], ['b3m7b5/5', 'E-7']];
    expect(onChange).toHaveBeenLastCalledWith(expectedLines);
    rerender(<UnmeteredChordsEditor {...props} lines={expectedLines} />);
    expect(input).toHaveValue('em7b5/Bb  C(add9)\nb3m7b5/5 E-7  ');
  });
});
