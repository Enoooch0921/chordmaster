import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeamWorkspaceDraft } from './useTeamWorkspaceDraft';
import { readTeamDraft, writeTeamDraft } from '../lib/teamDrafts';

const base = { songs: [], setlists: [], projects: [] };
const edited = { ...base, projects: [{ id: 'p', name: 'Draft', createdAt: 1, updatedAt: 2 }] };
const options = { userId: 'u', libraryId: 't', enabled: true, loading: false, dirty: false, workspace: base, baseline: base };

describe('team draft lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('saves edits even with cloud autosave unavailable and offers them after remount', async () => {
    const first = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true, workspace: edited }));
    await waitFor(async () => expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited));
    first.unmount();
    const second = renderHook(() => useTeamWorkspaceDraft(options));
    await waitFor(() => expect(second.result.current.pending?.workspace).toEqual(edited));
  });

  it('waits for recovery before writing an initially dirty render or pagehide', async () => {
    await writeTeamDraft('u', 't', edited, base);
    const hook = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true }));
    expect(hook.result.current.ready).toBe(false);
    act(() => window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect(hook.result.current.pending?.workspace).toEqual(edited));
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited);
  });

  it('does not write a team snapshot into another account during a loading transition', async () => {
    const hook = renderHook((props) => useTeamWorkspaceDraft(props), { initialProps: { ...options, dirty: true, workspace: edited } });
    hook.rerender({ ...options, userId: 'other', loading: true, dirty: true, workspace: edited });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(await readTeamDraft('other', 't')).toBeNull();
    expect(hook.result.current.pending).toBeNull();
  });

  it('recovers from a transient write failure on reconnect without user intervention', async () => {
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const hook = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true, workspace: edited }));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    fail.mockRestore();
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.error).toBeNull());
    expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited);
    expect(hook.result.current.pending).toBeNull();
  });

  it('automatically retries a failed write without a reconnect or another edit', async () => {
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('Temporary failure'); });
    const hook = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true, workspace: edited }));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    fail.mockRestore();
    await waitFor(() => expect(hook.result.current.error).toBeNull(), { timeout: 7000 });
    expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited);
    expect(hook.result.current.pending).toBeNull();
  }, 10000);

  it('clears the local failure warning once the workspace is saved to the cloud', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const hook = renderHook((props) => useTeamWorkspaceDraft(props), { initialProps: { ...options, dirty: true, workspace: edited } });
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    hook.rerender({ ...options, dirty: false, workspace: edited, baseline: edited });
    await waitFor(() => expect(hook.result.current.error).toBeNull());
  });

  it('retries failed reads on reconnect without treating its subsequent edits as recovery', async () => {
    const failure = vi.spyOn(IDBFactory.prototype, 'open').mockImplementation(() => { throw new Error('Unavailable'); });
    const hook = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true, workspace: edited }));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    expect(hook.result.current.ready).toBe(false);
    failure.mockRestore();
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await waitFor(async () => expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited));
    expect(hook.result.current.pending).toBeNull();
    expect(hook.result.current.error).toBeNull();
  });

  it('resumes backup after restoring a pending draft', async () => {
    await writeTeamDraft('u', 't', edited, base);
    const hook = renderHook((props) => useTeamWorkspaceDraft(props), { initialProps: options });
    await waitFor(() => expect(hook.result.current.pending).not.toBeNull());
    act(() => hook.result.current.restored());
    hook.rerender({ ...options, dirty: true, workspace: edited });
    await waitFor(() => expect(hook.result.current.pending).toBeNull());
    expect((await readTeamDraft('u', 't'))?.workspace).toEqual(edited);
  });
});
