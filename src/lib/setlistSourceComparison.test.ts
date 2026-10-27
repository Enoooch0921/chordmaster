import { expect, it } from 'vitest';
import type { Song } from '../types';
import { compareSetlistSourceScores as compare } from './setlistSourceComparison';
const song = (): Song => ({title:'點燃',originalKey:'C',currentKey:'C',timeSignature:'4/4',sections:[{id:'intro',title:'Intro',bars:[{id:'a',chords:['C'],annotation:'鋼琴進'},{id:'b',chords:['G']},{id:'c',chords:['F']}]}]});
it('names a close-only difference and shows open/closed states in both directions',()=>{
 const library=song(); library.sections[0].bars[1]={id:'b',chords:[]};
 const entry=structuredClone(library); entry.sections[0].bars[1].closed=true;
 const snapshot=structuredClone([library,entry]);
 expect(compare(library,entry,'zh')).toEqual([{label:'Intro · 第 2 小節 · 小節關閉',library:'開啟',setlist:'關閉'}]);
 expect(compare(entry,library,'zh')).toEqual([{label:'Intro · 第 2 小節 · 小節關閉',library:'關閉',setlist:'開啟'}]);
 expect(compare(library,entry,'en')).toEqual([{label:'Intro · Bar 2 · closed',library:'Open',setlist:'Closed'}]);
 expect([library,entry]).toEqual(snapshot);
});
it('shows actual note and chord values in fixed library and setlist columns without mutating either input',()=>{
 const library=song(), entry=song(); entry.sections[0].bars[0].annotation='全團進'; entry.sections[0].bars[1].chords=['Am'];
 const snapshot=structuredClone([library,entry]);
 expect(compare(library,entry,'zh')).toEqual([{label:'Intro · 第 1 小節 · 備註',library:'鋼琴進',setlist:'全團進'},{label:'Intro · 第 2 小節 · 和弦',library:'G',setlist:'Am'}]);
 expect([library,entry]).toEqual(snapshot);
});
it('identifies the removed bar and its content instead of just reporting a count',()=>{
 const entry=song(); entry.sections[0].bars.splice(1,1);
 expect(compare(song(),entry,'zh')).toEqual([{label:'Intro · 曲庫第 2 小節',library:'G',setlist:'此歌單已移除此小節'}]);
});
it('does not turn regenerated identities into visible score changes, but still shows real differences',()=>{
 const entry=song(); entry.sections[0].id='new-section';entry.sections[0].bars.forEach((bar,i)=>bar.id=`new-${i}`);
 expect(compare(song(),entry,'zh')).toEqual([]);
 entry.sections[0].bars[0].annotation='全團進';
 expect(compare(song(),entry,'zh')).toEqual([{label:'Intro · 第 1 小節 · 備註',library:'鋼琴進',setlist:'全團進'}]);
});
it('shows a retained-identity reorder with each version in its own order',()=>{
 const entry=song();entry.sections[0].bars.reverse();
 expect(compare(song(),entry,'zh')).toEqual([{label:'Intro · 小節順序',library:'C · 鋼琴進 | G | F',setlist:'F | G | C · 鋼琴進'}]);
});
it('compares source metadata while preserving independent performance preferences',()=>{
 const entry={...song(),currentKey:'D',capo:4,composer:'新作者'} as Song;
 expect(compare(song(),entry,'zh')).toEqual([{label:'作曲',library:'未設定',setlist:'新作者'}]);
});
it('labels added sections and keeps them separate from removed sections',()=>{
 const entry=song();entry.sections.push({id:'chorus',title:'Chorus',bars:[{id:'ch',chords:['Am']}]});
 expect(compare(song(),entry,'zh')).toEqual([{label:'Chorus',library:'無此段落',setlist:'第 1 小節：Am'}]);
});
it('ignores lyrics display settings but shows actual lyrics edits',()=>{
 const library={...song(),lyricsDoc:{chinese:'第一行',displayLanguage:'chinese' as const,fontSize:20}};
 const entry={...library,lyricsDoc:{...library.lyricsDoc,displayLanguage:'bilingual' as const,fontSize:30}};
 expect(compare(library,entry,'zh')).toEqual([]);
 entry.lyricsDoc.chinese='第二行';
 expect(compare(library,entry,'zh')).toEqual([{label:'歌詞',library:'中文歌詞：第一行',setlist:'中文歌詞：第二行'}]);
});
