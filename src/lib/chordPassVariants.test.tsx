import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Bar, Song } from '../types';
import ChordSheet from '../components/ChordSheet';
import ChordPassVariantsEditor from '../components/ChordPassVariantsEditor';
import { normalizeStoredSong } from './workspace';
import { getChordPassEvents, selectChordPass, normalizeChordPassVariants } from '../utils/chordPassVariants';
import { applyBarKeyChange, mergeSectionToPrevious, insertChordBeatBeforeSlot, isBarCompletelyEmpty, setChordAtBeatSlot, updateEditableBarFields } from './songEditing';
import { copyPreviewContent, pastePreviewContent, previewClipboardText } from './previewClipboard';
import { createPreviewEditSession, applyPreviewDraft, undoPreviewDraft, redoPreviewDraft } from './previewEditSession';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);
const sourceBar = (): Bar => ({ id: 'b', chords: ['C', '', 'C/E', ''], chordPassVariants: [{ pass: 2, chords: ['C/E', '', 'C7', ''] }] });
const song = (): Song => ({ title: '恩典之流', originalKey: 'C', currentKey: 'C', chordTimingVersion: 2, timeSignature: '4/4', sections: [{ id: 's', title: 'Verse', bars: [sourceBar(), { id: 'dest', chords: ['D'], keyChangeTo: 'D' }] }] });
const target = { sectionId: 's', barId: 'b', slotIndex: 0 };
const bar = (s: Song) => s.sections[0].bars[0];
const events = (b: Bar, pass: number) => getChordPassEvents(b, 4, pass).map(e => [e.beat + e.offset, e.chord]);
it('resolves the source’s first and second pass within one measure without inventing a repeat', () => {
 const b = sourceBar(); expect(events(b, 1)).toEqual([[0, 'C'], [2, 'C/E']]); expect(events(b, 2)).toEqual([[0, 'C/E'], [2, 'C7']]);
 expect(selectChordPass(b, 1)).toBe(b); expect(selectChordPass(b, 3)).toBe(b); expect(selectChordPass(b, 0)).toBe(b); expect(b.repeatStart).toBeUndefined(); expect(b.repeatEnd).toBeUndefined();
});
it('does not leak primary chord timing into a different pass and resolves fractional attacks', () => {
 const b = sourceBar(); b.chordMarks = { 0: { beatOffset: .5, color: 'rose' } }; b.chordSubdivisions = [{ beat: 1, offset: .5, chord: 'F' }];
 b.chordPassVariants![0].chordSubdivisions = [{ beat: 1, offset: .25, chord: 'G/B' }];
 expect(events(b, 1)).toEqual([[.5, 'C'], [1.5, 'F'], [2, 'C/E']]); expect(events(b, 2)).toEqual([[0, 'C/E'], [1.25, 'G/B'], [2, 'C7']]);
 expect(selectChordPass(b, 2).chordMarks).toBeUndefined();
});
it('round trips complete variants and preserves the original pass, lyrics and section count', () => {
 const s = song(); const normalized = normalizeStoredSong(JSON.parse(JSON.stringify(s)), 0); expect(bar(normalized).chordPassVariants).toEqual(bar(s).chordPassVariants); expect(normalized.sections).toHaveLength(1); expect(bar(normalized).chords).toEqual(bar(s).chords);
 expect(isBarCompletelyEmpty({ chords: [], chordPassVariants: bar(s).chordPassVariants })).toBe(false);
});
it('rejects invalid or duplicate pass numbers without shifting empty beat slots', () => {
 expect(normalizeChordPassVariants([{pass:1,chords:['X']},{pass:2,chords:['C/E','','C7','']},{pass:2,chords:['wrong']},{pass:3.5,chords:['C']},{pass:-1,chords:['C']},{pass:3,chords:[12]},{pass:4,chords:['F']}])).toEqual([{pass:2,chords:['C/E','','C7','']},{pass:4,chords:['F']}]);
});
it('transposes whole-bar and section keys including slash bass and additional attacks', () => {
 const s = song(); bar(s).chordPassVariants![0].chordSubdivisions = [{beat:1,offset:.5,chord:'Fm6'}];
 const merged = mergeSectionToPrevious({...s,sections:[{id:'d',title:'Intro',keyChangeTo:'D',bars:[{id:'db',chords:['D']}]},{...s.sections[0],keyChangeTo:'C'}]},'s');
 for (const changed of [bar(applyBarKeyChange(s,target,'D')), merged.song.sections[0].bars[1]]) {
  expect(events(changed,2)).toEqual([[0,'D/F#'],[1.5,'Gm6'],[2,'D7']]); expect(changed.chords).toEqual(['D','','D/F#','']);
 }
 expect(bar(s).chordPassVariants![0].chords[0]).toBe('C/E');
});
it('copies all pass harmonies to another key without copying navigation or changing first-pass source', () => {
 const s=song(), clip=copyPreviewContent(s,[target],'chords')!; const copied=pastePreviewContent(s,[{sectionId:'s',barId:'dest'}],clip).song.sections[0].bars[1];
 expect(events(copied,2)).toEqual([[0,'D/F#'],[2,'D7']]); expect(copied.chords).toEqual(['D','','D/F#','']); expect(previewClipboardText(clip)).toContain('Pass 2: 1: C/E · 3: C7'); expect(bar(s).chords).toEqual(['C','','C/E','']);
 const whole=pastePreviewContent(s,[{sectionId:'s',barId:'dest'}],copyPreviewContent(s,[target],'bars')!); expect(whole.song.sections[0].bars.some(b=>b.id!=='b'&&b.chordPassVariants?.length)).toBe(true);
});
it('retains Nashville chords across key changes and clears old alternatives when pasting an ordinary chord bar', () => {
 const s=song();bar(s).chordPassVariants![0].chords=['1/3','','17','']; expect(bar(applyBarKeyChange(s,target,'D')).chordPassVariants![0].chords).toEqual(['1/3','','17','']);
 const clip=copyPreviewContent(s,[{sectionId:'s',barId:'dest'}],'chords')!;expect(bar(pastePreviewContent(s,[target],clip).song).chordPassVariants).toBeUndefined();
});
it('keeps pass edits separate and preserves them in undo and redo', () => {
 const s=song(); expect(bar(setChordAtBeatSlot(s,target,'F')).chordPassVariants).toEqual(bar(s).chordPassVariants);
 const changed=updateEditableBarFields(s,target,{chordPassVariants:[{pass:2,chords:['F','','G','']}]});
 const session=createPreviewEditSession({song:s,target:{...target,kind:'bar',field:'chords',previewIdentity:'x',rawChordIndex:0,anchorKey:'x',anchorRect:{left:0,top:0,right:1,bottom:1,width:1,height:1}},inputMode:'letters'});
 const updated=applyPreviewDraft(session,changed);expect(bar(undoPreviewDraft(updated).draftSong).chordPassVariants).toEqual(bar(s).chordPassVariants);expect(bar(redoPreviewDraft(undoPreviewDraft(updated)).draftSong).chordPassVariants).toEqual(bar(changed).chordPassVariants);
});
it('moves each pass with a beat insertion, including fractional attacks', () => {
 const s=song();bar(s).chordPassVariants![0].chordSubdivisions=[{beat:1,offset:.5,chord:'F'}];expect(events(bar(insertChordBeatBeforeSlot(s,target)),2)).toEqual([[1,'C/E'],[2.5,'F'],[3,'C7']]);
});
it.each([1,2,3] as const)('renders alternative chords, onset positions and transposition beside notation in row layout %s', rows => {
 for(const numbers of [false,true]) {
  const s=song();s.barRowCount=rows;s.showNashvilleNumbers=numbers;bar(s).rhythm='q q q q';bar(s).riff='1 | 2 | 3 | 4';const {container}=render(<ChordSheet song={s} currentKey="D" language="zh"/>);
  const variant=container.querySelector('[data-chord-pass="2"]')!;expect(variant.textContent).toContain('第2遍');expect([...variant.querySelectorAll('[data-chord-pass-event-position]')].map(e=>[(e as HTMLElement).dataset.chordPassEventPosition,e.textContent])).toEqual([['1',numbers?'1/3':'D/F#'],['3',numbers?'17':'D7']]);expect(container.querySelector('[data-preview-bottom-lane]')).not.toBeNull();cleanup();
 }
});
it('edits and removes a numbered pass without mutating the original chord array', () => {
 const b=sourceBar(),onChange=vi.fn(); render(<ChordPassVariantsEditor bar={b} beats={4} language="zh" onChange={onChange}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'第2遍 第3拍和弦'}),{target:{value:'G7'}});expect(onChange.mock.calls.at(-1)![0][0].chords).toEqual(['C/E','','G7','']);expect(b.chords).toEqual(['C','','C/E','']);fireEvent.click(screen.getByRole('button',{name:'移除第2遍替代和弦'}));expect(onChange.mock.calls.at(-1)![0]).toBeUndefined();
});

it('uses the same capo conversion for the alternative and original chord lanes', () => {
 const s=song();s.capo=2;const {container}=render(<ChordSheet song={s} currentKey="D" language="zh"/>);expect([...container.querySelectorAll('[data-chord-pass="2"] [data-chord-pass-event-position]')].map(e=>e.textContent)).toEqual(['C/E','C7']);
});
