export const MIDI_ACTIONS = ['tempoUp', 'tempoDown', 'tap', 'playPause', 'previous', 'next', 'previousPage', 'nextPage', 'tempo'] as const;
export type MidiAction = typeof MIDI_ACTIONS[number];
export type RelativeMode = 'twos-complement' | 'signed-bit' | 'binary-offset' | 'offset-16';
export type MidiControl = { type: 'cc' | 'note'; channel: number; number: number };
export type MidiBinding = MidiControl & { mode?: RelativeMode; reversed?: boolean; step?: number };
export type MidiBindings = Partial<Record<MidiAction, MidiBinding>>;
export type MidiDevice = { id: string; name: string; manufacturer: string };
export type MidiMessage = { deviceId: string; data: number[]; timestamp: number };
export const KEYBOARD_ACTIONS = ['tempoUp', 'tempoDown', 'tap', 'playPause', 'previous', 'next', 'previousPage', 'nextPage'] as const;
export type KeyboardAction = typeof KEYBOARD_ACTIONS[number];
export type KeyboardBindings = Partial<Record<KeyboardAction, string>>;
export const isControlKey = (code: string) => /^(Key[A-Z]|Digit[0-9]|Space|Page(Up|Down)|Arrow(Up|Down|Left|Right)|Minus|Equal|Comma|Period|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Slash|Backquote)$/.test(code);
export const controlKeyLabel = (code: string) => ({ Space: 'Space', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '−', Equal: '+ / =', Comma: ',', Period: '.', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Slash: '/', Backquote: '`' } as Record<string, string>)[code] ?? code.replace(/^(Key|Digit)/, '');
export type MidiProfile = { id: string; name: string; device: MidiDevice; bindings: MidiBindings; keyboard?: KeyboardBindings };
export const MIDI_PROFILE_KEY = 'chordmaster.drummer-midi.v1';

export function parseMidi(data: number[]): (MidiControl & { value: number; pressed: boolean }) | null {
  if (data.length !== 3 || !data.every(Number.isInteger) || data.slice(1).some(v => v < 0 || v > 127)) return null;
  const status = data[0] & 0xf0;
  if (data[0] < 0x80 || data[0] > 0xbf || ![0x80, 0x90, 0xb0].includes(status)) return null;
  return { type: status === 0xb0 ? 'cc' : 'note', channel: data[0] & 15, number: data[1], value: data[2], pressed: status === 0xb0 ? data[2] > 0 : status === 0x90 && data[2] > 0 };
}
export const sameControl = (a: MidiControl, b: MidiControl) => a.type === b.type && a.channel === b.channel && a.number === b.number;
export function relativeDelta(value: number, mode: RelativeMode) {
  if (mode === 'twos-complement') return value < 64 ? value : value - 128;
  if (mode === 'signed-bit') return value < 64 ? value : -(value - 64);
  if (mode === 'binary-offset') return value - 64;
  return value - 16;
}
export function learnRelative(clockwise: number, counterclockwise: number): Pick<MidiBinding, 'mode' | 'reversed'> | null {
  for (const mode of ['twos-complement', 'signed-bit', 'binary-offset', 'offset-16'] as const) {
    const a = relativeDelta(clockwise, mode), b = relativeDelta(counterclockwise, mode);
    // Small, opposite deltas distinguish the common relative encodings from
    // ordinary absolute knob positions. Unknown encodings are never guessed.
    if (a * b < 0 && Math.abs(a) <= 7 && Math.abs(b) <= 7) return { mode, reversed: a < 0 };
  }
  return null;
}
export function bindingConflict(bindings: MidiBindings, action: MidiAction, control: MidiControl) {
  return MIDI_ACTIONS.find(other => other !== action && bindings[other] && sameControl(bindings[other]!, control));
}

/** Edge-trigger buttons: releases and held/repeated messages cannot double-tap. */
export class MidiRouter {
  private held = new Set<string>();
  reset() { this.held.clear(); }
  receive(message: MidiMessage, bindings: MidiBindings): { action: MidiAction; delta?: number; timestamp: number } | null {
    const control = parseMidi(message.data);
    if (!control) return null;
    const key = `${control.type}:${control.channel}:${control.number}`;
    const wasHeld = this.held.has(key);
    if (control.pressed) this.held.add(key); else this.held.delete(key);
    const action = MIDI_ACTIONS.find(a => bindings[a] && sameControl(bindings[a]!, control));
    if (!action) return null;
    const binding = bindings[action]!;
    if (action === 'tempo') {
      if (control.type !== 'cc' || !binding.mode) return null;
      const delta = relativeDelta(control.value, binding.mode) * (binding.reversed ? -1 : 1) * (binding.step ?? 1);
      return delta ? { action, delta, timestamp: message.timestamp } : null;
    }
    return control.pressed && !wasHeld ? { action, timestamp: message.timestamp } : null;
  }
}

export function loadMidiProfiles(): { profiles: MidiProfile[]; activeId: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(MIDI_PROFILE_KEY) || '{}');
    if (saved.version !== 1 || !Array.isArray(saved.profiles)) return { profiles: [], activeId: '' };
    const profiles: MidiProfile[] = [];
    for (const profile of saved.profiles.slice(0, 20)) {
      if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string' || !profile.name.trim() || !profile.device || !['id', 'name', 'manufacturer'].every(k => typeof profile.device[k] === 'string') || !profile.bindings) continue;
      const bindings: MidiBindings = {};
      for (const action of MIDI_ACTIONS) {
        const b = profile.bindings[action];
        if (!b || !['cc', 'note'].includes(b.type) || !Number.isInteger(b.channel) || b.channel < 0 || b.channel > 15 || !Number.isInteger(b.number) || b.number < 0 || b.number > 127 || bindingConflict(bindings, action, b)) continue;
        if (action === 'tempo' && (b.type !== 'cc' || !['twos-complement', 'signed-bit', 'binary-offset', 'offset-16'].includes(b.mode))) continue;
        bindings[action] = { type: b.type, channel: b.channel, number: b.number, ...(action === 'tempo' ? { mode: b.mode, reversed: b.reversed === true, step: b.step === 0.1 ? 0.1 : 1 } : {}) };
      }
      const keyboard: KeyboardBindings = {};
      for (const action of KEYBOARD_ACTIONS) {
        const code = profile.keyboard?.[action];
        if (typeof code === 'string' && isControlKey(code) && !Object.values(keyboard).includes(code)) keyboard[action] = code;
      }
      profiles.push({ id: profile.id, name: profile.name.slice(0, 60), device: profile.device, bindings, keyboard });
    }
    return { profiles, activeId: profiles.some(p => p.id === saved.activeId) ? saved.activeId : '' };
  } catch { return { profiles: [], activeId: '' }; }
}
