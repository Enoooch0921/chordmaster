import { describe, expect, it } from 'vitest';
import type { Song } from '../types';
import { applyNotationVoiceDraft, isolateNotationVoiceCommand, projectNotationVoice } from './notationVoiceEditing';
const target = { sectionId: 's', barId: 'b' };
const song: Song = { title: 'Voices', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [{ id: 's', title: 'Verse', bars: [
  { id: 'previous', timeSignature: '3/4', chords: ['F'] },
  { id: 'b', chords: ['C'], riff: '1', rhythm: 'q', riffVoices: [{ id: 'bass', label: 'Bass', riff: '5' }, { id: 'flute', label: 'Flute', riff: '3' }], rhythmVoices: [{ id: 'kick', label: 'Kick', rhythm: 'e e' }] },
  { id: 'next', chords: ['G'], riff: '7', rhythm: 'h' }
] }] };
describe('notation voice editing', () => {
  it.each(['jianpu', 'rhythm'] as const)('writes only the selected %s lane from a virtual keyboard draft', mode => {
    const voice = { mode, id: mode === 'jianpu' ? 'bass' : 'kick' };
    const projected = projectNotationVoice(song, target, voice);
    const edited = structuredClone(projected);
    edited.sections[0].bars[1][mode === 'jianpu' ? 'riff' : 'rhythm'] = mode === 'jianpu' ? '2' : 'q^';
    edited.sections[0].bars[1].chords = ['Dm'];
    edited.sections[0].bars[2].riff = 'UNRELATED';
    const result = applyNotationVoiceDraft(song, edited, target, voice);
    const expected = structuredClone(song);
    if (mode === 'jianpu') expected.sections[0].bars[1].riffVoices![0].riff = '2';
    else expected.sections[0].bars[1].rhythmVoices![0].rhythm = 'q^';
    expect(result).toEqual(expected);
    expect(applyNotationVoiceDraft(song, projected, target, voice)).toBe(song);
    expect(applyNotationVoiceDraft(song, edited, target, { ...voice, id: 'missing' })).toBe(song);
  });
  it('isolates commands to the current bar while retaining inherited meter', () => {
    const isolated = isolateNotationVoiceCommand(song, target);
    expect(isolated.sections).toHaveLength(1);
    expect(isolated.sections[0].bars).toHaveLength(1);
    expect(isolated.sections[0].bars[0]).toMatchObject({ id: 'b', timeSignature: '3/4' });
    expect(song.sections[0].bars).toHaveLength(3);
  });
});
