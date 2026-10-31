import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDrummerMidi } from './useDrummerMidi';
import { MIDI_PROFILE_KEY } from '../lib/drummerMidi';
import type { MidiConnector, MidiEvents } from '../lib/midiInput';
const device = { id: 'one', name: 'Controller', manufacturer: 'Test' };
beforeEach(() => { localStorage.clear(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
function setup() {
  let events!: MidiEvents;
  const select = vi.fn(async () => {}), dispose = vi.fn(async () => {}), onAction = vi.fn();
  const connector: MidiConnector = vi.fn(async callbacks => { events = callbacks; callbacks.devices([device]); return { select, dispose }; });
  const hook = renderHook(({ open }) => useDrummerMidi({ settingsOpen: open, onAction, connector }), { initialProps: { open: true } });
  const send = (data: number[], deviceId = 'one', timestamp = 1000) => act(() => events.message({ data, deviceId, timestamp }));
  return { ...hook, select, dispose, onAction, connector, send, devices: (list: typeof device[]) => act(() => events.devices(list)) };
}
it('learns a knob, all eight buttons and persists a reusable personal profile without performing during setup', async () => {
  const h = setup(); expect(h.connector).not.toHaveBeenCalled();
  await act(async () => h.result.current.connect()); expect(h.select).toHaveBeenCalledWith('one');
  act(() => h.result.current.learn('tempo'));
  h.send([0xb0, 16, 1]); h.send([0xb0, 16, 1]); h.send([0xb0, 16, 127]); h.send([0xb0, 16, 127]);
  expect(h.result.current.bindings.tempo?.mode).toBe('twos-complement');
  for (const [index, action] of (['tap', 'playPause', 'previous', 'next', 'tempoUp', 'tempoDown', 'previousPage', 'nextPage'] as const).entries()) {
    act(() => h.result.current.learn(action)); h.send([0x90, 36 + index, 100]); h.send([0x80, 36 + index, 0]);
  }
  expect(h.onAction).not.toHaveBeenCalled();
  act(() => h.result.current.save()); expect(h.result.current.notice).toBe('saved');
  expect(JSON.parse(localStorage.getItem(MIDI_PROFILE_KEY)!).profiles[0].bindings.next.number).toBe(39);
  h.rerender({ open: false }); h.send([0xb0, 16, 1]); h.send([0x90, 39, 127], 'one', 4321);
  expect(h.onAction).toHaveBeenLastCalledWith('next', undefined, 4321);
  h.send([0x90, 43, 127]); h.send([0x90, 43, 127]); h.send([0x80, 43, 0]);
  expect(h.onAction.mock.calls.filter(call => call[0] === 'nextPage')).toHaveLength(1);
  h.send([0x90, 42, 127]); expect(h.onAction).toHaveBeenLastCalledWith('previousPage', undefined, 1000);
  h.unmount(); await act(async () => {}); expect(h.dispose).toHaveBeenCalledOnce();
  const restored = setup(); expect(restored.result.current.bindings.tempo?.number).toBe(16); expect(restored.result.current.name).toBe('Controller'); expect(restored.result.current.bindings.nextPage?.number).toBe(43);
});
it('ignores other devices, rejects an absolute knob across centre, prevents conflicts and cancels on unplug', async () => {
  const h = setup(); await act(async () => h.result.current.connect());
  act(() => h.result.current.learn('tempo')); h.send([0xb0, 16, 65]); h.send([0xb0, 16, 63]);
  expect(h.result.current.notice).toBe('relative-required'); expect(h.result.current.bindings.tempo).toBeUndefined();
  act(() => h.result.current.learn('tap')); h.send([0x90, 36, 100], 'another'); expect(h.result.current.bindings.tap).toBeUndefined();
  h.send([0x90, 36, 100]); h.send([0x80, 36, 0]);
  act(() => h.result.current.learn('next')); h.send([0x90, 36, 100]); expect(h.result.current.notice).toBe('conflict:tap');
  h.devices([]); expect(h.result.current.selectedId).toBe(''); expect(h.result.current.learning).toBeNull();
  h.rerender({ open: false }); h.send([0x90, 36, 100]); expect(h.onAction).not.toHaveBeenCalled();
});
it('cleans a permission response arriving after unmount', async () => {
  let finish!: (value: Awaited<ReturnType<MidiConnector>>) => void;
  const dispose = vi.fn(async () => {}), connector: MidiConnector = () => new Promise(resolve => { finish = resolve; });
  const h = renderHook(() => useDrummerMidi({ settingsOpen: true, onAction: vi.fn(), connector }));
  act(() => { void h.result.current.connect(); }); h.unmount();
  await act(async () => finish({ select: vi.fn(), dispose })); expect(dispose).toHaveBeenCalledOnce();
});
it('reports unsupported browsers without fabricating a device', async () => {
  const h = renderHook(() => useDrummerMidi({ settingsOpen: true, onAction: vi.fn(), connector: async () => { throw new Error('midi-unsupported'); } }));
  await act(async () => h.result.current.connect()); expect(h.result.current.notice).toBe('unsupported'); expect(h.result.current.devices).toEqual([]);
});
it('learns and saves keyboard controls without MIDI, ignores typing, modifiers and repeated transport presses', () => {
  const h = setup();
  act(() => h.result.current.setSource('keyboard'));
  const key = (code: string, type = 'keydown', extra = {}) => act(() => window.dispatchEvent(new KeyboardEvent(type, {code, bubbles:true, cancelable:true, ...extra})));
  act(() => h.result.current.learnKey('tap')); key('KeyT'); key('KeyT','keyup');
  act(() => h.result.current.learnKey('tempoUp')); key('Equal'); key('Equal','keyup');
  act(() => h.result.current.learnKey('playPause')); key('KeyT'); expect(h.result.current.notice).toBe('key-conflict:tap'); key('KeyT','keyup'); key('Space'); key('Space','keyup');
  act(() => h.result.current.save()); expect(h.result.current.notice).toBe('saved'); expect(h.connector).not.toHaveBeenCalled();
  key('Space'); key('Space','keyup'); expect(h.onAction).not.toHaveBeenCalled();
  h.rerender({open:false}); key('Space'); key('Space','keydown',{repeat:true}); key('Space','keyup');
  expect(h.onAction).toHaveBeenCalledTimes(1); expect(h.onAction.mock.lastCall?.[0]).toBe('playPause');
  key('Equal'); key('Equal','keydown',{repeat:true}); key('Equal','keyup'); expect(h.onAction).toHaveBeenCalledTimes(3);
  key('KeyT','keydown',{metaKey:true}); expect(h.onAction).toHaveBeenCalledTimes(3);
  const input = document.createElement('input'); document.body.append(input);
  act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',bubbles:true})));
  expect(h.onAction).toHaveBeenCalledTimes(3); input.remove();
  h.unmount(); key('Space'); expect(h.onAction).toHaveBeenCalledTimes(3);
  const restored=setup(); expect(restored.result.current.source).toBe('keyboard'); expect(restored.result.current.keyboard.tap).toBe('KeyT');
});

it('learns, saves and restores page keys, ignores repeats and settings input', () => {
  const h = setup();
  act(() => h.result.current.setSource('keyboard'));
  const key = (code: string, type = 'keydown', repeat = false) => act(() => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, repeat })));
  for (const [action, code] of [['previousPage','PageUp'],['nextPage','PageDown']] as const) {
    act(() => h.result.current.learnKey(action)); key(code); key(code, 'keyup');
  }
  act(() => h.result.current.save());
  key('PageDown'); key('PageDown', 'keyup'); expect(h.onAction).not.toHaveBeenCalled();
  h.rerender({open:false});
  key('PageDown'); key('PageDown', 'keydown', true); key('PageDown', 'keyup');
  expect(h.onAction).toHaveBeenCalledTimes(1);
  expect(h.onAction.mock.lastCall?.[0]).toBe('nextPage');
  key('PageUp'); key('PageUp', 'keyup');
  expect(h.onAction.mock.lastCall?.[0]).toBe('previousPage');
  h.unmount();
  const restored = setup();
  expect(restored.result.current.keyboard).toMatchObject({previousPage:'PageUp',nextPage:'PageDown'});
});
