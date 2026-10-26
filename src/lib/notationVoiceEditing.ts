import type { Song } from '../types';
import { findSongBar, updateBarById, getEffectiveTimeSignatureForBar, type SongBarIdentity } from './songEditing';

export type NotationVoice = { mode: 'rhythm' | 'jianpu'; id: string };

/** Project one additional lane through the existing, shared notation keyboard. */
export function projectNotationVoice(song: Song, target: SongBarIdentity, voice: NotationVoice): Song {
  const bar = findSongBar(song, target)?.bar;
  if (!bar) return song;
  if (voice.mode === 'jianpu') {
    const selected = bar.riffVoices?.find(item => item.id === voice.id);
    return selected ? updateBarById(song, target, item => ({ ...item, riff: selected.riff })) : song;
  }
  const selected = bar.rhythmVoices?.find(item => item.id === voice.id);
  return selected ? updateBarById(song, target, item => ({ ...item, rhythm: selected.rhythm })) : song;
}

/** Persist only the selected lane; virtual primary notation must never escape. */
export function applyNotationVoiceDraft(song: Song, edited: Song, target: SongBarIdentity, voice: NotationVoice): Song {
  const bar = findSongBar(edited, target)?.bar;
  if (!bar) return song;
  const original = findSongBar(song, target)?.bar;
  const selected = voice.mode === 'jianpu'
    ? original?.riffVoices?.find(item => item.id === voice.id)
    : original?.rhythmVoices?.find(item => item.id === voice.id);
  if (!selected) return song;
  if (voice.mode === 'jianpu' && 'riff' in selected && selected.riff === (bar.riff ?? '')) return song;
  if (voice.mode === 'rhythm' && 'rhythm' in selected && selected.rhythm === (bar.rhythm ?? '')) return song;
  return updateBarById(song, target, original => voice.mode === 'jianpu'
    ? { ...original, riffVoices: original.riffVoices?.map(item => item.id === voice.id ? { ...item, riff: bar.riff ?? '' } : item) }
    : { ...original, rhythmVoices: original.rhythmVoices?.map(item => item.id === voice.id ? { ...item, rhythm: bar.rhythm ?? '' } : item) });
}

/** Prevent an additional-voice command from crossing into another bar's primary lane. */
export function isolateNotationVoiceCommand(song: Song, target: SongBarIdentity): Song {
  const located = findSongBar(song, target);
  if (!located) return song;
  return { ...song, sections: [{ ...located.section, bars: [{
    ...located.bar, timeSignature: getEffectiveTimeSignatureForBar(song, located.bar)
  }] }] };
}
