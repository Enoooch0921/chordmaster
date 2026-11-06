import { vi } from 'vitest';

/** Deterministic layout geometry for reader behavior tests. Real CSS is checked in-browser. */
export function mockLyricsReadingGeometry(width = 390, height = 360, measureWrapping = false) {
  const size = { width, height };
  const callbacks = new Set<ResizeObserverCallback>();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('alr-canvas') ? size.width : 794; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('alr-canvas') ? size.height : 600; });
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.closest('.alr-measure')) {
      const ruler = this.closest<HTMLElement>('.alr-measure')!;
      const fontSize = parseFloat(ruler.style.fontSize), leading = fontSize * 1.42;
      const lineHeight = (line: Element) => {
        const columnWidth = parseFloat(ruler.style.width);
        const parallel = line.closest('.alr-pair') && columnWidth >= 540;
        const width = parallel ? (columnWidth - 24) / 2 : columnWidth;
        const ems = Array.from(line.textContent ?? '').reduce((sum, char) => sum + (/\s/.test(char) ? .3 : /[\x00-\x7F]/.test(char) ? .55 : 1), 0);
        return leading * (measureWrapping ? Math.max(1, Math.ceil(ems * fontSize / width)) : 1);
      };
      const rowHeights = Array.from(this.children).map(lineHeight);
      const parallel = this.matches('.alr-pair') && parseFloat(ruler.style.width) >= 540;
      const height = this.matches('h2') ? 20 : this.matches('.alr-line') ? lineHeight(this) : this.matches('.alr-row')
        ? (parallel ? Math.max(0, ...rowHeights) : rowHeights.reduce((sum, height) => sum + height, 0)) : 0;
      return { top: 0, bottom: height, left: 0, right: size.width, width: size.width, height, x: 0, y: 0, toJSON() {} } as DOMRect;
    }
    return original.call(this);
  });
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe() { callbacks.add(this.callback); }
    unobserve() {}
    disconnect() { callbacks.delete(this.callback); }
  });
  return { resize: (width: number, height: number) => { size.width = width; size.height = height; callbacks.forEach(callback => callback([], {} as ResizeObserver)); } };
}
