import { expect, it } from 'vitest';
import { findPreviewAnchor, samePreviewAnchorRect } from './previewAnchor';

it('resolves the requested repeat occurrence and clamps when the arrangement changes', () => {
  const root = document.createElement('div');
  for (let i = 0; i < 3; i++) { const anchor = document.createElement('div'); anchor.dataset.previewEditAnchor = 'entry|section|bar|jianpu|all'; root.append(anchor); }
  expect(findPreviewAnchor(root, 'entry|section|bar|jianpu|all', 1)).toBe(root.children[1]);
  expect(findPreviewAnchor(root, 'entry|section|bar|jianpu|all', 10)).toBe(root.lastElementChild);
  expect(findPreviewAnchor(root, 'missing')).toBeNull();
  expect(samePreviewAnchorRect(new DOMRect(1,2,3,4), new DOMRect(1,2,3,4))).toBe(true);
  expect(samePreviewAnchorRect(new DOMRect(1,2,3,4), new DOMRect(1,3,3,4))).toBe(false);
});
