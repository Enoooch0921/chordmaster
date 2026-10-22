import type { CloudLibrarySummary } from '../types';

const storageKey = (userId: string) => `chordmaster.active-library.${encodeURIComponent(userId)}.v1`;

export const loadActiveLibraryPreference = (userId: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(userId))?.trim() || null;
  } catch {
    return null;
  }
};

export const saveActiveLibraryPreference = (userId: string | undefined, libraryId: string) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), libraryId);
  } catch {
    // Workspace access still works when this browser cannot save preferences.
  }
};

export const resolveInitialLibrary = <T extends Pick<CloudLibrarySummary, 'id' | 'kind'>>(
  libraries: T[],
  { requestedTeamId, rememberedLibraryId }: { requestedTeamId: string | null; rememberedLibraryId: string | null }
): T | null => (
  libraries.find((library) => library.id === requestedTeamId && library.kind === 'team')
  ?? libraries.find((library) => library.id === rememberedLibraryId)
  ?? libraries.find((library) => library.kind === 'personal')
  ?? libraries[0]
  ?? null
);
