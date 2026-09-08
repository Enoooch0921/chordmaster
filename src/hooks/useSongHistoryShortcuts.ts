import { useEffect } from 'react';

interface SongHistoryShortcutsOptions {
  enabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

// Owned by the sheet screen, so closing a child editor does not remove undo.
export function useSongHistoryShortcuts({ enabled, onUndo, onRedo }: SongHistoryShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('[role="dialog"], [aria-modal="true"]') && !target.closest('[data-preview-bar-editor]')) return;
      const isTextEntry = target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
      // SongEditor writes directly to song history; the preview chord capture
      // writes to draft history. Other text fields keep their native undo.
      if (isTextEntry && !target?.closest('[data-song-history-input], [data-preview-chord-capture]')) return;

      event.preventDefault();
      if (key === 'y' || event.shiftKey) onRedo();
      else onUndo();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onUndo, onRedo]);
}
