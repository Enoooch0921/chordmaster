import { useEffect, useRef, useState } from 'react';
import { bindingConflict, isControlKey, learnRelative, loadMidiProfiles, MIDI_PROFILE_KEY, MidiRouter, parseMidi, sameControl, type KeyboardAction, type KeyboardBindings, type MidiAction, type MidiBinding, type MidiBindings, type MidiDevice, type MidiProfile } from '../lib/drummerMidi';
import { connectMidi, type MidiConnection, type MidiConnector } from '../lib/midiInput';

type Learning = { action: MidiAction; first?: MidiBinding & { value: number }; firstCount?: number; second?: number } | null;
export function useDrummerMidi({ settingsOpen, onAction, connector = connectMidi }: {
  settingsOpen: boolean;
  onAction: (action: MidiAction, delta: number | undefined, timestamp: number) => void;
  connector?: MidiConnector;
}) {
  const [stored] = useState(loadMidiProfiles);
  const initial = stored.profiles.find(p => p.id === stored.activeId);
  const [profiles, setProfiles] = useState(stored.profiles);
  const [profileId, setProfileId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [bindings, setBindings] = useState<MidiBindings>(initial?.bindings ?? {});
  const [source, setSourceState] = useState<'midi' | 'keyboard'>(initial?.device.id === 'keyboard' ? 'keyboard' : 'midi');
  const [keyboard, setKeyboard] = useState<KeyboardBindings>(initial?.keyboard ?? {});
  const [keyLearning, setKeyLearning] = useState<KeyboardAction | null>(null);
  const sourceRef = useRef(source), keyboardRef = useRef(keyboard), keyLearningRef = useRef(keyLearning), heldKeys = useRef(new Set<string>());
  sourceRef.current = source; keyboardRef.current = keyboard; keyLearningRef.current = keyLearning;
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [learning, setLearning] = useState<Learning>(null);
  const [notice, setNotice] = useState('');
  const connection = useRef<MidiConnection | null>(null);
  const generation = useRef(0), mounted = useRef(true);
  const selectQueue = useRef<Promise<void>>(Promise.resolve());
  const deviceRef = useRef<MidiDevice[]>([]), selectedRef = useRef('');
  const learningRef = useRef<Learning>(null), router = useRef(new MidiRouter());
  const bindingsRef = useRef(bindings), settingsRef = useRef(settingsOpen), actionRef = useRef(onAction);
  bindingsRef.current = bindings; settingsRef.current = settingsOpen; actionRef.current = onAction;
  const setLearn = (value: Learning) => { learningRef.current = value; setLearning(value); };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++;
      const old = connection.current; connection.current = null;
      void selectQueue.current.catch(() => {}).then(() => old?.dispose()).catch(() => {});
    };
  }, []);
  useEffect(() => { if (!settingsOpen) { setLearn(null); keyLearningRef.current = null; setKeyLearning(null); } }, [settingsOpen]);
  useEffect(() => {
    const reset = () => { router.current.reset(); heldKeys.current.clear(); if (document.hidden) { setLearn(null); setKeyLearning(null); } };
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (sourceRef.current !== 'keyboard' || document.hidden || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const learn = keyLearningRef.current;
      if (settingsRef.current && !learn) return;
      if (!isControlKey(event.code)) return;
      const wasHeld = heldKeys.current.has(event.code);
      heldKeys.current.add(event.code);
      if (learn) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.repeat || wasHeld) return;
        const conflict = Object.entries(keyboardRef.current).find(([action, code]) => action !== learn && code === event.code)?.[0];
        if (conflict) { setNotice(`key-conflict:${conflict}`); return; }
        const next = { ...keyboardRef.current, [learn]: event.code };
        keyboardRef.current = next; setKeyboard(next); setDirty(true); setNotice('learned');
        keyLearningRef.current = null; setKeyLearning(null); return;
      }
      const action = Object.entries(keyboardRef.current).find(([, code]) => code === event.code)?.[0] as KeyboardAction | undefined;
      if (!action) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (action === 'tempoUp' || action === 'tempoDown') actionRef.current('tempo', action === 'tempoUp' ? 1 : -1, event.timeStamp);
      else if (!event.repeat && !wasHeld) actionRef.current(action, undefined, event.timeStamp);
    };
    const up = (event: KeyboardEvent) => { heldKeys.current.delete(event.code); };
    const blur = () => heldKeys.current.clear();
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, []);

  const selectDevice = async (id: string) => {
    const current = connection.current;
    if (!current) return;
    selectedRef.current = id; setSelectedId(id); setLearn(null); router.current.reset(); setNotice('');
    selectQueue.current = selectQueue.current.catch(() => {}).then(() => current.select(id || null));
    try { await selectQueue.current; }
    catch {
      if (mounted.current && selectedRef.current === id) { selectedRef.current = ''; setSelectedId(''); setNotice('disconnected'); }
    }
  };
  const connect = async () => {
    if (status === 'connecting' || connection.current) return;
    const attempt = ++generation.current;
    setStatus('connecting'); setNotice('');
    try {
      const result = await connector({
        devices: next => {
          if (!mounted.current || attempt !== generation.current) return;
          deviceRef.current = next; setDevices(next);
          if (selectedRef.current && !next.some(d => d.id === selectedRef.current)) {
            selectedRef.current = ''; setSelectedId(''); setLearn(null); router.current.reset(); setNotice('disconnected');
          }
        },
        message: message => {
          if (!mounted.current || attempt !== generation.current || document.hidden || sourceRef.current !== 'midi' || message.deviceId !== selectedRef.current) return;
          const control = parseMidi(message.data);
          if (!control) return;
          const routed = router.current.receive(message, bindingsRef.current);
          const learn = learningRef.current;
          if (learn && settingsRef.current) {
            if (learn.action === 'tempo' && control.type !== 'cc') return;
            if (learn.action !== 'tempo' && !control.pressed) return;
            let binding: MidiBinding = { type: control.type, channel: control.channel, number: control.number };
            if (learn.action === 'tempo') {
              if (!learn.first) { setLearn({ action: 'tempo', first: { ...binding, value: control.value }, firstCount: 1 }); return; }
              if (!sameControl(learn.first, control)) { setNotice('same-knob'); return; }
              // Confirm repeated relative steps in each direction; two absolute
              // values crossing 64 alone are not sufficient evidence.
              if (learn.firstCount === 1) {
                if (learn.first.value === control.value) setLearn({ ...learn, firstCount: 2 });
                else { setNotice('relative-required'); setLearn(null); }
                return;
              }
              if (learn.first.value === control.value) return;
              const relative = learnRelative(learn.first.value, control.value);
              if (!relative || (learn.second !== undefined && learn.second !== control.value)) { setNotice('relative-required'); setLearn(null); return; }
              if (learn.second === undefined) { setLearn({ ...learn, second: control.value }); return; }
              binding = { ...binding, ...relative, step: 1 };
            }
            const conflict = bindingConflict(bindingsRef.current, learn.action, binding);
            if (conflict) { setNotice(`conflict:${conflict}`); setLearn(null); return; }
            const next = { ...bindingsRef.current, [learn.action]: binding };
            bindingsRef.current = next; setBindings(next); setDirty(true); setLearn(null); setNotice('learned');
            return;
          }
          // Configuration is a protected space: incoming controls only monitor/learn.
          if (!settingsRef.current && routed) actionRef.current(routed.action, routed.delta, routed.timestamp);
        },
      });
      if (!mounted.current || attempt !== generation.current) { await result.dispose(); return; }
      connection.current = result; setStatus('ready');
      const saved = profiles.find(p => p.id === profileId)?.device;
      const inputs = deviceRef.current;
      const match = saved && (inputs.find(d => d.id === saved.id) ?? (inputs.filter(d => d.name === saved.name && d.manufacturer === saved.manufacturer).length === 1 ? inputs.find(d => d.name === saved.name && d.manufacturer === saved.manufacturer) : undefined));
      if (match || (!saved && inputs.length === 1)) {
        const device = match || inputs[0];
        if (!name) setName(device.name);
        await selectDevice(device.id);
      }
    } catch (error) {
      if (!mounted.current || attempt !== generation.current) return;
      setStatus('error'); setNotice(error instanceof Error && error.message === 'midi-unsupported' ? 'unsupported' : 'connect-failed');
    }
  };
  const learn = (action: MidiAction) => {
    if (!selectedRef.current) return;
    setNotice(''); setLearn({ action });
  };
  const loadProfile = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    setProfileId(id); setName(profile?.name ?? ''); setBindings(profile?.bindings ?? {});
    setKeyboard(profile?.keyboard ?? {}); keyboardRef.current = profile?.keyboard ?? {};
    setKeyLearning(null); keyLearningRef.current = null; heldKeys.current.clear();
    if (profile) { const nextSource = profile.device.id === 'keyboard' ? 'keyboard' : 'midi'; sourceRef.current = nextSource; setSourceState(nextSource); }
    bindingsRef.current = profile?.bindings ?? {}; setDirty(false); setLearn(null); setNotice(''); router.current.reset();
    if (profile) {
      const match = devices.find(d => d.id === profile.device.id) ?? (devices.filter(d => d.name === profile.device.name && d.manufacturer === profile.device.manufacturer).length === 1 ? devices.find(d => d.name === profile.device.name && d.manufacturer === profile.device.manufacturer) : undefined);
      void selectDevice(match?.id ?? '');
    }
  };
  const save = () => {
    const device = source === 'keyboard' ? { id: 'keyboard', name: 'Computer keyboard', manufacturer: '' } : devices.find(d => d.id === selectedId);
    if (!device || !name.trim() || !(source === 'keyboard' ? Object.keys(keyboard).length : Object.keys(bindings).length)) return;
    const profile: MidiProfile = { id: profileId || crypto.randomUUID(), name: name.trim().slice(0, 60), device, bindings, keyboard };
    const next = [...profiles.filter(p => p.id !== profile.id), profile].slice(-20);
    try {
      localStorage.setItem(MIDI_PROFILE_KEY, JSON.stringify({ version: 1, profiles: next, activeId: profile.id }));
      setProfiles(next); setProfileId(profile.id); setName(profile.name); setDirty(false); setNotice('saved');
    } catch { setNotice('save-failed'); }
  };
  const clearBinding = (action: MidiAction) => {
    const next = { ...bindings }; delete next[action];
    bindingsRef.current = next; setBindings(next); setDirty(true); setLearn(null); router.current.reset();
  };
  const setStep = (step: number) => {
    if (!bindings.tempo) return;
    const next = { ...bindings, tempo: { ...bindings.tempo, step } };
    bindingsRef.current = next; setBindings(next); setDirty(true);
  };
  const setSource = (value: 'midi' | 'keyboard') => {
    if (value === sourceRef.current) return;
    sourceRef.current = value; setSourceState(value); setLearn(null); setKeyLearning(null); keyLearningRef.current = null; heldKeys.current.clear(); router.current.reset(); setNotice('');
    setProfileId(''); setDirty(true); setName(value === 'keyboard' ? '電腦鍵盤' : devices.find(d => d.id === selectedId)?.name ?? '');
  };
  const learnKey = (action: KeyboardAction) => { setNotice(''); heldKeys.current.clear(); keyLearningRef.current = action; setKeyLearning(action); };
  const clearKey = (action: KeyboardAction) => { const next = { ...keyboard }; delete next[action]; keyboardRef.current = next; setKeyboard(next); setDirty(true); setKeyLearning(null); keyLearningRef.current = null; };
  return { profiles, profileId, name, setName: (value: string) => { setName(value); setDirty(true); }, bindings, dirty, status, devices, selectedId, learning, notice, connect, selectDevice, learn, cancelLearn: () => { setLearn(null); setKeyLearning(null); keyLearningRef.current = null; setNotice(''); }, loadProfile, save, clearBinding, setStep, source, setSource, keyboard, keyLearning, learnKey, clearKey };
}
