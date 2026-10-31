import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetronomeConfig } from '../lib/metronome';
import { MediaMetronome as Metronome } from '../lib/mediaMetronome';

export function useMetronome() {
  const engine = useRef<Metronome | null>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  const wantsPlayback = useRef(false), resumeOnVisible = useRef(false);
  const lastConfig = useRef<MetronomeConfig | null>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [notice, setNotice] = useState<'hidden' | 'interrupted' | 'failed' | null>(null);
  const pause = useCallback(() => {
    attempt.current++;
    engine.current?.stop();
    setPlaying(false); setStarting(false); setBeat(-1);
  }, []);
  const stop = useCallback(() => {
    wantsPlayback.current = false; resumeOnVisible.current = false;
    pause();
  }, [pause]);
  const interrupted = useCallback(() => {
    pause(); setNotice('interrupted');
  }, [pause]);
  const start = useCallback(async (config: MetronomeConfig, recovery?: { quiet: true; fallbackSound: MetronomeConfig['sound'] }) => {
    const currentAttempt = ++attempt.current;
    wantsPlayback.current = true;
    const previousConfig = lastConfig.current;
    lastConfig.current = config;
    engine.current ??= new Metronome(interrupted);
    const current = engine.current;
    setStarting(true); setNotice(null);
    try {
      let started = false, restored = false;
      try { started = await current.start(config); } catch { /* Report below, or restore a working sound. */ }
      if (!started && recovery && !current.playing && mounted.current && currentAttempt === attempt.current) {
        try { restored = await current.start({ ...config, sound: recovery.fallbackSound }); } catch { /* Keep the stopped state usable. */ }
      }
      if (mounted.current && currentAttempt === attempt.current) {
        if (!started) lastConfig.current = restored && recovery ? { ...config, sound: recovery.fallbackSound } : previousConfig;
        setPlaying(current.playing);
        if (!current.playing) setBeat(-1);
        if (!started && !recovery?.quiet) setNotice('failed');
      }
      return started;
    } finally {
      if (mounted.current && currentAttempt === attempt.current) setStarting(false);
    }
  }, [interrupted]);
  const update = useCallback((config: MetronomeConfig) => {
    if (lastConfig.current) lastConfig.current = { ...config, sound: lastConfig.current.sound };
    engine.current?.update(config);
  }, []);
  const prepare = useCallback(async () => {
    engine.current ??= new Metronome(interrupted);
    try { await engine.current.prepare(); }
    catch { if (mounted.current) setNotice('failed'); }
  }, [interrupted]);

  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      resumeOnVisible.current = wantsPlayback.current && Boolean(lastConfig.current);
      // The media element keeps playing without page timers in the background.
    };
    const show = () => {
      if (document.hidden || !resumeOnVisible.current || !wantsPlayback.current || !lastConfig.current) return;
      resumeOnVisible.current = false;
      if (!engine.current?.playing) void start(lastConfig.current);
    };
    const onVisibility = () => { if (document.hidden) hide(); else show(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      mounted.current = false;
      attempt.current++;
      engine.current?.dispose(); engine.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [pause, start]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => { if (lastConfig.current) void start(lastConfig.current); }],
      ['pause', stop], ['stop', stop],
    ];
    const registered: MediaSessionAction[] = [];
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler); registered.push(action); } catch { /* Optional platform action. */ }
    }
    return () => { for (const action of registered) { try { session.setActionHandler(action, null); } catch { /* Platform changed. */ } } };
  }, [start, stop]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const draw = () => { setBeat(engine.current?.getBeat() ?? -1); frame = requestAnimationFrame(draw); };
    frame = requestAnimationFrame(draw);
    let released = false;
    let lock: WakeLockSentinel | undefined;
    // Best effort on supported browsers; audio does not depend on wake lock support.
    void navigator.wakeLock?.request('screen').then(value => {
      if (released) void value.release().catch(() => {}); else lock = value;
    }).catch(() => {});
    return () => { cancelAnimationFrame(frame); released = true; void lock?.release().catch(() => {}); };
  }, [playing]);
  return { start, stop, update, prepare, playing, starting, beat, notice };
}
