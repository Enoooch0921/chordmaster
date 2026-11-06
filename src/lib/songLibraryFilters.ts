import type { Song } from '../types';
import { currentKeyMode, formatKeyName } from '../utils/keyMode';
import { MIN_TEMPO_BPM, MAX_TEMPO_BPM } from '../utils/tempoUtils';

export type LibraryScope = 'all' | 'recent' | 'favorites';
export type LibraryFilters = { key: string; meter: string; minBpm: string; maxBpm: string };
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { key: '', meter: '', minBpm: '', maxBpm: '' };
export const libraryKey = (song: Song) => formatKeyName(song.currentKey, currentKeyMode(song));
export function libraryFilterError(filters: LibraryFilters): 'bpm' | 'range' | null {
  const values = [filters.minBpm, filters.maxBpm].filter(value => value.trim());
  if (values.some(value => !Number.isFinite(Number(value)) || Number(value) < MIN_TEMPO_BPM || Number(value) > MAX_TEMPO_BPM)) return 'bpm';
  return filters.minBpm && filters.maxBpm && Number(filters.minBpm) > Number(filters.maxBpm) ? 'range' : null;
}
export const libraryFilterCount = (filters: LibraryFilters) => Number(Boolean(filters.key)) + Number(Boolean(filters.meter)) + Number(Boolean(filters.minBpm || filters.maxBpm));
export function matchesLibraryFilters(song: Song, filters: LibraryFilters) {
  if (libraryFilterError(filters)) return false;
  if (filters.key && (song.originalKeyUnspecified || libraryKey(song) !== filters.key)
    || filters.meter && (song.timeSignatureUnspecified || song.timeSignature !== filters.meter)) return false;
  if (filters.minBpm || filters.maxBpm) {
    if (typeof song.tempo !== 'number' || !Number.isFinite(song.tempo)) return false;
    if (filters.minBpm && song.tempo < Number(filters.minBpm) || filters.maxBpm && song.tempo > Number(filters.maxBpm)) return false;
  }
  return true;
}
