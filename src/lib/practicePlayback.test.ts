import { expect, it } from 'vitest';
import type { Song } from '../types';
import { buildPracticeSession } from './practicePlayback';

const song: Song = {title:'Practice', originalKey:'C', currentKey:'C', timeSignature:'4/4', tempo:120,
  lyricsDoc:{chinese:'[Verse 1]\nOne\n\n[Verse 2]\nTwo'},
  sections:[{id:'v', title:'Verse', bars:[{id:'1', chords:['1']},{id:'2', chords:['4']}]},
    {id:'c', title:'Chorus', keyChangeTo:'D', bars:[{id:'3', chords:['5']}]}]};

it('defaults to the printed measures, offers numbered lyrics, and stops a tonic ending in the current key', () => {
  const session = buildPracticeSession(song, 'map');
  expect(session.initial.bars.map(b => [b.mapLabel,b.practiceBar])).toEqual([['Verse',1],['Verse',2],['Chorus',1]]);
  expect(session.labels).toEqual(expect.arrayContaining(['Intro','Verse 1','Verse 2','Ending']));
  const last = session.initial.bars.at(-1)!;
  const ending = session.select('Ending', last)!;
  expect(ending.bars).toHaveLength(1);
  expect(ending.sounds[0].notes[0] % 12).toBe(2);
  expect(session.select('Intro', last)?.bars.map(b => b.mapLabel)).toEqual(['Intro','Verse','Verse','Chorus']);
  expect(session.select('Verse 2', last)?.bars.map(b => b.mapLabel)).toEqual(['Verse 2','Verse 2','Chorus']);
});

it('uses the next mapped occurrence and the requested starting bar and range', () => {
  const arranged = {...song, songMap:['Verse 1','Chorus','Verse 2','Chorus','Ending'].map(label => ({label,repeats:1}))};
  const session = buildPracticeSession(arranged,'map');
  expect(session.select('Chorus', session.initial.bars[3])?.bars.map(b => b.mapLabel)).toEqual(['Chorus','Ending']);
  expect(session.select('Ending', session.initial.bars[0])?.sounds[0].notes[0] % 12).toBe(0);
  expect(buildPracticeSession(arranged,'bar',1).initial.bars.map(b => b.practiceBar)).toEqual([2]);
  expect(buildPracticeSession(arranged,'section').initial.bars).toHaveLength(2);
});

it('follows a written D.S. and Coda once, retaining distinct short and long choruses and shared verse lyrics', () => {
  const part = (id: string, title: string, markers = {}) => ({id, title, bars:[{id, chords:['1'], ...markers}]});
  const written: Song = {...song, sections:[
    part('i','Intro'), part('v','Verse 2/3',{leftMarker:'segno',repeatStart:true}), part('p','Pre-Chorus',{rightMarker:'coda'}),
    part('c1','Chorus'), part('t','Turnaround',{rightMarker:'ds',repeatEnd:true}), part('c2','Chorus',{leftMarker:'coda'}),
    part('e','Ending',{rightMarker:'fine'}),
  ]};
  const route = buildPracticeSession(written,'map').initial;
  expect(route.bars.map(b=>b.mapLabel)).toEqual(['Intro','Verse 2','Pre Chorus','Chorus','Turnaround','Verse 3','Pre Chorus','Chorus','Ending']);
  expect(route.bars.map(b=>b.sectionId)).toEqual(['0','1','2','3','4','1','2','5','6']);
  expect(route.duration).toBe(18);
  expect(route.sounds.map(n=>n.start)).toEqual([0,2,4,6,8,10,12,14,16]);
});

it('requires ambiguous or missing map sections to be assigned to a source in this score', () => {
  const mapped = {...song,songMap:['Verse 1','Refrain','Ending'].map(label=>({label,repeats:1}))};
  expect(buildPracticeSession(mapped,'map').initial.issue).toMatchObject({kind:'mapSection',token:'Refrain'});
  const session = buildPracticeSession(mapped,'map',0, {Refrain:'c'});
  expect(session.initial.bars.map(b=>[b.mapLabel,b.sectionId])).toEqual([['Verse 1','v'],['Verse 1','v'],['Refrain','c'],['Ending','']]);
});
