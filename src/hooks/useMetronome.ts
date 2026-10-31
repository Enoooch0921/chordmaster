import { useCallback, useEffect, useRef, useState } from 'react';
import { Metronome, type MetronomeConfig } from '../lib/metronome';

export function useMetronome() {
  const engine = useRef<Metronome | null>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [notice, setNotice] = useState<'hidden' | 'interrupted' | 'failed' | null>(null);
  const stop = useCallback(() => {
    attempt.current++;
    engine.current?.stop();
    setPlaying(false); setStarting(false); setBeat(-1);
  }, []);
  const start = useCallback(async (config: MetronomeConfig) => {
    const currentAttempt = ++attempt.current;
    engine.current ??= new Metronome(() => {
      stop(); setNotice('interrupted');
    });
    setStarting(true); setNotice(null);
    try {
      const started = await engine.current.start(config);
      if (mounted.current && currentAttempt === attempt.current) setPlaying(started);
    } catch {
      if (mounted.current && currentAttempt === attempt.current) { stop(); setNotice('failed'); }
    } finally {
      if (mounted.current && currentAttempt === attempt.current) setStarting(false);
    }
  }, [stop]);
  const update = useCallback((config: MetronomeConfig) => engine.current?.update(config), []);
  const prepare = useCallback(async () => {
    engine.current ??= new Metronome(() => { stop(); setNotice('interrupted'); });
    try { await engine.current.prepare(); }
    catch { if (mounted.current) setNotice('failed'); }
  }, [stop]);

  useEffect(() => {
    mounted.current = true;
    const onHidden = () => {
      if (document.hidden && engine.current) {
        const active = engine.current.playing;
        stop();
        if (active) setNotice('hidden');
      }
    };
    const onPageHide = () => { stop(); setNotice('hidden'); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mounted.current = false;
      attempt.current++;
      engine.current?.dispose(); engine.current = null;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [stop]);

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
