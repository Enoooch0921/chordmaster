import { describe, expect, it } from 'vitest';
import type { Setlist, SetlistSong, Song } from '../types';
import { applySetlistSongOverrides } from '../utils/setlistUtils';
import { expandSongMapSectionLabel, getSongMap, normalizeSongMap, shouldShowSongMap, songMapDisplayParts, songMapLabel } from './songMap';
import { normalizeSongBars } from './workspace';
import { mergeSetlistSourceScore } from './setlistSourceSync';

const song: Song = { title: 'Map', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [
  { id: 'v', title: 'Verse 1', bars: [{ chords: ['F'] }] },
  { id: 'b', title: 'Bridge', bars: [{ chords: ['G'] }] }
] };
const meeting: Setlist = { id: 'a', name: '聚會一', displayMode: 'chord-movable-key', songs: [], createdAt: 1, updatedAt: 1 };
const entry: SetlistSong = { id: 's', songId: 's', setlistId: 'a', order: 0, sectionOrder: ['v','b','b'] };

describe('song map', () => {
  it.each<[string, string[]]>([
    ['Verse1/2', ['Verse 1', 'Verse 2']],
    ['主歌 1／2', ['Verse 1', 'Verse 2']],
    ['Pre-Chorus 1 / 2 / 3', ['Pre Chorus 1', 'Pre Chorus 2', 'Pre Chorus 3']],
    ['Chorus 2＆1', ['Chorus 2', 'Chorus 1']],
    ['Bridge 10,11、12', ['Bridge 10', 'Bridge 11', 'Bridge 12']],
    ['Interlude 1/1/2', ['Interlude 1', 'Interlude 2']],
    ['V1&2', ['Verse 1', 'Verse 2']]
  ])('offers independent arrangement choices for %s', (label, expected) => {
    expect(expandSongMapSectionLabel(label)).toEqual(expected);
  });

  it.each(['Verse 1', 'Intro / Outro', '1st Chorus Drop', 'Verse 1/2 Drop', 'Solo 1/2', '6/8'])('preserves an ordinary or custom arrangement label: %s', label => {
    expect(expandSongMapSectionLabel(label)).toEqual([songMapLabel(label).name]);
  });

  it('does not show a section inventory by default, even when saved as a map', () => {
    expect(shouldShowSongMap(song)).toBe(false);
    const basic = ['Intro', 'Verse 1', 'Verse 2', 'Chorus', 'Bridge', 'Outro'].map(label => ({ label, repeats: 1 }));
    expect(shouldShowSongMap({ songMap: basic })).toBe(false);
    expect(shouldShowSongMap({ songMap: [] })).toBe(false);
    // Inferred repeated section references remain available on opt-in, not automatic evidence.
    expect(shouldShowSongMap(applySetlistSongOverrides(song, meeting, entry))).toBe(false);
  });

  it('shows saved returns and repetitions, while respecting the active setlist map', () => {
    const roadmap = ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro'].map(label => ({label, repeats: 1}));
    expect(shouldShowSongMap({songMap: roadmap})).toBe(true);
    expect(shouldShowSongMap({songMap: [{label: 'Bridge', repeats: 4}]})).toBe(true);
    expect(shouldShowSongMap({songMap: roadmap, setlistSongMap: [{label: 'Verse', repeats: 1}]})).toBe(false);
    expect(shouldShowSongMap({setlistSongMap: roadmap})).toBe(true);
  });

  it('preserves explicit visibility for verified sources and manual choices through normalization', () => {
    const basic = {...song, songMap: [{label: 'Intro', repeats: 1}, {label: 'Verse', repeats: 1}, {label: 'Chorus', repeats: 1}]};
    expect(shouldShowSongMap(normalizeSongBars({...basic, showSongMap: true}))).toBe(true);
    expect(shouldShowSongMap(normalizeSongBars({...basic, songMap: [{label: 'Chorus', repeats: 2}], showSongMap: false}))).toBe(false);
    expect(shouldShowSongMap(normalizeSongBars({...song, showSongMap: true}))).toBe(true);
  });

  it('distinguishes numbered sections, tags and turnarounds and retains custom names', () => {
    expect(['Pre-Chorus', 'C2', '副歌 1', 'Tag', 'Turnaround', 'Interlude', 'Solo cue'].map(s => songMapLabel(s).code))
      .toEqual(['Pc','C2','C1','Tag','Turn','It','Solo cue']);
    expect(normalizeSongMap([{ label: ' B ', repeats: 4 }, { label: 'C2', repeats: 0 }, null]))
      .toEqual([{ label: 'Bridge', repeats: 4 }, { label: 'Chorus 2', repeats: 1 }]);
  });

  it('keeps legacy tag and turnaround aliases distinct with full names in storage', () => {
    expect(['Tag', 'T', 'Tg', 'Turnaround', 'Turn around', 'Ta', 'Tr', 'Turn'].map(label => songMapLabel(label).code))
      .toEqual(['Tag', 'Tag', 'Tag', 'Turn', 'Turn', 'Turn', 'Turn', 'Turn']);
    expect(normalizeSongMap([{label:'T2', repeats:1}, {label:'Ta2', repeats:2}]))
      .toEqual([{label:'Tag 2', repeats:1}, {label:'Turnaround 2', repeats:2}]);
  });

  it('abbreviates combined section numbers without losing which verses or bridges are included', () => {
    expect(['Verse 1／2', 'Verse 3／4', 'Bridge 1 & 2', 'Bridge3&4', 'Pc2'].map(label => songMapLabel(label).code))
      .toEqual(['V1/2', 'V3/4', 'B1&2', 'B3&4', 'Pc2']);
    expect(songMapLabel('Intro / Outro').code).toBe('Intro / Outro');
  });

  it('infers repeated references and combines adjacent unnumbered sections', () => {
    expect(getSongMap(applySetlistSongOverrides(song, meeting, entry))).toEqual([
      {label:'Verse 1', repeats:1}, {label:'Bridge', repeats:2}
    ]);
    expect(getSongMap({...song,sections:[song.sections[1], {...song.sections[1], id:'b2'}]})).toEqual([{label:'Bridge', repeats:2}]);
  });

  it('uses a readable section code while preserving performance cues and numbered variants', () => {
    const labels = ['1st Chorus Drop', '正常Chorus', 'Chorus 2 Drop', 'Pre-Chorus Down', '回主歌Inter', 'Solo cue'];
    expect(labels.map(label => songMapLabel(label).code)).toEqual(['C', 'C', 'C2', 'Pc', 'It', 'Solo cue']);
    expect(labels.map(label => songMapLabel(label).name)).toEqual(labels);
    expect(normalizeSongMap(labels.slice(0, 2).map(label => ({ label, repeats: 1 })))).toHaveLength(2);
  });

  it.each([
    ['1st Chorus Drop', {code: 'C', cue: '1st Drop'}],
    ['正常Chorus', {code: 'C', cue: '正常'}],
    ['Chorus 2 Drop', {code: 'C2', cue: 'Drop'}],
    ['Pre-Chorus Down', {code: 'Pc', cue: 'Down'}],
    ['Interlude (Build)', {code: 'Inter', cue: '(Build)'}],
    ['Intro / Outro', {code: 'Intro / Outro'}],
    ['回主歌Inter', {code: '回主歌Inter'}],
    ['Verse into Chorus', {code: 'Verse into Chorus'}],
    ['Solo cue', {code: 'Solo cue'}],
    ['自由敬拜', {code: '自由敬拜'}],
  ])('preserves cue meaning when displaying %s compactly', (label, display) => {
    expect(songMapDisplayParts(label as string)).toEqual(display);
  });

  it('splits a shared intro/outro and places the inferred outro at the end without changing score sections', () => {
    const sections = [
      { id: 'i', title: 'Intro 2/ Outro', bars: [{ chords: ['C'] }] },
      ...song.sections,
    ];
    const before = structuredClone(sections);
    expect(getSongMap({ sections })).toEqual([
      { label: 'Intro 2', repeats: 1 }, { label: 'Verse 1', repeats: 1 },
      { label: 'Bridge', repeats: 1 }, { label: 'Outro', repeats: 1 },
    ]);
    expect(sections).toEqual(before);
    expect(normalizeSongMap([{ label: 'Intro 2／Outro', repeats: 2 }, { label: 'C', repeats: 1 }]))
      .toEqual([{ label: 'Intro 2', repeats: 2 }, { label: 'Chorus', repeats: 1 }, { label: 'Outro', repeats: 2 }]);
    const explicit = [{ label: 'Outro', repeats: 1 }, { label: 'Chorus', repeats: 1 }];
    expect(getSongMap({ sections, songMap: explicit })).toEqual(explicit);
  });

  it('combines adjacent unnumbered steps, sums repeats and preserves numbered or separated bridges', () => {
    expect(normalizeSongMap([
      {label:'B', repeats:2}, {label:'Bridge', repeats:3},
      {label:'B1', repeats:1}, {label:'B2', repeats:1}, {label:'B2', repeats:1},
      {label:'B', repeats:1}, {label:'Chorus', repeats:1}, {label:'B', repeats:1},
    ])).toEqual([
      {label:'Bridge', repeats:5}, {label:'Bridge 1', repeats:1}, {label:'Bridge 2', repeats:1}, {label:'Bridge 2', repeats:1},
      {label:'Bridge', repeats:1}, {label:'Chorus', repeats:1}, {label:'Bridge', repeats:1},
    ]);
    expect(song.sections).toHaveLength(2);
  });

  it('inherits the current library default, isolates a meeting change across reload/sync, and restores inheritance', () => {
    const library = { ...song, songMap:[{label:'Intro',repeats:2}] };
    const local = normalizeSongBars({ ...song, setlistSongMap:[{label:'Bridge',repeats:4}] });
    const read = (snapshot: Song) => getSongMap(applySetlistSongOverrides(snapshot, meeting, entry, {}, library));
    expect(read(local)).toEqual(local.setlistSongMap);
    expect(read(mergeSetlistSourceScore(local,library))).toEqual(local.setlistSongMap);
    expect(read(song)).toEqual(library.songMap);
    expect(read({...local,setlistSongMap:undefined})).toEqual(library.songMap);
    expect(library.sections).toEqual(song.sections);
  });
});
