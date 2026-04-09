import type { ChordFontPreset } from '../types';

export const DEFAULT_CHORD_FONT_PRESET: ChordFontPreset = 'stage-sans';

const CHORD_FONT_FAMILIES: Record<ChordFontPreset, string> = {
  'classic-serif': '"Noto Serif TC", "Source Serif 4", "IBM Plex Serif", Georgia, Cambria, "Times New Roman", serif',
  'stage-sans': '"Noto Sans CJK TC", "Noto Sans TC", "Source Han Sans TC", "Noto Sans", "Source Sans 3", "Helvetica Neue", Arial, sans-serif'
};

export const getChordFontFamily = (preset?: ChordFontPreset) => (
  CHORD_FONT_FAMILIES[preset || DEFAULT_CHORD_FONT_PRESET]
);
