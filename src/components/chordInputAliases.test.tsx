import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bar } from '../types';
import ChordPassVariantsEditor from './ChordPassVariantsEditor';
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

  it('normalizes only the edited pass chord without changing the primary harmony or other passes', () => {
    const bar: Bar = {
      chords: ['C', '', 'G/B', ''],
      chordPassVariants: [
        {
          pass: 2,
          chords: ['D-7', '', 'G7', ''],
          chordSubdivisions: [{ beat: 0, offset: 0.5, chord: 'C(add9)' }]
        },
        { pass: 3, chords: ['Em7-5', '', '', ''] }
      ]
    };
    const onChange = vi.fn();
    render(<ChordPassVariantsEditor bar={bar} beats={4} language="zh" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '第2遍 第3拍和弦' }), {
      target: { value: 'Em7-5/Bb' }
    });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        pass: 2,
        chords: ['D-7', '', 'Em7b5/Bb', ''],
        chordSubdivisions: [{ beat: 0, offset: 0.5, chord: 'C(add9)' }]
      },
      { pass: 3, chords: ['Em7-5', '', '', ''] }
    ]);
    expect(bar.chords).toEqual(['C', '', 'G/B', '']);
    expect(bar.chordPassVariants?.[0].chords[2]).toBe('G7');
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
