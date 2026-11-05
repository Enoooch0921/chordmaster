import { describe, expect, it } from 'vitest';
import type { Setlist, SetlistSong, Song } from '../types';
import { applySetlistSongOverrides } from '../utils/setlistUtils';
import { getSongMap, normalizeSongMap, songMapLabel } from './songMap';
import { normalizeSongBars } from './workspace';
import { mergeSetlistSourceScore } from './setlistSourceSync';

const song: Song = { title: 'Map', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [
  { id: 'v', title: 'Verse 1', bars: [{ chords: ['F'] }] },
  { id: 'b', title: 'Bridge', bars: [{ chords: ['G'] }] }
] };
const meeting: Setlist = { id: 'a', name: '聚會一', displayMode: 'chord-movable-key', songs: [], createdAt: 1, updatedAt: 1 };
const entry: SetlistSong = { id: 's', songId: 's', setlistId: 'a', order: 0, sectionOrder: ['v','b','b'] };

describe('song map', () => {
  it('distinguishes numbered sections, tags and turnarounds and retains custom names', () => {
    expect(['Pre-Chorus', 'C2', '副歌 1', 'Tag', 'Turnaround', 'Interlude', 'Solo cue'].map(s => songMapLabel(s).code))
      .toEqual(['Pc','C2','C1','T','Ta','It','Solo cue']);
    expect(normalizeSongMap([{ label: ' B ', repeats: 4 }, { label: 'C2', repeats: 0 }, null]))
      .toEqual([{ label: 'Bridge', repeats: 4 }, { label: 'Chorus 2', repeats: 1 }]);
  });

  it('infers repeated references from a legacy setlist and keeps different sections with the same name separate', () => {
    expect(getSongMap(applySetlistSongOverrides(song, meeting, entry))).toEqual([
      {label:'Verse 1', repeats:1}, {label:'Bridge', repeats:2}
    ]);
    expect(getSongMap({...song,sections:[song.sections[1], {...song.sections[1], id:'b2'}]})).toHaveLength(2);
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
