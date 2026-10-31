import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ isNative: false, start: vi.fn(), selectInput: vi.fn(), stop: vi.fn(), addListener: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative, getPlatform: () => 'ios' }, registerPlugin: () => native }));
import { connectMidi } from './midiInput';
beforeEach(() => { native.isNative = false; vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('selects only the requested web input, keeps event timestamps and releases ports/listeners', async () => {
  const input = { id: 'a', name: 'Pads', manufacturer: 'Demo', state: 'connected', open: vi.fn().mockResolvedValue(null), close: vi.fn().mockResolvedValue(null), onmidimessage: null as ((event: {data: Uint8Array;timeStamp:number})=>void) | null };
  const access = Object.assign(new EventTarget(), { inputs: new Map([['a',input]]) });
  const request = vi.fn().mockResolvedValue(access); vi.stubGlobal('navigator', { requestMIDIAccess: request });
  const events={devices:vi.fn(),message:vi.fn()}, connection=await connectMidi(events);
  expect(request).toHaveBeenCalledWith({sysex:false}); expect(events.devices.mock.lastCall?.[0]).toEqual([{id:'a',name:'Pads',manufacturer:'Demo'}]);
  await connection.select('a'); const receive=input.onmidimessage!;
  receive({data:new Uint8Array([0x90,36,127]),timeStamp:501}); expect(events.message.mock.lastCall?.[0].timestamp).toBe(501);
  await connection.select(null); expect(input.close).toHaveBeenCalledOnce(); expect(input.onmidimessage).toBeNull();
  receive({data:new Uint8Array([0x90,36,127]),timeStamp:999}); expect(events.message).toHaveBeenCalledOnce();
  await connection.dispose(); access.dispatchEvent(new Event('statechange')); expect(events.devices).toHaveBeenCalledOnce();
});
it('filters stale native sessions and translates packet timestamps without callback jitter', async () => {
  native.isNative=true;
  const callbacks: Record<string,(value:unknown)=>void>={}, remove=vi.fn().mockResolvedValue(undefined);
  native.addListener.mockImplementation(async (event, callback)=> {callbacks[event]=callback;return {remove};});
  native.start.mockResolvedValue({session:'current',devices:[],now:10000});
  vi.spyOn(performance,'now').mockReturnValueOnce(100).mockReturnValueOnce(120);
  const events={devices:vi.fn(),message:vi.fn()}, connection=await connectMidi(events);
  callbacks.messages({session:'old',deviceId:'a',messages:[{data:[0x90,36,127],timestamp:10000}]});
  expect(events.message).not.toHaveBeenCalled();
  callbacks.messages({session:'current',deviceId:'a',messages:[{data:[0x90,36,127],timestamp:10000},{data:[0x90,36,127],timestamp:10500}]});
  expect(events.message.mock.calls.map(call=>call[0].timestamp)).toEqual([110,610]);
  await connection.select('a');expect(native.selectInput).toHaveBeenCalledWith({session:'current',id:'a'});
  await connection.dispose();expect(remove).toHaveBeenCalledTimes(2);expect(native.stop).toHaveBeenCalledWith({session:'current'});
  callbacks.messages({session:'current',deviceId:'a',messages:[{data:[0x90,36,127],timestamp:11000}]});expect(events.message).toHaveBeenCalledTimes(2);
});
it('reports unsupported browsers without attempting a native connection', async () => {
  vi.stubGlobal('navigator',{});await expect(connectMidi({devices:vi.fn(),message:vi.fn()})).rejects.toThrow('midi-unsupported');expect(native.start).not.toHaveBeenCalled();
});
