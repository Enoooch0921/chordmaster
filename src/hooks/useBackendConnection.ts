import { useEffect, useState } from 'react';

export type BackendConnection = 'unknown' | 'checking' | 'online' | 'offline';
type Probe = (signal: AbortSignal) => Promise<void>;
const CHECK_INTERVAL_MS = 30_000;
const CHECK_TIMEOUT_MS = 8_000;

// Service reachability is separate from cached content, pending writes and selection.
export function useBackendConnection(probe: Probe | undefined, scope: string): BackendConnection {
  const [result, setResult] = useState<{ scope: string; status: BackendConnection }>({ scope, status: 'checking' });
  useEffect(() => {
    if (!probe) return;
    let disposed = false;
    let generation = 0;
    let inFlight = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const report = (status: BackendConnection) => setResult(previous => previous.scope === scope && previous.status === status ? previous : { scope, status });
    report(navigator.onLine === false ? 'offline' : 'checking');
    const check = async () => {
      clearTimeout(timer);
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      if (navigator.onLine === false) { report('offline'); return; }
      inFlight = true;
      const attempt = ++generation;
      controller = new AbortController();
      const signal = controller.signal;
      try {
        await Promise.race([
          probe(signal),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => {
              controller?.abort();
              reject(new Error('Connection check timed out'));
            }, CHECK_TIMEOUT_MS);
          })
        ]);
        if (!disposed && attempt === generation) report('online');
      } catch {
        if (!disposed && attempt === generation) report('offline');
      } finally {
        if (attempt === generation) {
          clearTimeout(deadline);
          inFlight = false;
          if (!disposed) timer = setTimeout(() => void check(), CHECK_INTERVAL_MS);
        }
      }
    };
    const resume = () => {
      if (document.visibilityState === 'hidden') { clearTimeout(timer); return; }
      void check();
    };
    const offline = () => {
      ++generation;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller?.abort();
      inFlight = false;
      report('offline');
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    void check();
    return () => {
      disposed = true;
      ++generation;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller?.abort();
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [probe, scope]);
  return !probe ? 'unknown' : result.scope === scope ? result.status : 'checking';
}
