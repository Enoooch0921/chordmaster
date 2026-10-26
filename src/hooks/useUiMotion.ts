import { useEffect } from 'react';
import { useReducedMotionPreference } from './useReducedMotionPreference';
import type { UiMotionPreference } from '../lib/uiMotion';

let keyboard = false;
let consumers = 0;
const pointerInput = () => {
  if (!keyboard && document.documentElement.dataset.uiInput === 'pointer') return;
  keyboard = false; document.documentElement.dataset.uiInput = 'pointer';
};
const keyboardInput = () => {
  if (keyboard) return;
  keyboard = true; document.documentElement.dataset.uiInput = 'keyboard';
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

/** Read modality during the interaction's own render; key presses never rerender the score. */
export function useUiMotion(): UiMotionPreference {
  const reduced = useReducedMotionPreference();
  useEffect(observeInput, []);
  return { reduced: Boolean(reduced), instant: keyboard };
}
