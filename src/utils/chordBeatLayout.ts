import { chordEventLabel } from './chordSubdivisions';

type ChordAttack = { beat: number; offset: number; chord: string };

/** Give dense beats more room, while retaining a separate column per beat. */
export function chordBeatTrackWeights(events: readonly ChordAttack[], beats: number) {
  return Array.from({ length: beats }, (_, beat) => {
    const attacks = events.filter(event => event.beat === beat);
    if (!attacks.length || (attacks.length === 1 && attacks[0].chord.trim() === '/')) return .65;
    return 1 + .75 * (attacks.length - 1);
  });
}

/** Shorten only a complete run; isolated offbeats keep their full beat number. */
export function chordBeatGroupLabels(events: readonly ChordAttack[], compact = false) {
  if (events.length === 4 && events.every((event, index) => event.beat === events[0].beat && event.offset === index / 4)) {
    return [String(events[0].beat + 1), 'e', '&', 'a'];
  }
  return events.map(event => compact && !event.offset ? '' : chordEventLabel(event.beat, event.offset));
}
