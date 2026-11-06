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
  ['Tag', 'Tag', ['T', 'Tg', '尾句']],
  ['Turnaround', 'Turn', ['Ta', 'Tr', 'Turn around', '過門']],
  ['Interlude', 'It', ['Inter', '間奏']],
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

// Only full section names/aliases identify an embedded section. Single-letter
// codes inside free text could be instrument names or ordinary words.
const embeddedNames = sectionNames.flatMap(([name, code, aliases]) =>
  [name, ...aliases].filter(alias => alias.length > 1).map(alias => {
    const section = `${alias.replace(/ /g, '[\\s_-]*')}(?:[\\s_-]*(\\d+(?:\\s*[/／&＆,、]\\s*\\d+)*))?`;
    return {
      name, code, pattern: new RegExp(`(?:^|[^a-z])${section}(?![a-z0-9])`, 'i'),
      // Capture the boundary separately so a Chinese cue beside the name survives.
      displayPattern: new RegExp(`(^|[^a-z])(${section})(?![a-z0-9])`, 'i'),
    };
  })).sort((a, b) => b.name.length - a.name.length);

export function songMapLabel(label: string) {
  const text = label.trim();
  const [, base, suffix] = /^(.*?)(\d+(?:\s*[/／&＆,、]\s*\d+)*)?$/.exec(text) ?? [];
  const number = suffix?.replace(/\s+/g, '').replace(/／/g, '/').replace(/＆/g, '&');
  const match = names.get(key(base || text));
  if (!match) {
    if (sharedIntroOutro(text)) return { name: text, code: text };
    const embedded = embeddedNames.find(entry => entry.pattern.test(text));
    // Keep the entire performance cue in storage, editor, tooltip and score.
    // “1st Chorus Drop” is a Chorus cue, not a new numbered Chorus 1.
    if (embedded) return { name: text, code: embedded.code + (embedded.pattern.exec(text)![1]?.replace(/\s+/g, '').replace(/／/g, '/').replace(/＆/g, '&') ?? '') };
    return { name: text, code: text };
  }
  return { name: match.name + (number ? ' ' + number : ''), code: match.code + (number ?? '') };
}

const expandDisplayCode = (code: string) => code.replace(/^(I|It|O|E|R|Bd)(?=\d|$)/,
  prefix => ({ I: 'Intro', It: 'Inter', O: 'Outro', E: 'End', R: 'Ref', Bd: 'Break' })[prefix]!);

/** Shorten a recognized section name, keeping every word of its performance cue.
 * Compound/unknown section names stay intact; this never changes saved labels. */
export function songMapDisplayParts(label: string): { code: string; cue?: string } {
  const { name, code } = songMapLabel(label);
  const canonical = /^(Intro|Verse|Pre Chorus|Chorus|Post Chorus|Refrain|Bridge|Tag|Turnaround|Interlude|Instrumental|Vamp|Breakdown|Ending|Outro)(?: \d+(?:[/&,、]\d+)*)?$/.test(name);
  if (canonical) return { code: expandDisplayCode(code) };
  const embedded = embeddedNames.find(entry => entry.displayPattern.test(name));
  const match = embedded?.displayPattern.exec(name);
  if (!match) return { code: name };
  const start = match.index + match[1].length;
  const cue = [name.slice(0, start).trim(), name.slice(start + match[2].length).trim()].filter(Boolean).join(' ');
  if (!cue || embeddedNames.some(entry => entry.pattern.test(cue))) return { code: name };
  return { code: expandDisplayCode(code), cue };
}

/** Plain text equivalent used for the initial chart width estimate. */
export function songMapDisplayCode(label: string) {
  const { code, cue } = songMapDisplayParts(label);
  return cue ? `${code} · ${cue}` : code;
}

function sharedIntroOutro(label: string): string[] | undefined {
  if (!/[/／]/.test(label)) return undefined;
  const parts = label.split(/[/／]/).map(part => songMapLabel(part).name);
  return parts.length === 2 && /^Intro(?: \d+)?$/.test(parts[0]) && /^Outro(?: \d+)?$/.test(parts[1]) ? parts : undefined;
}

export function sectionSongMap(sections: Section[]): SongMapStep[] {
  const steps: SongMapStep[] = [];
  const outros: SongMapStep[] = [];
  let previousId: string | undefined;
  for (const section of sections) {
    const label = songMapLabel(section.title || '').name;
    if (!label) continue;
    const shared = sharedIntroOutro(label);
    if (shared) {
      steps.push({ label: shared[0], repeats: 1 });
      outros.push({ label: shared[1], repeats: 1 });
      previousId = section.id;
      continue;
    }
    if (/^Outro(?: \d+)?$/.test(label)) {
      outros.push({ label, repeats: 1 });
      previousId = undefined;
      continue;
    }
    const previous = steps.at(-1);
    if (previous?.label === label && ((section.id && section.id === previousId) || !/\d/.test(label))) previous.repeats++;
    else steps.push({ label, repeats: 1 });
    previousId = section.id;
  }
  return [...steps, ...outros];
}

export function normalizeSongMap(value: unknown): SongMapStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sharedOutros: SongMapStep[] = [];
  const steps = value.flatMap(step => {
    if (typeof step?.label !== 'string' || !step.label.trim()) return [];
    const repeats = Number.isSafeInteger(step.repeats) && step.repeats > 0 ? step.repeats : 1;
    const shared = sharedIntroOutro(step.label);
    if (shared) {
      sharedOutros.push({ label: shared[1], repeats });
      return [{ label: shared[0], repeats }];
    }
    return [{ label: songMapLabel(step.label).name, repeats }];
  });
  const compact: SongMapStep[] = [];
  // Only a newly split shared outro moves. Explicitly arranged outros stay put.
  for (const step of [...steps, ...sharedOutros]) {
    const previous = compact.at(-1);
    if (previous?.label === step.label && !/\d/.test(step.label)) previous.repeats += step.repeats;
    else compact.push(step);
  }
  return compact.length ? compact : undefined;
}

export const getSongMap = (song: Pick<Song, 'songMap' | 'sections'>) =>
  normalizeSongMap(song.songMap) ?? sectionSongMap(song.sections);

/** A section inventory is not a performance roadmap. Verified sources and
 * manual choices use showSongMap; an unset choice only reveals saved routing. */
export function shouldShowSongMap(song: Pick<Song, 'showSongMap' | 'songMap' | 'setlistSongMap'>) {
  if (typeof song.showSongMap === 'boolean') return song.showSongMap;
  const steps = normalizeSongMap(song.setlistSongMap ?? song.songMap);
  if (!steps) return false;
  const visited = new Set<string>();
  return steps.some(step => {
    if (step.repeats > 1 || visited.has(step.label)) return true;
    visited.add(step.label);
    return false;
  });
}
