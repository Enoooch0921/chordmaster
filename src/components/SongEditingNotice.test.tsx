import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SongEditingNotice } from './SongEditingNotice';
it('announces editors without stealing focus or remounting the score', () => {
  const editors = [{ sessionId: 'session', userId: 'other', name: '小明', songId: 'song', updatedAt: 1 }];
  const view = (active: boolean) => <><input aria-label="Score" defaultValue="draft" /><SongEditingNotice editors={active ? editors : []} language="zh" /></>;
  const { rerender } = render(view(false));
  const field = screen.getByLabelText('Score') as HTMLInputElement;
  field.focus(); field.setSelectionRange(2, 2);
  rerender(view(true));
  expect(screen.getByRole('status')).toHaveTextContent('小明 正在編輯這首歌');
  expect(screen.getByLabelText('Score')).toBe(field);
  expect(field).toHaveFocus(); expect(field.selectionStart).toBe(2);
  rerender(view(false)); expect(field).toHaveFocus(); expect(field.value).toBe('draft');
});
