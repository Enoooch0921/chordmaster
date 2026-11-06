/** Repeated setlist sections share score IDs; their UI anchors remain distinct occurrences. */
export function findPreviewAnchor(root: ParentNode | null, key: string, occurrence = 0): HTMLElement | null {
  if (!root) return null;
  const escaped = globalThis.CSS?.escape?.(key);
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(escaped
    ? `[data-preview-edit-anchor="${escaped}"]` : '[data-preview-edit-anchor]'))
    .filter(node => node.dataset.previewEditAnchor === key);
  return candidates[Math.max(0, Math.min(candidates.length - 1, occurrence))] ?? null;
}

export function samePreviewAnchorRect(a: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, b: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
