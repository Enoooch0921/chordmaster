import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { MidiDevice, MidiMessage } from './drummerMidi';

export type MidiEvents = { devices: (devices: MidiDevice[]) => void; message: (message: MidiMessage) => void };
export type MidiConnection = { select: (id: string | null) => Promise<void>; dispose: () => Promise<void> };
export type MidiConnector = (events: MidiEvents) => Promise<MidiConnection>;
interface NativeMidi {
  start(): Promise<{ session: string; devices: MidiDevice[]; now: number }>;
  selectInput(options: { session: string; id: string | null }): Promise<void>;
  stop(options: { session: string }): Promise<void>;
  addListener(event: 'devices', callback: (value: { session: string; devices: MidiDevice[] }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'messages', callback: (value: { session: string; deviceId: string; messages: { data: number[]; timestamp: number }[] }) => void): Promise<PluginListenerHandle>;
}
const nativeMidi = registerPlugin<NativeMidi>('DrummerMIDI');

export const connectMidi: MidiConnector = async events => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    let session = '', offset = 0, disposed = false;
    const listeners: PluginListenerHandle[] = [];
    try {
      listeners.push(await nativeMidi.addListener('devices', value => {
        if (!disposed && value.session === session) events.devices(value.devices);
      }));
      listeners.push(await nativeMidi.addListener('messages', value => {
        if (!disposed && value.session === session) for (const m of value.messages) events.message({ ...m, deviceId: value.deviceId, timestamp: m.timestamp + offset });
      }));
      const before = performance.now();
      const result = await nativeMidi.start();
      session = result.session;
      offset = (before + performance.now()) / 2 - result.now;
      events.devices(result.devices);
      return {
        select: id => nativeMidi.selectInput({ session, id }),
        dispose: async () => {
          disposed = true;
          await Promise.allSettled(listeners.map(listener => listener.remove()));
          await nativeMidi.stop({ session });
        },
      };
    } catch (error) {
      disposed = true;
      await Promise.allSettled(listeners.map(listener => listener.remove()));
      if (session) await nativeMidi.stop({ session }).catch(() => {});
      throw error;
    }
  }
  if (!navigator.requestMIDIAccess) throw new Error('midi-unsupported');
  const access = await navigator.requestMIDIAccess({ sysex: false });
  let selected: MIDIInput | undefined, disposed = false;
  const devicesChanged = () => {
    if (disposed) return;
    events.devices(Array.from(access.inputs.values()).filter(input => input.state === 'connected').map(input => ({ id: input.id, name: input.name || 'MIDI', manufacturer: input.manufacturer || '' })));
  };
  access.addEventListener('statechange', devicesChanged);
  devicesChanged();
  return {
    select: async id => {
      if (selected) { selected.onmidimessage = null; await selected.close(); selected = undefined; }
      if (!id || disposed) return;
      const input = access.inputs.get(id);
      if (!input || input.state !== 'connected') throw new Error('midi-disconnected');
      await input.open();
      if (disposed) { await input.close(); return; }
      selected = input;
      input.onmidimessage = event => {
        if (!disposed && selected === input && event.data) events.message({ deviceId: input.id, data: Array.from(event.data), timestamp: event.timeStamp });
      };
    },
    dispose: async () => {
      disposed = true;
      access.removeEventListener('statechange', devicesChanged);
      if (selected) { selected.onmidimessage = null; await selected.close(); selected = undefined; }
    },
  };
};
