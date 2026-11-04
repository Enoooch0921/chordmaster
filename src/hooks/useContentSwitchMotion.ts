import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useUiMotion } from './useUiMotion';
import { UI_CONTENT_FADE_DURATION, UI_EASE_OUT } from '../lib/uiMotion';

/** Replace content immediately; only its ink fades, without remounting forms. */
export function useContentSwitchMotion(ref: RefObject<HTMLElement | null>, value: string, enabled: boolean) {
  const previous = useRef(value);
  const animation = useRef<Animation | null>(null);
  const preference = useUiMotion();
  useLayoutEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    const node = ref.current;
    if (!enabled || preference.instant || !node) { animation.current?.cancel(); return; }
    if (!changed || typeof node.animate !== 'function') return;
    const from = animation.current?.playState === 'running' ? Number(getComputedStyle(node).opacity) : 0;
    animation.current?.cancel();
    animation.current = node.animate([{ opacity: from }, { opacity: 1 }], {
      duration: UI_CONTENT_FADE_DURATION * 1000, easing: `cubic-bezier(${UI_EASE_OUT.join(',')})`
    });
  }, [value, enabled, preference.instant, ref]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
}
