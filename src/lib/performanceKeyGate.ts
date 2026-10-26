const LEGACY_KEYS: Record<number, string> = { 13: 'Enter', 27: 'Escape', 32: 'Space', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
const physicalKey = (event: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'which'>) => {
  if (event.code) return event.code === 'NumpadEnter' ? 'Enter' : event.code;
  if ([' ', 'Spacebar', 'Space'].includes(event.key)) return 'Space';
  return LEGACY_KEYS[event.keyCode || event.which] || event.key;
};

/** One turn per press, including long holds; support pedals that send keyup only. */
export const createPerformanceKeyGate = () => {
  const pressed = new Set<string>();
  return {
    accept(event: KeyboardEvent) {
      const key = physicalKey(event);
      if (event.type === 'keydown') {
        pressed.add(key);
        return !event.repeat;
      }
      return !pressed.delete(key);
    },
    reset() { pressed.clear(); }
  };
};
