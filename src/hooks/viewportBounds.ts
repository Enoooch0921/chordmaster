/** Safari can report the previous visual viewport during rotation and fullscreen changes. */
export function fitViewportLayer(element: HTMLElement, keyboardOpen: boolean) {
  const viewport = window.visualViewport;
  const top = keyboardOpen && viewport ? Math.max(0, viewport.offsetTop) : 0;
  const height = keyboardOpen && viewport
    ? `${Math.max(1, Math.min(viewport.height, window.innerHeight - top))}px`
    : typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('height', '100dvh')
      ? `${window.innerHeight}px` : '100dvh';
  if (element.style.height !== height) element.style.height = height;
  if (element.style.top !== `${top}px`) element.style.top = `${top}px`;
}

export function canOpenSoftwareKeyboard(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.inputMode === 'none') return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly
      && (element instanceof HTMLTextAreaElement || /^(text|search|tel|url|email|password|number)$/.test(element.type));
  }
  return element.isContentEditable || element.matches('[contenteditable="true"], [contenteditable=""]');
}

/** The app locks the document. Clear Safari's residual page pan without moving a score or list. */
export function resetLockedDocumentScroll() {
  for (const element of [document.documentElement, document.body]) {
    if (element.scrollTop) element.scrollTop = 0;
    if (element.scrollLeft) element.scrollLeft = 0;
  }
  if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
}
