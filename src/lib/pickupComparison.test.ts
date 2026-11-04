import { expect, it } from 'vitest';
import { describePickup, describePickupChange, describePickupLength } from './pickupComparison';
import { compareSetlistSourceScores } from './setlistSourceComparison';
import { describeSetlistSourceChanges, hasSetlistSourceScoreChange } from './setlistSourceSync';
import type { Song } from '../types';
const song: Song={title:'Pickup',originalKey:'C',currentKey:'C',timeSignature:'4/4',sections:[{id:'s',title:'Verse',bars:[{id:'b',chords:['C']}]}]};
it('clearly compares an empty one-quarter pickup setting with its removal, retaining column identities', () => {
 const source={...song,pickup:{id:'pickup',timeSignature:'1/4'}},entry=structuredClone(song);const before=structuredClone([source,entry]);
 expect(compareSetlistSourceScores(source,entry,'zh')).toEqual([{label:'弱起拍',library:'有弱起拍\n長度：1 拍（四分音符）\n未填入旋律或節奏',setlist:'無弱起拍'}]);
 expect(describeSetlistSourceChanges(source,entry,'zh')).toEqual(['移除弱起拍 · 原長度：1 拍（四分音符）']);
 expect(describeSetlistSourceChanges(entry,source,'zh')).toEqual(['新增弱起拍 · 長度：1 拍（四分音符）']);
 expect(hasSetlistSourceScoreChange(source,entry)).toBe(true);
 expect([source,entry]).toEqual(before);
});
it.each([
 ['1/4','4/4','1 拍（四分音符）'],['1/8','4/4','半拍（八分音符）'],['3/8','4/4','1.5 拍（3 個八分音符）'],['1/4','6/8','四分音符長度'],['1/16','4/4','0.25 拍（十六分音符）']
])('explains pickup duration %s in the %s meter', (timeSignature,meter,expected) => {
 expect(describePickupLength({timeSignature},meter,'zh')).toBe(expected);
});
it('uses readable English duration and presence labels', () => {
 expect(describePickupLength({timeSignature:'1/4'},'4/4','en')).toBe('1 beat (1 quarter note)');
 expect(describePickupChange({timeSignature:'1/4'},undefined,'4/4','4/4','en')).toBe('Remove pickup · Previous length: 1 beat (1 quarter note)');
 expect(describePickup(undefined,'4/4','en')).toBe('No pickup');
});
it('shows the saved melody, rhythm and voice labels while keeping identities out of the explanation', () => {
 const pickup={id:'private-id',timeSignature:'1/4',riff:'5',rhythm:'q',riffVoices:[{id:'voice-id',label:'Bass',riff:'1,'}]};
 expect(describePickup(pickup,'4/4','zh')).toBe('有弱起拍\n長度：1 拍（四分音符）\n旋律：5\n節奏：q\nBass：1,');
});
it('does not invent a duration for an empty pickup without a stored duration', () => {
 expect(describePickup({},'4/4','zh')).toBe('有弱起拍\n長度：未設定\n未填入旋律或節奏');
});
it('describes a duration edit separately from a melody or rhythm edit', () => {
 expect(describePickupChange({timeSignature:'1/4'},{timeSignature:'2/4'},'4/4','4/4','zh')).toBe('調整弱起拍長度：1 拍（四分音符） → 2 拍（2 個四分音符）');
 expect(describePickupChange({timeSignature:'1/4',riff:'5'},{timeSignature:'1/4',riff:'6'},'4/4','4/4','zh')).toBe('修改弱起拍的旋律／節奏');
});
