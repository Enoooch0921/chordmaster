import type { NavigationMarker, Song } from '../types';
import { sliceAudition } from './auditionTimeline';
import type { AuditionPlan } from './chordAudition';
import { expandSongMapSectionLabel } from './songMap';

/** Read the directions on a linear score. Keep contiguous audio intact across ordinary barlines. */
export function followPracticeSigns(song: Song, written: AuditionPlan): AuditionPlan {
  const bars = written.bars;
  const score = bars.map(b => b.pickup ? undefined : song.sections[Number(b.sectionId)]?.bars[Number(b.barId)]);
  if (!score.some(b => b?.rightMarker?.startsWith('d'))) return written;
  const used = new Set<number>();
  const entries = new Map<number, number>();
  const route: AuditionPlan = {...written, bars:[], sounds:[], duration:0};
  let destination: NavigationMarker | undefined;
  let start = 0;
  let visit = -1;
  function append(end: number) {
    const clip = sliceAudition(written, bars[start].start, bars[end].end);
    let lastSection: number | undefined;
    let label = '';
    for (const bar of clip.bars) {
      if (bar.mapVisit !== lastSection) {
        lastSection = bar.mapVisit!;
        const pass = entries.get(lastSection) ?? 0;
        entries.set(lastSection, pass + 1);
        const labels = expandSongMapSectionLabel(bar.mapLabel!);
        label = labels[Math.min(pass, labels.length - 1)] ?? bar.mapLabel!;
        visit++;
      }
      route.bars.push({...bar, mapLabel:label, mapVisit:visit, start:bar.start + route.duration, end:bar.end + route.duration});
    }
    for (const note of clip.sounds) route.sounds.push({...note, start:note.start + route.duration, end:note.end + route.duration});
    route.duration += clip.duration;
  }
  for (let i = 0; i < bars.length; i++) {
    const marker = score[i]?.rightMarker;
    if (marker === 'fine' && destination === 'fine') { append(i); return route; }
    let target = -1;
    if (marker === 'coda' && destination === 'coda') {
      target = score.findIndex((b, j) => j > i && b?.leftMarker === 'coda');
      if (target >= 0) destination = undefined;
    } else if (marker?.startsWith('d') && !used.has(i)) {
      used.add(i);
      target = marker.startsWith('dc') ? 0 : score.slice(0, i + 1).map(b => b?.leftMarker).lastIndexOf('segno');
      if (target >= 0) destination = marker.endsWith('fine') ? 'fine' : 'coda';
    }
    if (target < 0) continue;
    if (route.bars.length + i - start + 1 > 16384) return {...written, bars:[], sounds:[], duration:0, issue:{kind:'mapSize'}};
    append(i);
    start = target;
    i = target - 1;
  }
  if (start < bars.length) append(bars.length - 1);
  return route;
}
