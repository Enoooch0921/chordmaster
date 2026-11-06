import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SongMapToken from './SongMapToken';

it.each(['Verse 1&2', 'Verse 1/2', 'Pre Chorus 1&2'])('separates section numbers from repetitions for %s', label => {
  render(<SongMapToken step={{ label, repeats: 2 }} zh />);
  const token = screen.getByRole('img');
  expect(token).toHaveAttribute('data-numbered', 'true');
  expect(token.querySelector('.chart-map-token-code')).toHaveTextContent(label.startsWith('Pre') ? 'Pc' : 'V');
  expect(token.querySelector('.chart-map-token-number')).toHaveTextContent(label.includes('/') ? '1/2' : '1&2');
  expect(token.querySelector('sup')).toHaveTextContent('×2');
  expect(token).toHaveAccessibleName(`${label}，共 2 遍`);
});

it('keeps plain and custom labels on their existing single line', () => {
  const view = render(<SongMapToken step={{ label: 'Intro', repeats: 1 }} zh />);
  expect(screen.getByRole('img')).not.toHaveAttribute('data-numbered');
  expect(screen.getByRole('img')).toHaveTextContent('I');
  view.rerender(<SongMapToken step={{ label: '自由敬拜', repeats: 1 }} zh />);
  expect(screen.getByRole('img')).not.toHaveAttribute('data-numbered');
  expect(screen.getByRole('img')).toHaveTextContent('自由敬拜');
});
