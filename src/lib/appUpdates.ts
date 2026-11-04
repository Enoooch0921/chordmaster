/** Installed updates are offered explicitly; changing controllers never reloads other tabs. */
export function createAppUpdates(
  container: ServiceWorkerContainer | undefined,
  reload: () => void = () => window.location.reload(),
) {
  let registration: ServiceWorkerRegistration | undefined;
  let ready = false;
  let controller = container?.controller;
  let pageController = controller;
  let operation: Promise<void> | null = null;
  let lastCheck = 0;
  const listeners = new Set<() => void>();
  const cleanups: Array<() => void> = [];
  const publish = () => { if (!ready) { ready = true; listeners.forEach(listener => listener()); } };
  const inspect = () => {
    if (registration?.waiting && container?.controller) publish();
  };
  const watchInstalling = () => {
    const worker = registration?.installing;
    if (!worker) return;
    const change = () => { if (worker.state === 'installed' && container?.controller) publish(); };
    worker.addEventListener('statechange', change);
    cleanups.push(() => worker.removeEventListener('statechange', change));
    change();
  };
  const controllerChanged = () => {
    const next = container?.controller;
    if (controller && next !== controller) publish();
    controller = next;
  };
  const check = () => {
    if (!registration || document.visibilityState === 'hidden' || navigator.onLine === false || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    void registration.update().then(inspect).catch(() => { /* Keep the installed offline version. */ });
  };
  return {
    getSnapshot: () => ready,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    watch(next: ServiceWorkerRegistration) {
      if (registration || !container) return;
      registration = next;
      controller = container.controller;
      pageController = controller;
      container.addEventListener('controllerchange', controllerChanged);
      registration.addEventListener('updatefound', watchInstalling);
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
      const interval = window.setInterval(check, 15 * 60_000);
      cleanups.push(() => {
        container.removeEventListener('controllerchange', controllerChanged);
        next.removeEventListener('updatefound', watchInstalling);
        window.removeEventListener('focus', check);
        window.removeEventListener('online', check);
        document.removeEventListener('visibilitychange', check);
        window.clearInterval(interval);
      });
      inspect(); watchInstalling();
    },
    apply(prepare: () => Promise<void>) {
      if (operation) return operation;
      operation = (async () => {
        if (!ready || !container || !registration) throw new Error('尚未有可用的更新。 / No update is ready yet.');
        await prepare();
        const waiting = registration.waiting;
        if (waiting || container.controller === pageController) {
          await new Promise<void>((resolve, reject) => {
            const previous = container.controller;
            const cleanup = () => {
              window.clearTimeout(timer);
              container.removeEventListener('controllerchange', changed);
            };
            const changed = () => {
              if (container.controller && container.controller !== previous) { cleanup(); resolve(); }
            };
            const timer = window.setTimeout(() => {
              cleanup(); reject(new Error('更新尚未完成，請稍後再試。 / Update did not finish. Please try again.'));
            }, 30_000);
            container.addEventListener('controllerchange', changed);
            try { waiting?.postMessage({ type: 'CHORDMASTER_ACTIVATE_UPDATE' }); }
            catch (error) { cleanup(); reject(error); }
            changed();
          });
        }
        reload();
      })().finally(() => { operation = null; });
      return operation;
    },
    dispose() { cleanups.splice(0).forEach(cleanup => cleanup()); listeners.clear(); },
  };
}

export const appUpdates = createAppUpdates(typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined);
