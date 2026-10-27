import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  loadNavigationLocation, resolveNavigationLocation, saveNavigationLocation,
  type NavigationWorkspace, type SetlistNavigationLocation
} from '../lib/setlistNavigationMemory';

interface Options {
  storageKey: string | null;
  ready: boolean;
  workspace: NavigationWorkspace;
  current: SetlistNavigationLocation;
  legacy: SetlistNavigationLocation;
  explicitSetlistId: string | null;
  onRestore: (location: SetlistNavigationLocation) => void;
}

export function useSetlistNavigationMemory(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const explicitLinkHandled = useRef(false);
  const { storageKey, ready, workspace } = options;
  useLayoutEffect(() => {
    if (!ready || !storageKey || restoredKey === storageKey) return;
    const value = latest.current;
    // An explicit accessible link takes precedence over a remembered location.
    if (explicitLinkHandled.current || !value.explicitSetlistId || value.explicitSetlistId !== value.current.setlistId) {
      const remembered = loadNavigationLocation(storageKey)
        ?? { ...value.legacy, workspaceMode: value.current.workspaceMode };
      value.onRestore(resolveNavigationLocation(remembered, workspace));
    } else {
      explicitLinkHandled.current = true;
    }
    setRestoredKey(storageKey);
  }, [ready, restoredKey, storageKey, workspace]);

  const serialized = JSON.stringify(options.current);
  useEffect(() => {
    // Restore first; the render containing the restored state may save it.
    // Pre-auth, partial-cache and library-switch renders never replace memory.
    if (ready && storageKey && restoredKey === storageKey) {
      saveNavigationLocation(storageKey, JSON.parse(serialized));
    }
  }, [ready, restoredKey, serialized, storageKey]);
  return ready && storageKey !== null && restoredKey === storageKey;
}
