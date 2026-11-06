import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import SongTitle, { compactSongTitle } from './SongTitle';

it('omits language and version suffixes only in compact list labels', () => {
  const title = '祢的信實 — Great Is Thy Faithfulness（中英雙語／敬拜團現場延伸版本）';
  const view = render(<SongTitle title={title} compact number={1}/>);
  expect(view.container).toHaveTextContent('1. 祢的信實 — Great Is Thy Faithfulness');
  expect(view.container).not.toHaveTextContent('中英雙語');
  view.rerender(<SongTitle title={title}/>);
  expect(view.container).toHaveTextContent(title);
  expect(compactSongTitle('Same God (Live Version) [English]')).toBe('Same God');
});

it('keeps meaningful subtitles, lyrics names and a title consisting only of parentheses', () => {
  expect(compactSongTitle('Amazing Grace (My Chains Are Gone) (中文版)')).toBe('Amazing Grace (My Chains Are Gone)');
  expect(compactSongTitle('Praise (Psalm 150)')).toBe('Praise (Psalm 150)');
  expect(compactSongTitle('Hope (Live Forever)')).toBe('Hope (Live Forever)');
  expect(compactSongTitle('（中文版）')).toBe('（中文版）');
});
