import type { Bar } from '../types';
import { getChordEvents } from '../utils/chordSubdivisions';
import { hasUnmeteredChords } from '../utils/unmeteredChords';

export interface ComparisonMeasureEvent {
  beat: number;
  offset: number;
  chord: string;
  changed: boolean;
}
export interface ComparisonMeasure {
  beats: number;
  timed: boolean;
  events: ComparisonMeasureEvent[];
  orderedChords: string[];
  description?: string;
}
const meaningAt = (value: unknown, beat: number, offset: number, fallback: string) => Array.isArray(value)
  ? value.find(event=>event && typeof event==='object' && event.beat===beat && event.offset===offset)?.chord ?? fallback : fallback;

/** Display data only; timings use the same chord-event layout as the chart. */
export const compareMeasurePreviews = (library: Bar, setlist: Bar, libraryMeter: string, setlistMeter: string, libraryMeaning: object, setlistMeaning: object) => {
  const build = (bar: Bar, meter: string, meaning: object) => {
    const beats = Math.max(1, Number.parseInt(meter.split('/')[0],10)||4);
    const events = getChordEvents(bar,beats);
    const primaryCount=events.filter(event=>event.subdivisionIndex===null).length;
    const timed=!bar.chordTimingUnspecified&&!hasUnmeteredChords(bar)&&bar.chords.length<=beats
      &&primaryCount===bar.chords.filter(chord=>chord.trim()).length;
    const values=meaning as {chords?:unknown;chordSubdivisions?:unknown};
    return {beats,timed,events:timed?events.map(event=>({beat:event.beat,offset:event.offset,chord:event.chord,
      semanticChord:meaningAt(event.subdivisionIndex===null?values.chords:values.chordSubdivisions,event.beat,event.offset,event.chord)})):[],
      orderedChords:bar.chords.filter(chord=>chord.trim())};
  };
  const a=build(library,libraryMeter,libraryMeaning),b=build(setlist,setlistMeter,setlistMeaning);
  const result=(current:typeof a,other:typeof b):ComparisonMeasure=>({beats:current.beats,timed:current.timed,orderedChords:current.orderedChords,
    events:current.events.map(({semanticChord,...event})=>({...event,changed:!other.events.some(candidate=>candidate.beat===event.beat&&candidate.offset===event.offset&&candidate.semanticChord===semanticChord)}))});
  return {library:result(a,b),setlist:result(b,a)};
};
