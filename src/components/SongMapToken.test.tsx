import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SongMapToken from './SongMapToken';

it.each(['Verse 1&2', 'Verse 1/2', 'Pre Chorus 1&2'])('separates section numbers from repetitions for %s', label => {
  render(<SongMapToken step={{ label, repeats: 2 }} zh />);
  const token = screen.getByRole('img');
  expect(token).toHaveAttribute('data-numbered', 'true');
  expect(token.querySelector('.chart-map-token-code')).toHaveTextContent(label.startsWith('Pre') ? 'Pc' : 'V');
  expect(token.querySelector('.chart-map-token-number')).toHaveTextContent(label.includes('/') ? '1/2' : '1&2');
  expect(token.querySelector('.chart-map-token-repeat')).toHaveTextContent('×2');
  expect(token).toHaveAccessibleName(`${label}，共 2 遍`);
});

it('keeps plain and custom labels on their existing single line', () => {
  const view = render(<SongMapToken step={{ label: 'Intro', repeats: 1 }} zh />);
  expect(screen.getByRole('img')).not.toHaveAttribute('data-numbered');
  expect(screen.getByRole('img')).toHaveTextContent('Intro');
  view.rerender(<SongMapToken step={{ label: '自由敬拜', repeats: 1 }} zh />);
  expect(screen.getByRole('img')).not.toHaveAttribute('data-numbered');
  expect(screen.getByRole('img')).toHaveTextContent('自由敬拜');
});

it.each([
  ['Intro 1&2', 'Intro1&2'], ['I2', 'Intro2'], ['Interlude', 'Inter'], ['It2', 'Inter2'], ['Outro', 'Outro'], ['O2', 'Outro2'],
  ['Ending', 'End'], ['E2', 'End2'], ['1st Chorus Drop', 'C · 1st Drop'], ['正常Chorus', 'C · 正常'],
  ['Tag', 'Tag'], ['T2', 'Tag2'], ['Turn around', 'Turn'], ['Ta2', 'Turn2'], ['Tr', 'Turn'], ['Tr2', 'Turn2'],
  ['Refrain', 'Ref'], ['R2', 'Ref2'], ['Rf', 'Ref'], ['Breakdown', 'Break'], ['Bd2', 'Break2'],
])('displays %s without changing its meaning', (label, display) => {
  render(<SongMapToken step={{ label, repeats: 2 }} zh />);
  expect(screen.getByRole('img').querySelector('[data-map-label-line]')).toHaveTextContent(display);
});

it('keeps first-time cues distinct from section numbers and repeat counts', () => {
  render(<SongMapToken step={{ label: '1st Chorus Drop', repeats: 2 }} zh />);
  const token = screen.getByRole('img', {name: '1st Chorus Drop，共 2 遍'});
  expect(token).not.toHaveAttribute('data-numbered');
  expect(token.querySelector('.chart-map-token-code')).toHaveTextContent(/^C$/);
  expect(token.querySelector('.chart-map-token-cue')).toHaveTextContent('1st Drop');
  expect(token.querySelector('.chart-map-token-repeat')).toHaveTextContent('×2');
});
