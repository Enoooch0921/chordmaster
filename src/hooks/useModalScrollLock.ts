import { useLayoutEffect, type RefObject } from 'react';

/** Lock the actual score scroller as well as the page while a sheet is open. */
export function useModalScrollLock(open: boolean, backgroundRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!open) return;
    const elements = [document.documentElement, document.body, backgroundRef.current].filter(
      (element): element is HTMLElement => element !== null
    );
    const previous = elements.map((element) => ({
      element,
      overflow: element.style.overflow,
      overscrollBehavior: element.style.overscrollBehavior
    }));
    for (const element of elements) {
      element.style.overflow = 'hidden';
      element.style.overscrollBehavior = 'none';
    }
    return () => {
      for (const { element, overflow, overscrollBehavior } of previous) {
        element.style.overflow = overflow;
        element.style.overscrollBehavior = overscrollBehavior;
      }
    };
  }, [open, backgroundRef]);
}
