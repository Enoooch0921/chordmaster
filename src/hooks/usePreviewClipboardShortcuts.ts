import { useEffect, type RefObject } from 'react';
import { previewClipboardText, type PreviewClipboard } from '../lib/previewClipboard';
import type { PreviewBarSelectionTarget } from '../lib/previewBarSelection';

export interface PreviewClipboardTarget extends PreviewBarSelectionTarget {
  field: string;
  appendToSection?: boolean;
}
export interface RememberedPreviewClipboard {
  content: PreviewClipboard;
  token: string;
  text: string;
}
export type PreviewClipboardRef = RefObject<RememberedPreviewClipboard | null>;
const CLIPBOARD_MIME = 'application/x-chordmaster-preview';

// The token identifies this app's immutable snapshot. Never interpret external
// JSON as chart data, or paste an older chart after the system clipboard changes.
export function rememberPreviewClipboard(ref: PreviewClipboardRef, content: PreviewClipboard, writeSystem = false) {
  const remembered = { content, token: crypto.randomUUID(), text: previewClipboardText(content) };
  ref.current = remembered;
  if (writeSystem) void navigator.clipboard?.writeText(remembered.text).catch(() => undefined);
  return remembered;
}

export function getHoveredPreviewClipboardTarget(): PreviewClipboardTarget | null {
  const add = document.querySelector<HTMLElement>('[data-preview-add-bar-after]:hover');
  if (add?.dataset.previewClipboardIdentity && add.dataset.previewAddBarAfter) {
    return { previewIdentity: add.dataset.previewClipboardIdentity, sectionId: add.dataset.previewAddBarAfter, barId: '', field: 'bars', appendToSection: true };
  }
  const bar = document.querySelector<HTMLElement>('[data-preview-hoverable]:hover');
  if (!bar) return null;
  const { previewClipboardIdentity: previewIdentity, previewClipboardSection: previewSectionId, previewClipboardBar: previewBarId } = bar.dataset;
  if (!previewIdentity || !previewSectionId || !previewBarId) return null;
  const field = bar.querySelector<HTMLElement>('[data-preview-hover-field]:hover')?.dataset.previewHoverField ?? 'bars';
  return { previewIdentity, sectionId: previewSectionId, barId: previewBarId, field };
}

function shouldKeepNativeClipboard(event: ClipboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('[role="dialog"], [aria-modal="true"]') && !target.closest('[data-preview-bar-editor]')) return true;
  const isText = target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
  if (isText && !target?.matches('[data-preview-chord-capture]')) return true;
  if (target instanceof HTMLInputElement && target.selectionStart !== target.selectionEnd) return true;
  return Boolean(window.getSelection()?.toString());
}

interface Options {
  enabled: boolean;
  clipboardRef: PreviewClipboardRef;
  onCopy: (hovered: PreviewClipboardTarget | null) => PreviewClipboard | null;
  onPaste: (content: PreviewClipboard, hovered: PreviewClipboardTarget | null) => void;
  onUnavailable: () => void;
}

export function usePreviewClipboardShortcuts({ enabled, clipboardRef, onCopy, onPaste, onUnavailable }: Options) {
  useEffect(() => {
    if (!enabled) return;
    const copy = (event: ClipboardEvent) => {
      if (event.defaultPrevented || shouldKeepNativeClipboard(event) || !event.clipboardData) return;
      const content = onCopy(getHoveredPreviewClipboardTarget());
      if (!content) return;
      const remembered = rememberPreviewClipboard(clipboardRef, content);
      event.clipboardData.setData('text/plain', remembered.text);
      event.clipboardData.setData(CLIPBOARD_MIME, remembered.token);
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || shouldKeepNativeClipboard(event) || !event.clipboardData) return;
      const remembered = clipboardRef.current;
      const token = event.clipboardData.getData(CLIPBOARD_MIME);
      const text = event.clipboardData.getData('text/plain');
      if (!remembered || (token ? token !== remembered.token : text !== remembered.text)) {
        if (getHoveredPreviewClipboardTarget()) {
          event.preventDefault();
          onUnavailable();
        }
        return;
      }
      event.preventDefault();
      onPaste(remembered.content, getHoveredPreviewClipboardTarget());
    };
    window.addEventListener('copy', copy);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('copy', copy);
      window.removeEventListener('paste', paste);
    };
  }, [enabled, clipboardRef, onCopy, onPaste, onUnavailable]);
}
