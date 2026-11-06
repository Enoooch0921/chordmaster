import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';
import type { UiMotionPreference } from '../lib/uiMotion';

let keyboard = false;
let consumers = 0;
const keyboardInterruptions = new Set<() => void>();
const pointerInput = () => {
  if (!keyboard && document.documentElement.dataset.uiInput === 'pointer') return;
  keyboard = false; document.documentElement.dataset.uiInput = 'pointer';
};
const keyboardInput = () => {
  if (keyboard) return;
  keyboard = true; document.documentElement.dataset.uiInput = 'keyboard';
  keyboardInterruptions.forEach(interrupt => interrupt());
};
function observeInput() {
  if (++consumers === 1) {
    document.addEventListener('pointerdown', pointerInput, true);
    document.addEventListener('keydown', keyboardInput, true);
  }
  return () => {
    if (--consumers === 0) {
      document.removeEventListener('pointerdown', pointerInput, true);
      document.removeEventListener('keydown', keyboardInput, true);
      delete document.documentElement.dataset.uiInput;
      keyboard = false;
    }
  };
}
export const isKeyboardInteraction = () => keyboard;
/** Window-capture shortcut handlers can consume an event before the document observer. */
export const markKeyboardInteraction = keyboardInput;

/** Finish active surfaces when a keyboard takes over, without rendering App. */
export function useKeyboardMotionInterrupt(interrupt: () => void) {
  const latest = useRef(interrupt);
  useLayoutEffect(() => { latest.current = interrupt; });
  useEffect(() => {
    const stopObserving = observeInput();
    const notify = () => latest.current();
    keyboardInterruptions.add(notify);
    return () => { keyboardInterruptions.delete(notify); stopObserving(); };
  }, []);
}

/** Read modality during the interaction's own render; key presses never rerender the score. */
export function useUiMotion(): UiMotionPreference {
  const reduced = useReducedMotionPreference();
  useEffect(observeInput, []);
  return { reduced: Boolean(reduced), instant: keyboard };
}
