import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Song, RhythmVoice } from '../types';
import ChordSheet from './ChordSheet';
import RhythmVoicesEditor from './RhythmVoicesEditor';
import { normalizeSongBars } from '../lib/workspace';
import { duplicateBar, isBarCompletelyEmpty } from '../lib/songEditing';
import { applyRhythmEdit } from '../lib/rhythmEditing';
import { normalizeRhythmVoices } from '../utils/rhythmVoices';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const voices: RhythmVoice[] = [{ id: 'kick', label: 'Kick', rhythm: 'q' }];
const song: Song = { title: 'Independent voices', chordTimingVersion: 2, originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: 's', title: 'Chorus', bars: [{ id: 'b', chords: ['C'], rhythm: 'qr q qr q', rhythmLabel: 'Tom', rhythmVoices: voices }] }] };
describe('independent rhythm voices', () => {
 it('survives normalization, JSON round trips, primary edits and bar duplication', () => {
  const normalized = normalizeSongBars(JSON.parse(JSON.stringify(song)));
  expect(normalized.sections[0].bars[0].rhythmVoices).toEqual(voices);
  const edited = applyRhythmEdit(normalized, { sectionId: 's', barId: 'b' }, { cursorUnit: 4 }, { type: 'toggle-accent' }).song;
  expect(edited.sections[0].bars[0].rhythmVoices).toEqual(voices);
  expect(duplicateBar(edited, { sectionId: 's', barId: 'b' }).sections[0].bars[1].rhythmVoices).toEqual(voices);
  expect(isBarCompletelyEmpty({ chords: [], rhythmVoices: voices })).toBe(false);
 });
 it('validates external shape and makes duplicate ids stable without filling unknown beats', () => {
  const result = normalizeRhythmVoices([null, { id: 'kick', rhythm: 'q', label: 'Kick' }, { id: 'kick', rhythm: '' }, { rhythm: 4 }]);
  expect(result).toEqual([{ id: 'kick', rhythm: 'q', label: 'Kick' }, { id: 'kick-copy', rhythm: '', label: '' }]);
  expect(normalizeRhythmVoices(result)).toEqual(result);
 });
 it.each([1,2,3] as const)('shows simultaneous voices in %s-row sheets without adding Kick rests', barRowCount => {
  const { container } = render(<ChordSheet song={{ ...song, barRowCount }} language="zh" currentKey="C" />);
  expect(container.querySelectorAll('[data-rhythm-voice="primary"] [data-rhythm-glyph]')).toHaveLength(4);
  expect(container.querySelectorAll('[data-rhythm-voice="kick"] [data-rhythm-glyph]')).toHaveLength(1);
  expect(container.querySelector('[data-rhythm-voice="kick"]')).toHaveTextContent('Kick');
  expect(Number(container.querySelector('[data-preview-layout-weight]')?.getAttribute('data-preview-layout-weight'))).toBeGreaterThan(1);
  cleanup();
 });
 it('renders an additional voice even when primary rhythm and chords are empty', () => {
  const { container } = render(<ChordSheet song={{ ...song, sections: [{ ...song.sections[0], bars: [{ chords: [], rhythmVoices: voices }] }] }} language="zh" currentKey="C" />);
  expect(container.querySelectorAll('[data-rhythm-voice="kick"]')).toHaveLength(1);
  expect(container.querySelector('[data-rhythm-voice="primary"]')).toBeNull();cleanup();
 });
 it('edits notes and labels in one extra voice without changing another voice', async () => {
  const user=userEvent.setup(); let latest: RhythmVoice[] | undefined;
  function Harness() { const [value,setValue]=useState([...voices,{ id:'hihat',label:'Hi-hat',rhythm:'e e e e e e e e' }]);return <RhythmVoicesEditor voices={value} language="zh" timeSignature="4/4" onChange={v=>{latest=v;setValue(v??[]);}} />; }
  const {container}=render(<Harness/>);
  await user.click(screen.getByText('其他節奏聲部 (2)'));
  const kick=within(container.querySelector('[data-rhythm-voice-editor="kick"]') as HTMLElement);
  await user.click(kick.getByRole('button',{name:'叉形音頭'}));
  expect(latest?.[0].rhythm).toBe('qc');expect(latest?.[1]).toEqual({id:'hihat',label:'Hi-hat',rhythm:'e e e e e e e e'});
  await user.clear(kick.getByLabelText('聲部名稱'));await user.type(kick.getByLabelText('聲部名稱'),'Bass drum');
  expect(latest?.[0].label).toBe('Bass drum');expect(latest?.[0].rhythm).toBe('qc');cleanup();
 });
});
