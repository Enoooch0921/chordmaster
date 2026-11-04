import { expect,it } from 'vitest';
import { describeRhythm,getContinuationOnlyChange } from './sourceDifferenceText';
import {compareSetlistSourceScores} from './setlistSourceComparison';
import {describeSetlistSourceChanges,hasSetlistSourceScoreChange} from './setlistSourceSync';
import type {Song} from '../types';
const song:Song={title:'Held beats',originalKey:'C',currentKey:'C',timeSignature:'4/4',sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['D','D/E']}]}]};
it('explains added continuation marks while keeping the real score update and other edits visible',()=>{
 const entry=structuredClone(song);entry.sections[0].bars[0].chords=['D','/','D/E','/'];
 expect(hasSetlistSourceScoreChange(song,entry)).toBe(true);
 expect(describeSetlistSourceChanges(song,entry,'zh')).toEqual(['Verse · 第 1 小節：補上延續拍標示（第 2、4 拍）；和弦與落拍相同']);
 entry.sections[0].bars[0].annotation='新提示';
 const rows=compareSetlistSourceScores(song,entry,'zh');expect(rows.map(row=>row.label)).toEqual(['Verse · 第 1 小節 · 延續拍標示','Verse · 第 1 小節 · 備註']);
 expect(describeSetlistSourceChanges(song,entry,'zh')).toHaveLength(2);
 expect(describeSetlistSourceChanges(entry,song,'zh')[0]).toContain('移除延續拍標示（第 2、4 拍）');
});
it('does not call changed pitches, changed attacks or unanchored slashes mere continuation marks',()=>{
 const entry=structuredClone(song);entry.sections[0].bars[0].chords=['D','D/E','/','/'];
 expect(compareSetlistSourceScores(song,entry,'zh')[0].label).toBe('Verse · 第 1 小節 · 和弦');
 entry.sections[0].bars[0].chords=['D','/','E','/'];expect(compareSetlistSourceScores(song,entry,'zh')[0].label).toBe('Verse · 第 1 小節 · 和弦');
 expect(getContinuationOnlyChange([],[{beat:0,offset:0,chord:'/'}])).toBeNull();
 expect(getContinuationOnlyChange(['D'],['D','/'])).toBeNull();
});
it.each([
 ['/ / q qr','延續 2 拍 → 四分音符 → 四分休止符'],['wr','全休止符'],['e3 e3 e3','八分音符（三連音） → 八分音符（三連音） → 八分音符（三連音）'],['q.','附點四分音符'],['qx','留空（四分音符長度）'],['q^~','四分音符（重音、連至下一音）']
])('makes rhythm notation %s readable without losing meaning', (notation,description)=>expect(describeRhythm(notation,'zh')).toBe(description));
it('preserves unknown notation instead of silently dropping it',()=>expect(describeRhythm('q unknown','zh')).toContain('未辨識記號：unknown'));
it('labels tempos with BPM and keeps an unset tempo distinct',()=>{
 const entry={...song,tempo:128};
 expect(compareSetlistSourceScores({...song,tempo:120},entry,'zh')).toEqual([{label:'速度',library:'120 BPM',setlist:'128 BPM'}]);
 expect(compareSetlistSourceScores(song,entry,'zh')[0].library).toBe('未設定');
});

it.each([['qcu','四分音符（上方叉頭）'],['e3x','留空（八分音符（三連音）長度）'],['y','留空（1/3 個十六分音符長度）']])('preserves special rhythm semantics for %s',(notation,expected)=>expect(describeRhythm(notation,'zh')).toBe(expected));
