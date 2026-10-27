import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SetlistBrowserHeader from './SetlistBrowserHeader';

const defaults = {
  title: '洛杉磯烈火', isRoot: false, backLabel: '歌單', onBack: vi.fn(),
  searchLabel: '搜尋歌單', closeSearchLabel: '關閉搜尋',
  sortLabel: '排序', sortMode: 'updated', onSortChange: vi.fn(),
  sortOptions: [{ value: 'updated', label: '最近更新' }, { value: 'name', label: '名稱 A-Z' }],
  countLabel: '2 份歌單'
};

function Header({ isRoot = false, initialQuery = '' }: { isRoot?: boolean; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  return <SetlistBrowserHeader {...defaults} isRoot={isRoot} searchQuery={query} onSearchChange={setQuery}/>;
}

describe('SetlistBrowserHeader', () => {
  it.each([false, true])('opens search on demand and restores the full list and focus on Escape (root: %s)', isRoot => {
    render(<Header isRoot={isRoot}/>);
    expect(screen.queryByRole('searchbox')).toBeNull();
    const trigger = screen.getByRole('button', { name: '搜尋歌單' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const input = screen.getByRole('searchbox', { name: '搜尋歌單' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '聚會一' } });
    expect(input).toHaveValue('聚會一');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it.each([false, true])('keeps externally active searches visible and lets the close action clear them (root: %s)', isRoot => {
    render(<Header isRoot={isRoot} initialQuery="聚會二"/>);
    expect(screen.getByRole('searchbox')).toHaveValue('聚會二');
    fireEvent.click(screen.getByRole('button', { name: '關閉搜尋' }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: '搜尋歌單' })).toHaveFocus();
  });

  it.each([false, true])('collapses an empty search on outside interaction without taking focus back (root: %s)', isRoot => {
    render(<><Header isRoot={isRoot}/><button type="button">另一個操作</button></>);
    const trigger = screen.getByRole('button', { name: '搜尋歌單' });
    fireEvent.click(trigger);
    const input = screen.getByRole('searchbox');
    fireEvent.pointerDown(input);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '   ' } });
    const outside = screen.getByRole('button', { name: '另一個操作' });
    fireEvent.pointerDown(outside);
    fireEvent.blur(input, { relatedTarget: outside });
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    fireEvent.pointerUp(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(trigger).not.toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it.each([false, true])('collapses a blank search on keyboard focus leave and retains an active filter (root: %s)', isRoot => {
    render(<><Header isRoot={isRoot}/><button type="button">另一個操作</button></>);
    fireEvent.click(screen.getByRole('button', { name: '搜尋歌單' }));
    const outside = screen.getByRole('button', { name: '另一個操作' });
    fireEvent.blur(screen.getByRole('searchbox'), { relatedTarget: outside });
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '搜尋歌單' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '聚會一' } });
    fireEvent.pointerDown(outside);
    fireEvent.blur(screen.getByRole('searchbox'), { relatedTarget: outside });
    expect(screen.getByRole('searchbox')).toHaveValue('聚會一');
  });

  it('retains native root sort selection during a search without a parent back button', () => {
    const onSortChange = vi.fn();
    render(<SetlistBrowserHeader {...defaults} isRoot searchQuery="一" onSearchChange={vi.fn()} onSortChange={onSortChange}/>);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '關閉搜尋' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '歌單' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'name' } });
    expect(onSortChange).toHaveBeenCalledWith('name');
  });
});
