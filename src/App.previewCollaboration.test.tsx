import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import type { WorkspaceSnapshot } from './types';

const collaboration = vi.hoisted(() => ({ refresh: vi.fn(() => false), joined: vi.fn(() => false), presence: vi.fn(() => ({ editors: [], failed: false })) }));
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async importOriginal => ({ ...await importOriginal<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: collaboration.refresh }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: collaboration.joined }));
vi.mock('./hooks/useSongEditingPresence', () => ({ useSongEditingPresence: collaboration.presence }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  fixture = { songs: [{ id: 'preview-song', updatedAt: 1, title: '預覽同步測試', tempo: 72,
    originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
    sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }] }],
    setlists: [], projects: [], joinedSetlists: [], joinedProjects: [], lastSavedAt: 1 };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'songs');
});
afterEach(() => localStorage.clear());
const latestRefresh = () => (collaboration.refresh.mock.calls.at(-1) as unknown as [Parameters<typeof import('./hooks/useLibraryWorkspaceRefresh').useLibraryWorkspaceRefresh>[0]])[0];
const latestPresence = () => (collaboration.presence.mock.calls.at(-1) as unknown as [Parameters<typeof import('./hooks/useSongEditingPresence').useSongEditingPresence>[0]])[0];
const view = () => <MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>;
const expectProtected = () => {
  expect(latestRefresh().paused).toBe(true);
  expect((collaboration.joined.mock.calls.at(-1) as unknown as [{ paused: boolean }])[0].paused).toBe(true);
  expect(latestRefresh().canApply()).toBe(false);
  expect(latestPresence().editingSongId).toBe('preview-song');
};

describe('preview-first collaboration activity', () => {
  it('protects a clean preview bar immediately, keeps its draft, and stops presence on cancel', async () => {
    render(view()); await screen.findAllByText('預覽同步測試');
    fireEvent.click(document.querySelector('[data-preview-slot-index="0"]')!);
    const chord = await screen.findByRole('textbox', { name: '和弦直接輸入' });
    expectProtected();
    fireEvent.change(chord, { target: { value: 'Dm' } });
    expectProtected(); expect(chord).toHaveValue('Dm');
    expect(latestRefresh().workspace.songs.find(song => song.id === 'preview-song')!.sections[0].bars[0].chords).toEqual(['C']);
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(latestPresence().editingSongId).toBeNull();
  });

  it.each(['title', 'tempo'])('protects a local %s input in the preview before it has changed the stored song', async field => {
    const { rerender } = render(view()); await screen.findAllByText('預覽同步測試');
    const anchor = document.querySelector(`[data-preview-edit-hit$="|meta|${field}"], [data-preview-edit-anchor$="|meta|${field}"]`)!;
    expect(anchor).not.toBeNull(); fireEvent.click(anchor);
    await waitFor(() => expect(document.querySelector('[data-wysiwyg-autofocus]')).not.toBeNull());
    const input = document.querySelector('[data-wysiwyg-autofocus]') as HTMLInputElement;
    expectProtected();
    const draft = field === 'title' ? '本機未送出的歌名' : '96';
    input.focus(); fireEvent.change(input, { target: { value: draft } }); input.setSelectionRange(1, 1);
    expect(latestRefresh().workspace.songs.find(song => song.id === 'preview-song')!.title).toBe('預覽同步測試');
    await act(async () => { window.dispatchEvent(new Event('focus')); rerender(view()); });
    expect(document.querySelector('[data-wysiwyg-autofocus]')).toBe(input);
    expect(input).toHaveFocus(); expect(input).toHaveValue(draft); expect(input.selectionStart).toBe(1);
    expectProtected();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(latestPresence().editingSongId).toBeNull());
  });
});
