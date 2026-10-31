import { beforeEach, describe, expect, it } from 'vitest';
import { learnRelative, loadMidiProfiles, MidiRouter, MIDI_PROFILE_KEY, parseMidi, type MidiBindings } from './drummerMidi';
beforeEach(() => localStorage.clear());
describe('MIDI decoding', () => {
  it.each([[1, 127, 'twos-complement'], [1, 65, 'signed-bit'], [65, 63, 'binary-offset'], [17, 15, 'offset-16']])('learns CW %s and CCW %s as %s', (cw, ccw, mode) => {
    expect(learnRelative(Number(cw), Number(ccw))).toEqual({ mode, reversed: false });
    expect(learnRelative(Number(ccw), Number(cw))).toEqual({ mode, reversed: true });
  });
  it('rejects malformed packets and unrecognised direction pairs', () => {
    expect(learnRelative(20, 19)).toBeNull();
    expect(learnRelative(1, 2)).toBeNull();
    for (const bytes of [[0xf8], [0x90, 1, 128], [0x190, 1, 1], [0xa0, 1, 1], [0xb0, 1], [0xb0, -1, 1]]) expect(parseMidi(bytes)).toBeNull();
  });
  it('fires once per momentary press, handles note-off/zero velocity and keeps original timing', () => {
    const router = new MidiRouter(), bindings: MidiBindings = { tap: { type: 'note', channel: 2, number: 40 }, next: { type: 'cc', channel: 0, number: 22 } };
    const send = (data: number[]) => router.receive({ deviceId: 'a', data, timestamp: 123.5 }, bindings);
    expect(send([0x92, 40, 1])).toEqual({ action: 'tap', timestamp: 123.5 });
    expect(send([0x92, 40, 100])).toBeNull(); expect(send([0x82, 40, 20])).toBeNull();
    expect(send([0x92, 40, 90])?.action).toBe('tap'); expect(send([0x92, 40, 0])).toBeNull();
    expect(send([0x91, 40, 90])).toBeNull();
    expect(send([0xb0, 22, 1])?.action).toBe('next'); expect(send([0xb0, 22, 127])).toBeNull();
    send([0xb0, 22, 0]); expect(send([0xb0, 22, 127])?.action).toBe('next');
  });
  it('keeps every relative tick, including identical consecutive values', () => {
    const router = new MidiRouter(), bindings: MidiBindings = { tempo: { type: 'cc', channel: 0, number: 16, mode: 'twos-complement', step: .1 } };
    const send = (value: number) => router.receive({ deviceId: 'a', data: [0xb0, 16, value], timestamp: 1 }, bindings);
    expect([send(1)?.delta, send(1)?.delta, send(127)?.delta]).toEqual([.1, .1, -.1]);
    expect(send(0)).toBeNull();
  });
  it('restores only validated profiles and rejects duplicated control assignments', () => {
    localStorage.setItem(MIDI_PROFILE_KEY, JSON.stringify({ version: 1, activeId: 'a', profiles: [{ id: 'a', name: 'Live', device: { id: 'x', name: 'Device', manufacturer: '' }, bindings: {
      tempo: { type: 'cc', channel: 0, number: 16, mode: 'twos-complement', step: 1000 },
      tap: { type: 'note', channel: 1, number: 10 }, next: { type: 'note', channel: 1, number: 10 }, previous: { type: 'note', channel: 99, number: 5 },
    } }] }));
    const result = loadMidiProfiles(); expect(result.activeId).toBe('a');
    expect(result.profiles[0].bindings.tempo?.step).toBe(1);
    expect(Object.keys(result.profiles[0].bindings).sort()).toEqual(['tap', 'tempo']);
  });
});
