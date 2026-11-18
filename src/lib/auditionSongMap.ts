import type { Bar, Key, Section, Song } from '../types';
import { selectChordPass } from '../utils/chordPassVariants';
import { isClosedBar } from '../utils/closedBar';
import { currentKeyMode } from '../utils/keyMode';
import { getTransposeOffset, transposeKeyPreservingSpelling } from '../utils/musicUtils';
import { getSongKeyStates } from './songEditing';
import { expandSongMapSectionLabel, normalizeSongMap, sectionSongMap, sharedIntroOutro, songMapDisplayParts, songMapLabel } from './songMap';

type Visit = { label: string; source?: Section; occurrence: number };
export type MapIssue = { kind: 'noMap' | 'mapSection' | 'mapSize'; step?: number; token?: string };
type Arrangement = { song: Song; written: Key[][]; visits: Visit[] };

// A complete plan is scheduled in memory. Imported repeat counts can be arbitrary integers.
const maxBars = 16384;
const equals = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function sectionCandidates(label: string, sections: Section[]) {
  const name = songMapLabel(label).name;
  const exact = sections.filter(section => equals(songMapLabel(section.title).name, name));
  if (exact.length) return exact;
  const canonical = songMapDisplayParts(label).cue ? songMapLabel(songMapLabel(label).code).name : name;
  const aliases = (section: Section) => sharedIntroOutro(section.title) ?? expandSongMapSectionLabel(section.title);
  const named = (target: string) => sections.filter(section => aliases(section).some(alias => equals(alias, target)));
  const shared = named(canonical);
  if (shared.length) return shared;
  const verse = /^Verse(?: (\d+))?$/.exec(canonical);
  if (verse) return verse[1] ? named('Verse') : sections.filter(section => aliases(section).some(alias => /^Verse \d+$/.test(alias)));
  if (/^(Interlude|Instrumental|Outro)(?: \d+)?$/.test(canonical)) return named('Intro');
  return [];
}

function barsForVisit(bars: Bar[], pass: number, visits: number): Bar[] {
  const playable = bars.filter(bar => !isClosedBar(bar));
  const result: Bar[] = [];
  const add = (bar: Bar, traversal: number) => {
    if (!bar.ending || bar.ending.split(',').some(number => Number(number) === traversal)) {
      result.push(selectChordPass(bar, traversal));
    }
  };
  let start = 0;
  for (let index = 0; index < playable.length; index++) {
    if (playable[index].repeatStart) {
      for (; start < index; start++) add(playable[start], pass);
    }
    if (!playable[index].repeatEnd) continue;
    let end = index;
    while (playable[end + 1]?.ending && !playable[end + 1].repeatStart) end++;
    // A whole-section repeat is already counted by its explicit roadmap visits.
    if (start === 0 && end === playable.length - 1 && visits > 1) {
      for (const bar of playable) add(bar, pass);
      return result;
    }
    for (const traversal of [1, 2]) {
      for (let b = start; b <= end; b++) add(playable[b], traversal);
    }
    index = end;
    start = end + 1;
  }
  for (; start < playable.length; start++) add(playable[start], pass);
  return result;
}

export function arrangeAudition(song: Song): Arrangement | MapIssue {
  const steps = normalizeSongMap(song.setlistSongMap) ?? normalizeSongMap(song.songMap)
    ?? (song.showSongMap ? sectionSongMap(song.sections) : undefined);
  if (!steps?.length) return { kind: 'noMap' };
  const seen = new Set<string>();
  const sources = song.sections.filter(section => {
    if (!section.id) return true;
    if (seen.has(section.id)) return false;
    seen.add(section.id);
    return true;
  });
  const resolved = [];
  const totals = new Map<Section, number>();
  for (const [i, step] of steps.entries()) {
    const matches = sectionCandidates(step.label, sources);
    const source = matches[0];
    if (matches.length > 1 || (!source && step.label !== 'Ending') || source?.bars.every(isClosedBar)) {
      return { kind: 'mapSection', step: i + 1, token: step.label };
    }
    if (source) totals.set(source, (totals.get(source) ?? 0) + step.repeats);
    resolved.push({ ...step, source, stepNumber: i + 1 });
  }
  const keys = getSongKeyStates(song).barActiveKeys;
  const sourceBars = new Map(sources.map(source => [source, source.bars.map((bar, i) => ({ ...bar, id: String(i) }))]));
  const counts = new Map<Section, number>();
  const sections: Section[] = [];
  const visits: Visit[] = [];
  const written: Key[][] = [];
  let barCount = 0;
  let activeKey = song.originalKey;
  for (const { label, source, repeats, stepNumber } of resolved) {
    if (repeats > maxBars - sections.length) return { kind: 'mapSize' };
    const sourceIndex = source ? song.sections.indexOf(source) : -1;
    const occurrences = source ? song.sections.filter(section => section.id === source.id).length : 0;
    const usingIntro = source && /^Intro(?: |$)/.test(songMapLabel(source.title).name) && /^(Interlude|Instrumental|Outro)(?: |$)/.test(label);
    for (let n = 0; n < repeats; n++) {
      const pass = source ? (counts.get(source) ?? 0) + 1 : 1;
      if (source) counts.set(source, pass);
      let bars = source ? barsForVisit(sourceBars.get(source)!, pass, totals.get(source)!)
        : [{ id: '0', chords: [currentKeyMode(song) === 'minor' ? '1m' : '1'] }];
      barCount += bars.length;
      if (barCount > maxBars) return { kind: 'mapSize' };
      if (!bars.length) return { kind: 'mapSection', step: stepNumber, token: label };
      // A borrowed intro keeps its harmonic intervals, including written key changes.
      // An explicit key on its opening bar must not undo the previous section's lift.
      let entryKey = source?.keyChangeTo;
      if (usingIntro) {
        const offset = getTransposeOffset(keys[sourceIndex][Number(bars[0].id)], activeKey);
        if (entryKey) entryKey = transposeKeyPreservingSpelling(entryKey, offset);
        if (offset) bars = bars.map(bar => bar.keyChangeTo
          ? { ...bar, keyChangeTo: transposeKeyPreservingSpelling(bar.keyChangeTo, offset) } : bar);
      }
      activeKey = entryKey ?? activeKey;
      for (const bar of bars) if (bar.keyChangeTo) activeKey = bar.keyChangeTo;
      sections.push({ ...source, keyChangeTo: entryKey, id: String(sections.length), title: label, bars });
      written.push(bars.map(bar => source ? keys[sourceIndex][Number(bar.id)] : song.originalKey));
      visits.push({ label, source, occurrence: Math.min(pass - 1, Math.max(0, occurrences - 1)) });
    }
  }
  const firstBarIndex = song.sections[0]?.bars.findIndex(bar => !isClosedBar(bar));
  const startsAtPickup = visits[0].source === song.sections[0] && sections[0].bars[0].id === String(firstBarIndex);
  return { song: { ...song, sections, pickup: startsAtPickup ? song.pickup : undefined }, written, visits };
}
