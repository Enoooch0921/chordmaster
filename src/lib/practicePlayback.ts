import { followPracticeSigns } from './writtenPracticeRoute';
import type { PracticeBindings } from './auditionSongMap';
import { sliceAudition, joinAuditions } from './auditionTimeline';
import type { Song } from '../types';
import { lyricsSectionLabel } from '../utils/lyricsSections';
import { getLyricsBlocks } from '../utils/lyricsDocument';
import { currentKeyMode } from '../utils/keyMode';
import { resolveAuditionChord } from './auditionChords';
import { buildChordAudition, buildWrittenPractice, type AuditionBar, type AuditionPlan } from './chordAudition';
import { expandSongMapSectionLabel, normalizeSongMap } from './songMap';

export type PracticeRange = 'map' | 'song' | 'section' | 'bar';
const target = {sectionId: '', barId: '', slotIndex: 0};

function numberMeasures(plan: AuditionPlan) {
  let index = 0;
  while (index < plan.bars.length) {
    const start = index;
    const visit = plan.bars[index].mapVisit;
    while (index < plan.bars.length && plan.bars[index].mapVisit === visit) index++;
    const pickup = plan.bars[start].pickup ? 1 : 0;
    for (let i = start; i < index; i++) {
      plan.bars[i].practiceBar = i - start + 1 - pickup;
      plan.bars[i].practiceTotal = index - start - pickup;
    }
  }
  return plan;
}

export function writtenPractice(song: Song) {
  const plan = buildWrittenPractice(song);
  return numberMeasures(plan);
}

function limitRange(plan: AuditionPlan, index: number, range: PracticeRange) {
  const first = plan.bars[index];
  if (!first) return plan;
  const next = range === 'section' ? plan.bars.slice(index + 1).find(bar => bar.mapVisit !== first.mapVisit) : undefined;
  return sliceAudition(plan, first.start, range === 'bar' ? first.end : next?.start ?? plan.duration);
}

export function buildPracticeSession(song: Song, range: PracticeRange, startIndex = 0, bindings?: PracticeBindings) {
  const written = writtenPractice(song);
  const arranged = range === 'map' && Boolean(normalizeSongMap(song.setlistSongMap) ?? normalizeSongMap(song.songMap));
  const route = arranged ? numberMeasures(buildChordAudition(song, target, 'map', true, bindings))
    : range === 'map' ? numberMeasures(followPracticeSigns(song, written)) : written;
  const initial = limitRange(route, range === 'map' ? 0 : startIndex, range);
  const options = new Set(['Intro', ...route.bars.map(b => b.mapLabel!), ...written.bars.map(b => b.mapLabel!)]);
  const borrowed = new Map<string, AuditionPlan>();
  const extraLabels = new Set(getLyricsBlocks(song.lyricsDoc).flatMap(block => expandSongMapSectionLabel(lyricsSectionLabel(block.marker))));
  // A combined Intro/Outro may exist on paper without an explicit Intro itinerary entry.
  extraLabels.add('Intro');
  for (const label of extraLabels) {
    if (route.bars.some(b => b.mapLabel === label) || written.bars.some(b => b.mapLabel === label)) continue;
    const plan = numberMeasures(buildChordAudition({...song, setlistSongMap:[{label, repeats:1}]}, target, 'map'));
    if (plan.duration > 0) { borrowed.set(label, plan); options.add(label); }
  }
  options.delete('Ending');
  options.add('Ending');
  const auxiliaryNotes = [...new Set([...route.sounds, ...written.sounds, ...[...borrowed.values()].flatMap(p => p.sounds)].flatMap(n => n.notes))];
  const tonic = (key: AuditionBar['soundingKey']) => resolveAuditionChord(currentKeyMode(song) === 'minor' ? '1m' : '1',
    key ?? song.currentKey, key ?? song.currentKey, !key);
  for (const key of new Set([...written.bars, ...route.bars].map(b => b.soundingKey))) {
    if (!key) continue;
    const harmony = tonic(key);
    if ('notes' in harmony) auxiliaryNotes.push(...harmony.notes);
  }
  function select(label: string, current: AuditionBar) {
    const fromRoute = route.bars.findIndex(b => b.mapLabel === label && (b.mapVisit ?? 0) > (current.mapVisit ?? -1));
    const index = fromRoute >= 0 ? fromRoute : route.bars.findIndex(b => b.mapLabel === label);
    if (index >= 0 && (label !== 'Ending' || route.bars[index].sourceTitle)) {
      return limitRange(route, index, label === 'Ending' && range !== 'bar' ? 'section' : range);
    }
    const source = written.bars.findIndex(b => b.mapLabel === label);
    let section = source >= 0 ? limitRange(written, source, range === 'bar' ? 'bar' : 'section') : borrowed.get(label);
    if (!section && (label === 'Ending' || label === 'Intro')) {
      const duration = current.beats * current.beatSeconds;
      const harmony = tonic(current.soundingKey);
      section = {duration, fallbackTempo: false,
        bars:[{...current, pickup:false, firstBeat:0, start:0, end:duration, practiceBar:1, practiceTotal:1,
          mapVisit:-1, mapLabel:label, sourceTitle:undefined}],
        sounds: label === 'Ending' && 'notes' in harmony ? [{start:0,end:duration,notes:harmony.notes}] : []};
    }
    if (!section) return;
    const extra = {...section, bars:section.bars.map(b => ({...b, mapVisit:-1}))};
    if (label === 'Ending' || range === 'section' || range === 'bar') return limitRange(extra, 0, range);
    if (label === 'Intro') return joinAuditions(extra, route);
    const lastSource = section.bars.at(-1)?.sourceTitle;
    const counterpart = route.bars.find(b => b.sourceTitle === lastSource);
    const after = route.bars.find(b => (b.mapVisit ?? 0) > (counterpart?.mapVisit ?? current.mapVisit ?? -1));
    return after ? joinAuditions(extra, sliceAudition(route, after.start)) : extra;
  }
  return {initial, route, labels:[...options], auxiliaryNotes, select};
}
