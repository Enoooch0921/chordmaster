import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PracticeLyrics from './PracticeLyrics';

it('keeps the entire lyric sheet through instrumental breaks and highlights each shared verse separately', () => {
  const doc = {chinese: '[Verse 2]\n第二段的歌詞\n\n[Verse 1]\n第一段的歌詞\n\n[Chorus]\n副歌的歌詞'};
  const select = vi.fn();
  const view = (label: string) => <PracticeLyrics doc={doc} label={label} language="zh" labels={['Verse 1','Verse 2','Chorus']} onSelect={select}/>;
  const {rerender, container} = render(view('Verse 1'));
  expect(container.querySelector('[aria-current]')).toHaveTextContent('第一段的歌詞');
  rerender(view('Verse 2'));
  expect(container.querySelector('[aria-current]')).toHaveTextContent('第二段的歌詞');
  rerender(view('Interlude'));
  expect(container.querySelector('[aria-current]')).toBeNull();
  for (const text of ['第一段的歌詞','第二段的歌詞','副歌的歌詞']) expect(screen.getByText(text)).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name:'Verse 2'}));
  expect(select).toHaveBeenCalledWith('Verse 2');
});
