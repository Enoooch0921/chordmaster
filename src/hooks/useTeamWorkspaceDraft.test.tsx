import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTeamWorkspaceDraft } from './useTeamWorkspaceDraft';
import { readTeamDraft, writeTeamDraft } from '../lib/teamDrafts';

const base = { songs: [], setlists: [], projects: [] };
const edited = { ...base, projects: [{ id: 'p', name: 'Draft', createdAt: 1, updatedAt: 2 }] };
const options = { userId: 'u', libraryId: 't', enabled: true, loading: false, dirty: false, workspace: base, baseline: base };

describe('team draft lifecycle', () => {
  beforeEach(() => localStorage.clear());

  it('saves edits even with cloud autosave unavailable and offers them after remount', async () => {
    const first = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true, workspace: edited }));
    await waitFor(() => expect(readTeamDraft('u', 't')?.workspace).toEqual(edited));
    first.unmount();
    const second = renderHook(() => useTeamWorkspaceDraft(options));
    await waitFor(() => expect(second.result.current.pending?.workspace).toEqual(edited));
  });

  it('does not overwrite an unrecovered draft during initial dirty render', () => {
    writeTeamDraft('u', 't', edited, base);
    const hook = renderHook(() => useTeamWorkspaceDraft({ ...options, dirty: true }));
    expect(hook.result.current.pending?.workspace).toEqual(edited);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readTeamDraft('u', 't')?.workspace).toEqual(edited);
  });

  it('does not write a team snapshot into another account during a loading transition', () => {
    const hook = renderHook((props) => useTeamWorkspaceDraft(props), { initialProps: { ...options, dirty: true, workspace: edited } });
    hook.rerender({ ...options, userId: 'other', loading: true, dirty: true, workspace: edited });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readTeamDraft('other', 't')).toBeNull();
  });
});
