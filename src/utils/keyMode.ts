import type { Key, Song, TonalMode } from '../types';
export const normalizeKeyMode = (mode: unknown): TonalMode | undefined => mode === 'major' || mode === 'minor' ? mode : undefined;
export const currentKeyMode = (song: Song): TonalMode => song.currentKeyMode ?? song.originalKeyMode ?? 'major';
export const formatKeyName = (key: Key, mode: TonalMode = 'major'): string => `${key}${mode === 'minor' ? 'm' : ''}`;
