import { expect, it } from 'vitest';
import type { Song, Bar } from '../types';
import { auditionBeats, buildChordAudition } from './chordAudition';
import { resolveAuditionChord } from './auditionChords';

const score = (bars: Bar[], extra?: Partial<Song>): Song => ({
  title: '', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', tempo: 120,
  sections: [{ id: 'v', title: 'Verse', bars: bars.map((bar, i) => ({ id: String(i), ...bar })) }], ...extra,
});
const target = { sectionId: 'v', barId: '0', slotIndex: 0 };
it('keeps the click on the written beat through a partial start, rests, a pushed downbeat and a meter/tempo change', () => {
  const song = score([{ chords: ['C', 'N.C.', '/', '/'] }, { chords: ['G<'], timeSignature: '3/8', tempo: 80 }]);
  const plan = buildChordAudition(song, { ...target, slotIndex: 1, offset: .5 }, 'section');
  expect(Array.from(auditionBeats(plan.bars), beat => [beat.at, beat.accent])).toEqual([
    [.25, false], [.75, false], [1.25, true], [1.625, false], [2, false]
  ]);
  expect(plan.sounds[0].start).toBe(1.125);
  expect([...auditionBeats(buildChordAudition(song, target, 'chord').bars)]).toEqual([]);
});

it('counts through a multi-measure rest and stops at the first unresolved chord', () => {
  const song = score([{ chords: ['|2|'] }, { chords: ['C', 'G???', '', ''] }], { tempo: undefined });
  const plan = buildChordAudition(song, target, 'section');
  const beats = [...auditionBeats(plan.bars)];
  expect(beats).toHaveLength(9);
  expect(beats.filter(beat => beat.accent).map(beat => beat.at)).toEqual([0, 3, 6]);
  expect(plan.duration).toBe(6.75);
});

it('voices the actual concert harmony, with an independent spelled bass and every editor quality', () => {
  const cases = { C: [0,4,7], Cm: [0,3,7], C7: [0,4,7,10], Cmaj7: [0,4,7,11], 'C(add9)': [0,4,7,14] };
  for (const [chord, intervals] of Object.entries(cases)) {
    expect(resolveAuditionChord(chord, 'C','C', false)).toEqual({notes: [48,...intervals.map(x=>60+x)]});
  }
  for (const suffix of ['m6','sus2','dim7','aug','9','maj9','m9','11','m11','13','m13','mMaj7','m7b5','7sus4','7b5','7#5','7b9','7#9','7#11','7b13','add2','add11','6/9'])
    expect(resolveAuditionChord('Db'+suffix, 'C','D',false),suffix).toHaveProperty('notes');
  const song = score([{ chords:['G/B','5/7'] }],{currentKey:'D',capo:2});
  const {sounds} = buildChordAudition(song,target,'bar');
  expect(sounds[0].notes).toEqual(sounds[1].notes);
  expect(sounds[0].notes[0]%12).toBe(1);
  expect(resolveAuditionChord('Cweird','C','C',false)).toEqual({issue:'unsupported',token:'Cweird'});
});

it('cuts the segment at the cursor, carries held notes, handles rests, key and tempo events, ignores repeat routes', () => {
  const song = score([
    { chords:['C','','/','G'], chordSubdivisions:[{beat:2,offset:0.5,chord:'F'}], repeatStart:true },
    { chords:['1','N.C.'], keyChangeTo:'D', timeSignature:'3/8', tempo:60, repeatEnd:true },
    { chords:['%'] }, { chords:[], closed:true }, { chords:['5'], chordKeyUnspecified:true }
  ]);
  const plan=buildChordAudition(song,{...target,slotIndex:2},'section');
  expect(plan.sounds.map(x=>[x.start,x.end,x.notes[0]%12])).toEqual([
    [0,0.25,0],[0.25,0.5,5],[0.5,1,7],[1,2,2],[2.5,3.5,2]
  ]);
  expect(plan.duration).toBe(4);
  expect(plan.issue?.kind).toBe('key');
  expect(plan.bars.map(x=>x.barId)).not.toContain('3');
  expect(buildChordAudition(song,{...target,slotIndex:2,offset:0.5},'chord').sounds[0].notes[0]%12).toBe(5);
});
it('uses confirmed offsets and bar-local time without guessing missing timing or writing defaults', () => {
  const song = score([{chords:['C<','G'],chordMarks:{1:{beatOffset:0.25}}},{chords:['Am','F'],chordTimingUnspecified:true}],{tempo:undefined});
  const plan=buildChordAudition(song,{...target,slotIndex:3},'bar');
  expect(plan.sounds.map(x=>x.start)).toEqual([0,2.25*0.75]);
  expect(plan.fallbackTempo).toBe(true);
  expect(song.tempo).toBeUndefined();
  const section=buildChordAudition(song,target,'section');
  expect(section.duration).toBe(3); expect(section.issue?.kind).toBe('timing');
  expect(buildChordAudition(song,{...target,barId:'1',orderedIndex:1},'chord').sounds[0].notes[0]%12).toBe(5);
  const unknown=score([{chords:['C']}],{timeSignatureUnspecified:true});
  expect(buildChordAudition(unknown,target,'chord').sounds).toHaveLength(1);
  expect(buildChordAudition(unknown,target,'bar').issue?.kind).toBe('timing');
});
it('stops at an unknown token at its position and resolves repeat chains from before a selection', () => {
  const song=score([{chords:['C','G']},{chords:['%']},{chords:['%']},{chords:['Am','G???']}]);
  const plan=buildChordAudition(song,{...target,barId:'2'},'section');
  expect(plan.sounds.map(x=>[x.start,x.end])).toEqual([[0,1],[1,2],[2,3]]);
  expect(plan.issue).toEqual({kind:'unsupported',token:'G???'});
  expect(buildChordAudition(score([{chords:['%']}]),target,'bar').issue?.kind).toBe('repeat');
});

it('only uses the active occurrence on a setlist and never invents a key for an unmetered degree', () => {
  const base=score([{chords:[]}]);
  const song={...base,sections:[
    {id:'v',title:'Verse',bars:[{id:'0',chords:['1']}]},
    {id:'bridge',title:'Bridge',keyChangeTo:'D' as const,bars:[{chords:['5']}]},
    {id:'v',title:'Verse',bars:[{id:'0',chords:['1']}]}
  ]};
  expect(buildChordAudition(song,{...target,sectionOccurrence:1},'chord').sounds[0].notes[0]%12).toBe(2);
  const unknown=score([{chords:[],unmeteredChordLines:[['C','5/7']],chordKeyUnspecified:true}]);
  expect(buildChordAudition(unknown,{...target,orderedIndex:1},'chord').issue?.kind).toBe('key');
  expect(buildChordAudition(unknown,target,'chord').sounds).toHaveLength(1);
  expect(buildChordAudition(unknown,target,'section').issue?.kind).toBe('timing');
});

it('keeps the upper chord when just the slash bass moves, and cuts it at a rest', () => {
  const song = score([{ chords: ['G', '/B', 'C', '0'] }]);
  const { sounds } = buildChordAudition(song, target, 'bar');
  expect(sounds[1].notes).toEqual([47, ...sounds[0].notes.slice(1)]);
  expect(sounds.map(note => [note.start, note.end])).toEqual([[0, .5], [.5, 1], [1, 1.5]]);
  expect(buildChordAudition(score([{chords:['1']}],{originalKeyUnspecified:true}), target, 'chord').issue?.kind).toBe('key');
});

it('plays pushes and pulls half a notated beat away, including decorated chords and repeats', () => {
  const song = score([{chords:['C', 'Dm>^', '(G/B<)^', 'F']}, {chords:['%']}]);
  const section = buildChordAudition(song,target,'section');
  // The delayed Dm and anticipated G/B coincide: the later written chord takes over.
  expect(section.sounds.map(n => [n.start,n.end,n.notes[0]%12])).toEqual([
    [0,.75,0],[.75,1.5,11],[1.5,2,5],[2,2.75,0],[2.75,3.5,11],[3.5,4,5]
  ]);
  expect(buildChordAudition(song,{...target,slotIndex:1},'chord').sounds[0].notes[0]%12).toBe(2);
  expect(buildChordAudition(score([{chords:['C','Dm>^','G','F']}]),target,'bar').sounds[1].start).toBe(.75);
  expect(buildChordAudition(score([{chords:['C','G<','','','','']}],{timeSignature:'6/8'}),target,'bar').sounds[1].start).toBe(.125);
});

it('anticipates the next downbeat before a tempo boundary and clips an excerpt to its cursor', () => {
  const song = score([{chords:['C']}, {tempo:60,chords:['G<','F>']}]);
  const plan = buildChordAudition(song,target,'section');
  expect(plan.sounds.map(n => [n.start,n.end])).toEqual([[0,1.75],[1.75,4.5],[4.5,6]]);
  expect(plan.bars.map(bar=>bar.start)).toEqual([0,2]);
  expect(buildChordAudition(song,target,'bar').sounds.map(n=>[n.start,n.end])).toEqual([[0,1.75],[1.75,2]]);
  expect(buildChordAudition(song,{...target,barId:'1'},'bar').sounds.map(n=>n.start)).toEqual([0,2.5]);
  expect(buildChordAudition(song,{...target,barId:'1',slotIndex:2},'section').sounds.map(n=>[n.start,n.end])).toEqual([[0,.5],[.5,2]]);
});

it('orders a late subdivision and a pushed downbeat on the same timeline without negative durations', () => {
  const song = score([{chords:['C'],chordSubdivisions:[{beat:3,offset:.75,chord:'F'}]}, {chords:['G<']}]);
  expect(buildChordAudition(song,target,'section').sounds.map(n=>[n.start,n.end,n.notes[0]%12]))
    .toEqual([[0,1.75,0],[1.75,1.875,7],[1.875,4,5]]);
  expect(buildChordAudition(song,{...target,barId:'1'},'bar').sounds.map(n=>[n.start,n.end,n.notes[0]%12]))
    .toEqual([[0,2,5]]);
  expect(buildChordAudition(song,{...target,barId:'1',slotIndex:1},'chord').sounds[0].notes[0]%12).toBe(5);
});
