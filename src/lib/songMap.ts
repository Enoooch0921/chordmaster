import type { Section, Song, SongMapStep } from '../types';

// Keep full section names in the arrangement. Abbreviations are display labels.
const sectionNames: [string, string, string[]][] = [
  ['Intro', 'I', ['Int', '前奏']],
  ['Verse', 'V', ['主歌']],
  ['Pre Chorus', 'Pc', ['預副歌', '導歌']],
  ['Chorus', 'C', ['副歌']],
  ['Post Chorus', 'Po', ['後副歌']],
  ['Refrain', 'R', ['Rf', '疊句']],
  ['Bridge', 'B', ['橋段']],
  ['Tag', 'T', ['Tg', '尾句']],
  ['Turnaround', 'Ta', ['過門']],
  ['Interlude', 'It', ['間奏']],
  ['Instrumental', 'Is', ['器樂段']],
  ['Vamp', 'Vp', []],
  ['Breakdown', 'Bd', []],
  ['Ending', 'E', ['結尾']],
  ['Outro', 'O', ['尾奏']],
];
const key = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, '');
const names = new Map(sectionNames.flatMap(([name, code, aliases]) =>
  [name, code, ...aliases].map(alias => [key(alias), { name, code }] as const)));
export const songMapSuggestions = sectionNames.map(([name]) => name);

export function songMapLabel(label: string) {
  const text = label.trim();
  const [, base, suffix] = /^(.*?)(\d+(?:\s*[/／&＆,、]\s*\d+)*)?$/.exec(text) ?? [];
  const number = suffix?.replace(/\s+/g, '').replace(/／/g, '/').replace(/＆/g, '&');
  const match = names.get(key(base || text));
  if (!match) return { name: text, code: text };
  return { name: match.name + (number ? ' ' + number : ''), code: match.code + (number ?? '') };
}

export function sectionSongMap(sections: Section[]): SongMapStep[] {
  const steps: SongMapStep[] = [];
  let previousId: string | undefined;
  for (const section of sections) {
    const label = songMapLabel(section.title || '').name;
    if (!label) continue;
    const previous = steps.at(-1);
    if (previous?.label === label && ((section.id && section.id === previousId) || !/\d/.test(label))) previous.repeats++;
    else steps.push({ label, repeats: 1 });
    previousId = section.id;
  }
  return steps;
}

export function normalizeSongMap(value: unknown): SongMapStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.flatMap(step => {
    if (typeof step?.label !== 'string' || !step.label.trim()) return [];
    const repeats = Number.isSafeInteger(step.repeats) && step.repeats > 0 ? step.repeats : 1;
    return [{ label: songMapLabel(step.label).name, repeats }];
  });
  const compact: SongMapStep[] = [];
  for (const step of steps) {
    const previous = compact.at(-1);
    if (previous?.label === step.label && !/\d/.test(step.label)) previous.repeats += step.repeats;
    else compact.push(step);
  }
  return compact.length ? compact : undefined;
}

export const getSongMap = (song: Pick<Song, 'songMap' | 'sections'>) =>
  normalizeSongMap(song.songMap) ?? sectionSongMap(song.sections);
