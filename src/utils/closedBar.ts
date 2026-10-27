import type { Bar } from '../types';

const isEmptyField = (value: unknown): boolean => {
  if (value == null || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

// Include every saved field, including future metadata, so closing a cell can
// never conceal notation, a context change, or a performance instruction.
export const canCloseBar = (bar?: Bar | null): boolean => Boolean(bar
  && bar.chords.every(chord => chord.trim() === '')
  && Object.entries(bar).every(([key, value]) => (
    key === 'id' || key === 'chords' || key === 'closed' || isEmptyField(value)
  )));

// Re-check at render time too: edits/imports may add content to a closed cell.
export const isClosedBar = (bar?: Bar | null): boolean => bar?.closed === true && canCloseBar(bar);
