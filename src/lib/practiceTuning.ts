import type { Key } from '../types';
import { transposeKeyPreservingSpelling } from '../utils/musicUtils';

export interface PracticeTuning {
  semitones: number;
  tempoRatio: number;
}

export const DEFAULT_PRACTICE_TUNING: PracticeTuning = { semitones: 0, tempoRatio: 1 };
export const AUDITION_FALLBACK_BPM = 80;

export function practiceKey(key: Key, semitones: number): Key {
  return semitones % 12 === 0 ? key : transposeKeyPreservingSpelling(key, semitones);
}

export function practiceTempo(bpm: number | undefined, ratio: number) {
  return Math.round((bpm ?? AUDITION_FALLBACK_BPM) * ratio * 100) / 100;
}
