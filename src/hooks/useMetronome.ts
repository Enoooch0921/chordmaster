import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetronomeConfig } from '../lib/metronome';
import { MediaMetronome as Metronome } from '../lib/mediaMetronome';

export function useMetronome() {
  const engine = useRef<Metronome | null>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  const wantsPlayback = useRef(false), resumeOnVisible = useRef(false);
  const requestRecovery = useRef<(() => void) | null>(null);
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
    pause(); setNotice(null);
  }, [pause]);
  const interrupted = useCallback(() => {
    pause(); setNotice('interrupted');
    resumeOnVisible.current = wantsPlayback.current && Boolean(lastConfig.current);
    requestRecovery.current?.();
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
        if (started || restored) resumeOnVisible.current = false;
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
    let repairing = false, retries = 0, retry: number | undefined;
    const hide = () => {
      resumeOnVisible.current = wantsPlayback.current && Boolean(lastConfig.current);
      retries = 0;
      if (retry !== undefined) window.clearTimeout(retry);
      // Leave the native audio loop running while the page is hidden.
    };
    const show = () => {
      if (!mounted.current || document.hidden || repairing || !resumeOnVisible.current || !wantsPlayback.current || !lastConfig.current) return;
      repairing = true;
      if (retry !== undefined) window.clearTimeout(retry);
      const currentAttempt = ++attempt.current;
      const current = engine.current ??= new Metronome(interrupted);
      setStarting(true); setNotice(null);
      void current.recover(lastConfig.current).catch(() => false).then(recovered => {
        if (!mounted.current || currentAttempt !== attempt.current || !wantsPlayback.current) return;
        if (document.hidden) { resumeOnVisible.current = true; setPlaying(current.playing); return; }
        const ready = recovered && current.playing;
        resumeOnVisible.current = !ready;
        setPlaying(ready); if (!ready) setBeat(-1);
        if (!ready && retries < 2) retry = window.setTimeout(show, [300, 1000][retries++]);
        else if (!ready) setNotice('interrupted');
      }).finally(() => {
        repairing = false;
        if (mounted.current && currentAttempt === attempt.current) setStarting(false);
      });
    };
    const gesture = () => { if (resumeOnVisible.current) { retries = 0; show(); } };
    requestRecovery.current = show;
    const onVisibility = () => { if (document.hidden) hide(); else show(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    window.addEventListener('focus', show);
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    const audioSession = (navigator as Navigator & { audioSession?: EventTarget }).audioSession;
    audioSession?.addEventListener?.('statechange', show);
    return () => {
      mounted.current = false;
      requestRecovery.current = null;
      if (retry !== undefined) window.clearTimeout(retry);
      attempt.current++;
      engine.current?.dispose(); engine.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      window.removeEventListener('focus', show);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      audioSession?.removeEventListener?.('statechange', show);
    };
  }, [interrupted]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || (!playing && !starting)) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => { if (lastConfig.current) void start(lastConfig.current); }],
      ['pause', stop], ['stop', stop],
    ];
    const registered: MediaSessionAction[] = [];
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler); registered.push(action); } catch { /* Optional platform action. */ }
    }
    return () => { for (const action of registered) { try { session.setActionHandler(action, null); } catch { /* Platform changed. */ } } };
  }, [playing, starting, start, stop]);

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
