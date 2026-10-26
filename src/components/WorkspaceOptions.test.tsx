import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import WorkspaceOptions from './WorkspaceOptions';
import type { CloudLibrarySummary, LibraryRole, Project, Setlist } from '../types';

it('keeps switching, management and creation available without selecting the current workspace again', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onManage = vi.fn();
  const onCreate = vi.fn();
  const libraries = [
    { id: 'personal', kind: 'personal' as const, name: 'Personal', role: 'owner' as const, ownerUserId: 'me', createdAt: '', updatedAt: '' },
    { id: 'team', kind: 'team' as const, name: 'TopChurchWorship', role: 'owner' as const, ownerUserId: 'me', createdAt: '', updatedAt: '' },
  ];
  const { rerender } = render(<WorkspaceOptions language="zh" libraries={libraries} activeId="team" disabled={false} canManage createOpen={false} onSelect={onSelect} onManage={onManage} onCreate={onCreate} />);
  expect(screen.getByRole('button', { name: /TopChurchWorship/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '個人區' }));
  expect(onSelect).toHaveBeenCalledWith('personal');
  await user.click(screen.getByRole('button', { name: '管理成員' }));
  expect(onManage).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '建立團隊' }));
  expect(onCreate).toHaveBeenCalledOnce();
  rerender(<WorkspaceOptions language="zh" libraries={libraries} activeId="team" disabled canManage={false} createOpen onSelect={onSelect} onManage={onManage} onCreate={onCreate} />);
  expect(screen.queryByRole('button', { name: '管理成員' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '個人區' })).toBeDisabled();
});

it('blocks management and creation while the workspace is switching or saving', async () => {
  const user = userEvent.setup();
  const onManage = vi.fn();
  const onCreate = vi.fn();
  const libraries = [{ id: 'team', kind: 'team' as const, name: 'TopWorship', role: 'owner' as const, ownerUserId: 'me', createdAt: '', updatedAt: '' }];
  render(<WorkspaceOptions language="zh" libraries={libraries} activeId="team" disabled canManage createOpen={false} onSelect={vi.fn()} onManage={onManage} onCreate={onCreate} />);
  const manage = screen.getByRole('button', { name: '管理成員' });
  const create = screen.getByRole('button', { name: '建立團隊' });
  expect(manage).toBeDisabled();
  expect(create).toBeDisabled();
  await user.click(manage);
  await user.click(create);
  expect(onManage).not.toHaveBeenCalled();
  expect(onCreate).not.toHaveBeenCalled();
});

const scopeLibraries = (role: LibraryRole): CloudLibrarySummary[] => [
  { id: 'team', kind: 'team', name: 'TopWorship', role, ownerUserId: 'owner', createdAt: '', updatedAt: '' },
];
const scopeSource = {
  userId: 'me',
  projects: [
    { id: 'own-project', name: '我的主日專案', createdBy: 'me', createdAt: 1, updatedAt: 1 },
    { id: 'other-project', name: '其他同工專案', createdBy: 'other', createdAt: 1, updatedAt: 1 },
  ] as Project[],
  setlists: [
    { id: 'own-list', name: '我的歌單', createdBy: 'me', displayMode: 'chord-fixed-key', songs: [], createdAt: 1, updatedAt: 1 },
    { id: 'assigned-list', name: '交給我的歌單', createdBy: 'other', assignedToCurrentUser: true, archived: true, displayMode: 'chord-fixed-key', songs: [], createdAt: 1, updatedAt: 1 },
    { id: 'other-list', name: '其他同工歌單', createdBy: 'other', displayMode: 'chord-fixed-key', songs: [], createdAt: 1, updatedAt: 1 },
  ] as Setlist[],
};
const scopeProps = { language: 'zh' as const, activeId: 'team', disabled: false, canManage: false, createOpen: false, onSelect: vi.fn(), onManage: vi.fn(), onCreate: vi.fn() };

it('lets a setlist manager disclose only their own projects and owned or assigned setlists', async () => {
  const user = userEvent.setup();
  render(<WorkspaceOptions {...scopeProps} libraries={scopeLibraries('setlist_manager')} activeScope={scopeSource} />);
  const disclosure = screen.getByText('我的管理範圍').closest('details')!;
  expect(disclosure).not.toHaveAttribute('open');
  await user.click(screen.getByText('我的管理範圍'));
  expect(disclosure).toHaveAttribute('open');
  expect(within(disclosure).getByText('自己建立的專案 · 1')).toBeVisible();
  expect(within(disclosure).getByText('可管理的歌單 · 2')).toBeVisible();
  expect(within(disclosure).getByText('我的主日專案')).toBeVisible();
  expect(within(disclosure).getByText('我的歌單')).toBeVisible();
  expect(within(disclosure).getByText('交給我的歌單')).toBeVisible();
  expect(within(disclosure).getByText('被指派 · 已封存')).toBeVisible();
  expect(within(disclosure).queryByText('其他同工專案')).not.toBeInTheDocument();
  expect(within(disclosure).queryByText('其他同工歌單')).not.toBeInTheDocument();
  expect(within(disclosure).getByText(/不能修改歌詞、和弦或段落/)).toBeVisible();
});

it('shows administrators all scopes and viewers their personal capo boundary', () => {
  const { rerender } = render(<WorkspaceOptions {...scopeProps} libraries={scopeLibraries('admin')} activeScope={scopeSource} />);
  expect(screen.getByText('全部專案 · 2')).toBeInTheDocument();
  expect(screen.getByText('全部歌單 · 3')).toBeInTheDocument();
  expect(screen.getByText('其他同工專案')).toBeInTheDocument();
  rerender(<WorkspaceOptions {...scopeProps} libraries={scopeLibraries('viewer')} activeScope={scopeSource} />);
  expect(screen.getByText('不能修改共用內容；Capo 只影響自己的畫面。')).toBeInTheDocument();
  expect(screen.queryByText('我的歌單')).not.toBeInTheDocument();
  expect(screen.queryByText(/歌單 · 0/)).not.toBeInTheDocument();
});

it('uses a generic boundary when scope has not loaded and hides team scope in personal workspaces', () => {
  const { rerender } = render(<WorkspaceOptions {...scopeProps} libraries={scopeLibraries('editor')} />);
  expect(screen.getByText('我的管理範圍')).toBeInTheDocument();
  expect(screen.getByText(/可管理團隊歌曲、建立歌單與專案/)).toBeInTheDocument();
  expect(screen.queryByText(/專案 · 0/)).not.toBeInTheDocument();
  rerender(<WorkspaceOptions {...scopeProps} libraries={[{ ...scopeLibraries('owner')[0], kind: 'personal' }]} activeScope={scopeSource} />);
  expect(screen.queryByText('我的管理範圍')).not.toBeInTheDocument();
});
