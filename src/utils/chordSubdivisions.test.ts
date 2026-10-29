import { expect, it } from 'vitest';
import { splitDirectChordRun } from './chordSubdivisions';

it.each([
  ['GAm', ['G', 'Am']], ['gam', ['G', 'Am']], ['gambmcm', ['G', 'Am', 'Bm', 'Cm']],
  ['GAmBmCm', ['G', 'Am', 'Bm', 'Cm']], ['g/Bam', ['G/B', 'Am']],
  ['gmaj7am', ['Gmaj7', 'Am']], ['cdimdm', ['Cdim', 'Dm']], ['cadd9f#m7', ['Cadd9', 'F#m7']],
  ['csus4g7', ['Csus4', 'G7']], ['gbmam', ['Gbm', 'Am']], ['c6/9am', ['C6/9', 'Am']],
])('recognizes %s without splitting qualities or slash roots', (input, expected) => {
  expect(splitDirectChordRun(input)).toEqual(expected);
});
it.each(['G/B', 'E/Ab', 'Gmaj7', 'Cadd9', 'Cdim', 'F#m7b5', 'Gbm', 'b6', 'b7', '13', '5/6m'])('keeps %s as a single chord', input => {
  expect(splitDirectChordRun(input)).toBeNull();
});
