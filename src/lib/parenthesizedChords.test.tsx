import React from 'react';
import {beforeAll,it,expect,vi} from 'vitest';
import {render,cleanup} from '@testing-library/react';
import ChordSheet from '../components/ChordSheet';
import type {Song} from '../types';
import {getNashvilleNumber,isNashville,parseNashvilleToChord,transposeChord,normalizeChordEnharmonic} from '../utils/musicUtils';
import {normalizeStoredSong} from './workspace';
import {applyBarKeyChange} from './songEditing';
import {copyPreviewContent,pastePreviewContent,previewClipboardText} from './previewClipboard';
beforeAll(()=>vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}}));
const song=():Song=>({title:'Optional source chord',originalKey:'G',currentKey:'G',originalKeyUnspecified:true,timeSignature:'4/4',timeSignatureUnspecified:true,chordTimingVersion:2,sections:[{id:'s',title:'Chorus',bars:[{id:'u',chords:[],unmeteredChordLines:[['(G/B)','C(add9)','D/C','Em7']]}]},{id:'dest',title:'Other',keyChangeTo:'A',bars:[{id:'b',chords:[],timeSignature:'3/4'}]}]});
it('transposes the entire parenthesized slash chord and retains its source parentheses',()=>{
 expect(transposeChord('(G/B)',2,'A',false,'G')).toBe('(A/C#)');expect(transposeChord('(A/C#)',-2,'G',false,'A')).toBe('(G/B)');expect(transposeChord('C(add9)',2,'A',false,'G')).toBe('D(add9)');expect(transposeChord('(C(add9))',2,'A',false,'G')).toBe('(D(add9))');expect(transposeChord('Gsus4',2,'A',false,'G')).toBe('Asus4');
});
it('converts optional chords in both Nashville directions without stripping parentheses',()=>{
 expect(getNashvilleNumber('(G/B)','G')).toBe('(1/3)');expect(getNashvilleNumber('(A/C#)','A')).toBe('(1/3)');expect(isNashville('(1/3)')).toBe(true);expect(isNashville('(G/B)')).toBe(false);expect(parseNashvilleToChord('(1/3)','A')).toBe('(A/C#)');expect(getNashvilleNumber('C(add9)','G')).toBe('4(add9)');expect(normalizeChordEnharmonic('(Cb/Fb)')).toBe('(B/E)');
});
it.each([1,2,3]as const)('renders optional harmony and slash bass in source, transposed and numeric view layout%s',rows=>{
 for(const[key,numbers,expected]of [['G',false,'(G/B)'],['A',false,'(A/C#)'],['A',true,'(1/3)']]as const){const s=normalizeStoredSong({...song(),barRowCount:rows,showNashvilleNumbers:numbers},0);const{container}=render(<ChordSheet song={s} currentKey={key} language="zh"/>);const block=container.querySelector('[data-unmetered-chord-block="u"]')!;expect(block.querySelector('[data-unmetered-chord]')).toHaveTextContent(expected);expect(container.querySelector('[data-source-key-unconfirmed]')).toHaveTextContent('原調未定');expect(block.querySelector('[data-preview-slot-index]')).toBeNull();expect(s.sections[0].bars[0].unmeteredChordLines![0][0]).toBe('(G/B)');cleanup()}
});
it('preserves optional source harmony through storage, key change and cross-meter clipboard',()=>{
 const s=normalizeStoredSong(JSON.parse(JSON.stringify(song())),0),target={sectionId:'s',barId:'u'};expect(normalizeStoredSong(JSON.parse(JSON.stringify(s)),0)).toEqual(s);const changed=applyBarKeyChange(s,target,'A');expect(changed.sections[0].bars[0].unmeteredChordLines).toEqual([['(A/C#)','D(add9)','E/D','F#m7']]);const clip=copyPreviewContent(s,[target],'chords')!;expect(previewClipboardText(clip)).toBe('(G/B) C(add9) D/C Em7');const pasted=pastePreviewContent(s,[{sectionId:'dest',barId:'b'}],clip);expect(pasted.error).toBeUndefined();expect(pasted.song.sections[1].bars[0].unmeteredChordLines).toEqual([['(A/C#)','D(add9)','E/D','F#m7']]);expect(s.sections[0].bars[0].unmeteredChordLines![0][0]).toBe('(G/B)');
});
