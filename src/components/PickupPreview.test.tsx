import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChordSheet from './ChordSheet';
import SongEditor from './SongEditor';
import type { Song } from '../types';
import { PICKUP_EDITOR_BAR_ID, PICKUP_EDITOR_SECTION_ID } from '../utils/pickupUtils';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
const song: Song = { title: 'Pickup test', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', barNumberMode: 'all',
  sections: [{ id: 's', title: 'Verse', bars: [{ id: 'b', chords: ['C'] }] }] };
const editorProps = { language: 'zh' as const, history: { past: [], future: [] }, onUndo: vi.fn(), onRedo: vi.fn() };

describe('pickup workflow', () => {
  it('adds a one-beat pickup without altering regular bars', () => {
    const onChange = vi.fn();
    render(<SongEditor {...editorProps} song={song} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '新增弱起拍（第 0 小節）' }));
    const next = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(next.pickup?.timeSignature).toBe('1/4');
    expect(next.sections).toEqual(song.sections);
  });

  it('resizes a pickup through the control and prevents removing notes by shortening', () => {
    const onChange = vi.fn();
    const source = { ...song, pickup: { id: 'p', timeSignature: '1/4', riff: '5_6_' } };
    const view = render(<SongEditor {...editorProps} song={source} onChange={onChange} />);
    expect(screen.getByRole('option', { name: '0.5 拍' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '弱起長度' }), { target: { value: '3/8' } });
    const next = onChange.mock.calls.at(-1)?.[0] as Song;
    expect(next.pickup).toMatchObject({ timeSignature: '3/8', riff: '5_ | 6_' });
    expect(next.sections).toEqual(source.sections);
    view.rerender(<SongEditor {...editorProps} song={next} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '移除弱起拍' }));
    expect(onChange.mock.calls.at(-1)?.[0].pickup).toBeUndefined();
  });

  it('enters an eighth note in a half-beat pickup and clears the final note', () => {
    let latest: Song = { ...song, pickup: { id: 'p', timeSignature: '1/8' } };
    function Harness() {
      const [value, setValue] = useState(latest);
      return <SongEditor {...editorProps} song={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '簡譜 editor for pickup bar' });
    fireEvent.click(input.parentElement!);
    fireEvent.keyDown(input, { key: '5' });
    expect(latest.pickup?.riff).toBe('5_');
    expect(latest.sections).toEqual(song.sections);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(latest.pickup?.riff ?? '').toBe('');
  });

  it.each([1, 2, 3] as const)('renders a compact pickup before bar 1 in a %s-row chart and routes editing to bar 0', barRowCount => {
    const onElementClick = vi.fn();
    const { container } = render(<ChordSheet song={{ ...song, barRowCount,
      pickup: { id: 'p', timeSignature: '1/8', riff: '5_', rhythm: 'e' } }} language="zh" currentKey="C" onElementClick={onElementClick} />);
    const pickup = screen.getByRole('group', { name: '第 0 小節・弱起拍' });
    expect(pickup).toHaveAttribute('data-pickup-duration-units', '2');
    expect(pickup).toHaveStyle({ top: '36px' });
    const firstBar = container.querySelector('[data-preview-clipboard-bar="b"]')!;
    const barGrid = firstBar.parentElement!;
    // The pickup belongs in the existing title gutter, leaving four equal bar columns.
    expect(barGrid.previousElementSibling).toContainElement(pickup);
    expect(barGrid.parentElement?.children).toHaveLength(2);
    expect(barGrid).toHaveClass('grid-cols-4');
    fireEvent.click(screen.getByRole('button', { name: '編輯弱起簡譜' }));
    expect(onElementClick.mock.calls.at(-1)?.slice(0, 3)).toEqual([0, -1, 'riff']);
  });

  it('shows the insertion arrow at the current subdivision and at the pickup end', () => {
    const source = { ...song, pickup: { timeSignature: '1/4', riff: '5_6_' } };
    const target = { previewIdentity: 'test', sectionId: PICKUP_EDITOR_SECTION_ID, barId: PICKUP_EDITOR_BAR_ID,
      notationMode: 'jianpu' as const, cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 2, noteIndex: null as number | null } };
    const { container, rerender } = render(<ChordSheet song={source} language="zh" currentKey="C" previewIdentity="test" activePreviewNotationTarget={target} onElementClick={vi.fn()} />);
    expect(container.querySelector('[data-preview-pickup] [data-preview-notation-cursor-caret]')).toHaveStyle({ left: '50%' });
    rerender(<ChordSheet song={source} language="zh" currentKey="C" previewIdentity="test" activePreviewNotationTarget={{ ...target, cursor: { ...target.cursor, unitIndex: 4 } }} onElementClick={vi.fn()} />);
    expect(container.querySelector('[data-preview-pickup] [data-preview-notation-cursor-caret]')).toHaveStyle({ left: '100%' });
    rerender(<ChordSheet song={source} language="zh" currentKey="C" previewIdentity="test" activePreviewNotationTarget={{ ...target, cursor: { ...target.cursor, noteIndex: 1 } }} onElementClick={vi.fn()} />);
    expect(container.querySelector('[data-preview-pickup] [data-preview-notation-cursor-caret]')).toBeNull();
  });
});
