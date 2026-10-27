import { useEffect } from 'react';
import type { HistoryGestureSession } from './useThreeFingerHistory';

interface SongHistoryShortcutsOptions {
  enabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  gestureSession?: { current: HistoryGestureSession };
}

// Owned by the sheet screen, so closing a child editor does not remove undo.
export function useSongHistoryShortcuts({ enabled, onUndo, onRedo, gestureSession }: SongHistoryShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const acceptsTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      if (element?.closest('[role="dialog"], [aria-modal="true"]') && !element.closest('[data-preview-bar-editor]')) return false;
      const isTextEntry = element?.isContentEditable || element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
      return !isTextEntry || Boolean(element?.closest('[data-song-history-input], [data-preview-chord-capture]'));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      // SongEditor writes directly to song history; the preview chord capture
      // writes to draft history. Other text fields keep their native undo.
      if (!acceptsTarget(event.target)) return;

      event.preventDefault();
      if (key === 'y' || event.shiftKey) onRedo();
      else onUndo();
    };
    const handleBeforeInput = (event: InputEvent) => {
      if (event.defaultPrevented || !event.cancelable || event.isComposing || !acceptsTarget(event.target)) return;
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      event.preventDefault();
      const direction=event.inputType==='historyUndo'?'undo':'redo',session=gestureSession?.current;
      if(session && (session.active || performance.now()-session.finishedAt<350)) {
        if(session.handled && session.direction===direction)return;
        session.handled=true;session.direction=direction;session.finishedAt=performance.now();
      }
      if (event.inputType === 'historyRedo') onRedo(); else onUndo();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeinput', handleBeforeInput);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('beforeinput', handleBeforeInput); };
  }, [enabled, onUndo, onRedo, gestureSession]);
}
