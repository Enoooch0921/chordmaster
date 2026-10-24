import type { Bar, Section, Song } from '../types';
import { normalizeTempoBpm } from './tempoUtils';
export type TempoEvent = Pick<Bar, 'tempo' | 'resetTempo'>;
export const applyTempoEvent = (current: number | undefined, event: TempoEvent, base: number | undefined): number | undefined => event.resetTempo ? base : normalizeTempoBpm(event.tempo) ?? current;
// Events apply in written order: section, then bar. A new section inherits the last tempo.
export const getSongTempoStates = (song: Song) => {
  const base = normalizeTempoBpm(song.tempo);
  let active = base;
  const sectionTempos: Array<number | undefined> = [];
  const barTempos: Array<Array<number | undefined>> = [];
  song.sections.forEach(section => {
    active = applyTempoEvent(active, section, base);
    sectionTempos.push(active);
    barTempos.push(section.bars.map(bar => (active = applyTempoEvent(active, bar, base))));
  });
  return { sectionTempos, barTempos };
};
export const hasTempoEvent = (event: TempoEvent | Section): boolean => Boolean(event.resetTempo || normalizeTempoBpm(event.tempo) !== undefined);

export const getSongTempoPoints = (song: Song) => {
  const states = getSongTempoStates(song);
  return song.sections.flatMap((section, sectionIndex) => section.bars.flatMap((bar, barIndex) => {
    const bpm = states.barTempos[sectionIndex][barIndex];
    return bpm !== undefined && (hasTempoEvent(bar) || (barIndex === 0 && hasTempoEvent(section)))
      ? [{ id: `${sectionIndex}:${barIndex}`, section: section.title, bar: barIndex + 1, bpm }]
      : [];
  }));
};
