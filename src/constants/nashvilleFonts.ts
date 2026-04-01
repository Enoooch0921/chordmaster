import type { NashvilleFontPreset } from '../types';

export const DEFAULT_NASHVILLE_FONT_PRESET: NashvilleFontPreset = 'ibm-plex-serif';
export const NASHVILLE_FONT_FAMILY = '"IBM Plex Serif", ui-serif, Georgia, serif';

export const getNashvilleFontFamily = (_preset?: NashvilleFontPreset) => NASHVILLE_FONT_FAMILY;
