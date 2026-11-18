import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PracticeLyrics from './PracticeLyrics';

it('follows the roadmap label when two verses share the same chart', () => {
  const doc = {chinese: '[Verse 2]\n第二段的歌詞\n\n[Verse 1]\n第一段的歌詞\n\n[Chorus]\n副歌的歌詞'};
  const view = (label: string) => <PracticeLyrics doc={doc} label={label} language="zh" />;
  const {rerender} = render(view('Verse 1'));
  expect(screen.getByText('第一段的歌詞')).toBeInTheDocument();
  rerender(view('Verse 2'));
  expect(screen.queryByText('第一段的歌詞')).toBeNull();
  expect(screen.getByText('第二段的歌詞')).toBeInTheDocument();
  rerender(view('Interlude'));
  expect(screen.getByText('器樂段')).toBeInTheDocument();
  expect(screen.queryByText('第二段的歌詞')).toBeNull();
  rerender(view('Verse 3'));
  expect(screen.getByText('這個段落尚未配到歌詞')).toBeInTheDocument();
});
