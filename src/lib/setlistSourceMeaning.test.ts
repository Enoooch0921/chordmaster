import { expect, it } from 'vitest';
import type { Song } from '../types';
import { classifySetlistSource, describeSetlistSourceChanges, hasSetlistSourceScoreChange } from './setlistSourceSync';
import { compareSetlistSourceScores } from './setlistSourceComparison';
const song = (chords = ['E']): Song => ({title:'Notation',originalKey:'A',currentKey:'A',timeSignature:'4/4',chordTimingVersion:2,
  sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords}]}]});

it.each([
 ['E','5'], ['Em7','5m7'], ['E7','57'], ['E/G#','5/7'], ['E/5','5/E'], ['(E)','(5)'], ['E<','5<'], ['/G#','/7']
])('treats %s and %s as the same harmony without rewriting either score', (literal,degree) => {
 const a=song([literal]),b=song([degree,'','','']); const original=structuredClone([a,b]);
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 expect(classifySetlistSource(a,b,null)).toBe('aligned');
 expect(compareSetlistSourceScores(a,b,'zh')).toEqual([]);
 expect(describeSetlistSourceChanges(a,b,'zh')).toEqual([]);
 expect([a,b]).toEqual(original);
});
it('compares each modulation in its written key and carries it across section boundaries', () => {
 const a=song();a.sections[0].bars.push({id:'mod',keyChangeTo:'B',chords:['F#']});a.sections.push({id:'chorus',title:'Chorus',bars:[{id:'next',chords:['F#']} ]});
 const b=structuredClone(a);b.sections[0].bars[0].chords=['5'];b.sections[0].bars[1].chords=['5'];b.sections[1].bars[0].chords=['5'];
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[1].bars[0].chords=['E'];expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('uses the source key instead of the personal performance key or Capo', () => {
 const a=song(), b={...song(['5']),currentKey:'C' as const,capo:4};
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.originalKey='C';expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it.each(['bar','song'] as const)('does not infer a literal chord when the %s key is unconfirmed', kind => {
 const a=song(),b=song(['5']);
 if(kind==='bar'){a.sections[0].bars[0].chordKeyUnspecified=true;b.sections[0].bars[0].chordKeyUnspecified=true;}
 else{a.originalKeyUnspecified=true;b.originalKeyUnspecified=true;}
 expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('allows a confirmed modulation after an unconfirmed starting key', () => {
 const a={...song(),originalKeyUnspecified:true};a.sections[0].bars[0].keyChangeTo='A';
 const b=structuredClone(a);b.sections[0].bars[0].chords=['5'];
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
});
it.each(['D','Em','E7','E/G#','E>','/','0w'])('still detects a real change from E to %s', chord => {
 expect(hasSetlistSourceScoreChange(song(),song([chord]))).toBe(true);
});
it('retains attack placement when compact and explicit grids are compared', () => {
 const a=song(['E','A']),b=song(['5','','1','']);
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[0].bars[0].chords=['5','1','',''];expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('does not hide a beat offset lost by moving raw chord indices', () => {
 const a=song(['E','A']),b=song(['5','','1','']);
 a.sections[0].bars[0].chordMarks={1:{beatOffset:.5}};b.sections[0].bars[0].chordMarks={1:{beatOffset:.5}};
 expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('retains subdivision positions while accepting the equivalent written chord', () => {
 const a=song(),b=song(['5']);a.sections[0].bars[0].chordSubdivisions=[{beat:2,offset:.5,chord:'A/C#'}];b.sections[0].bars[0].chordSubdivisions=[{beat:2,offset:.5,chord:'1/3'}];
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[0].bars[0].chordSubdivisions![0].offset=.25;expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('compares numbered passes, including their subdivisions, without hiding repeat-count changes', () => {
 const a=song(),b=song(['5']);a.sections[0].bars[0].chordPassVariants=[{pass:2,chords:['A'],chordSubdivisions:[{beat:1,offset:.5,chord:'E'}]}];b.sections[0].bars[0].chordPassVariants=[{pass:2,chords:['1','','',''],chordSubdivisions:[{beat:1,offset:.5,chord:'5'}]}];
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[0].bars[0].chordPassVariants![0].pass=3;expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('keeps unmetered order and uncertain timing without inferring beat positions', () => {
 const a=song(),b=song(['5']);a.sections[0].bars[0].chordTimingUnspecified=true;b.sections[0].bars[0].chordTimingUnspecified=true;
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[0].bars[0].chords=['','5'];expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
 a.sections[0].bars[0].unmeteredChordLines=[['E','A']];b.sections[0].bars[0].chords=['5'];b.sections[0].bars[0].unmeteredChordLines=[['5','1']];
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 b.sections[0].bars[0].unmeteredChordLines=[['1','5']];expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
});
it('does not discard overflow tokens or extra continuation markings', () => {
 expect(hasSetlistSourceScoreChange(song(['E','','','','A']),song(['5','','','','B']))).toBe(true);
 expect(hasSetlistSourceScoreChange(song(['E']),song(['5','/','/','/']))).toBe(true);
});
it.each(['riff','rhythm','annotation','lyrics','tempo'] as const)('still warns for actual %s edits alongside a notation-only change', field => {
 const a=song(),b=song(['5']);
 if(field==='lyrics')b.lyricsDoc={chinese:'真正修改的歌詞'};
 else if(field==='tempo')b.tempo=120;
 else b.sections[0].bars[0][field]=field==='rhythm'?'q q q q':field==='riff'?'1 | 2 | 3 | 4':'修改備註';
 expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
 const rows=compareSetlistSourceScores(a,b,'zh');expect(rows.some(row=>row.label.endsWith(' · 和弦'))).toBe(false);
 expect(describeSetlistSourceChanges(a,b,'zh').some(row=>row.includes('和弦 ('))).toBe(false);
});
it('ignores notation-only changes in the baseline when identifying which side really changed', () => {
 const original=song(),source=song(['5','','','']),entry=song();entry.sections[0].bars[0].annotation='新提示';
 const baseline={songId:'s',sourceContent:original,entryContent:original,sourceRevision:'r',capturedAt:'r'};
 expect(classifySetlistSource(source,entry,baseline)).toBe('setlist-changed');
 expect(classifySetlistSource(entry,source,baseline)).toBe('source-newer');
});
it('ignores an explicitly saved default English language but preserves a real language change', () => {
 const a={...song(),lyricsDoc:{chinese:'歌詞',english:'Words'}}, b={...song(['5']),lyricsDoc:{chinese:'歌詞',english:'Words',translationLanguage:'en'}};
 expect(hasSetlistSourceScoreChange(a,b)).toBe(false);
 expect(compareSetlistSourceScores(a,b,'zh')).toEqual([]);
 expect(describeSetlistSourceChanges(a,b,'zh')).toEqual([]);
 b.lyricsDoc.translationLanguage='ko';expect(hasSetlistSourceScoreChange(a,b)).toBe(true);
 expect(describeSetlistSourceChanges(a,b,'zh')).toEqual(['歌詞翻譯語言設定']);
});

it('does not hide stored notes suppressed by a conflicting full-bar symbol', () => {
 expect(hasSetlistSourceScoreChange(song(['0w','E']),song(['0w','D']))).toBe(true);
});
