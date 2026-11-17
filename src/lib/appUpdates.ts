const activationError = () => new Error(
  '新版尚未切換完成。請確認內容已同步，關閉所有 ChordMaster 視窗後重新開啟；不需要清除瀏覽器資料。 / The new version has not taken over. After syncing, close all ChordMaster windows and reopen the app. Do not clear browser data.'
);

/** Installed updates are offered explicitly; changing controllers never reloads other tabs. */
export function createAppUpdates(
  container: ServiceWorkerContainer | undefined,
  reload: () => void = () => window.location.reload(),
) {
  let registration: ServiceWorkerRegistration | undefined;
  let ready = false;
  let controller = container?.controller;
  let pageController = controller;
  let pageActiveWorker: ServiceWorker | null | undefined;
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
      pageActiveWorker = registration.active;
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
        // Another tab can activate the update while this tab saves. Navigation
        // can use that active worker even if controllerchange was missed here.
        const hasNewActiveWorker = () => Boolean(registration?.active
          && registration.active !== pageActiveWorker && registration.active.state === 'activated');
        const hasNewController = () => Boolean(container.controller && container.controller !== pageController);
        if (registration.waiting || (!hasNewActiveWorker() && !hasNewController())) {
          let target = registration.waiting ?? registration.installing;
          if (!target) throw activationError();
          await new Promise<void>((resolve, reject) => {
            const workers = new Set<ServiceWorker>();
            let requested: ServiceWorker | null = null;
            let lastRequest = 0;
            const cleanup = () => {
              window.clearTimeout(timer);
              window.clearInterval(poll);
              container.removeEventListener('controllerchange', changed);
              workers.forEach(worker => worker.removeEventListener('statechange', changed));
            };
            const changed = () => {
              if (target?.state === 'activated'
                || (!registration?.waiting && !registration?.installing && (hasNewController() || hasNewActiveWorker()))) {
                cleanup(); resolve(); return;
              }
              const next = registration?.waiting ?? registration?.installing;
              if (next && next !== target) { target = next; requested = null; }
              if (!target || target.state === 'redundant') { cleanup(); reject(activationError()); return; }
              if (!workers.has(target)) {
                workers.add(target);
                target.addEventListener('statechange', changed);
              }
              if (target.state === 'installed' && (requested !== target || Date.now() - lastRequest >= 1_000)) {
                requested = target; lastRequest = Date.now();
                try { target.postMessage({ type: 'CHORDMASTER_ACTIVATE_UPDATE' }); }
                catch (error) { cleanup(); reject(error); }
              }
            };
            const timer = window.setTimeout(() => {
              cleanup(); reject(activationError());
            }, 30_000);
            // Check state as well as events: activation may finish before an
            // event listener is attached, or a background tab may miss it.
            const poll = window.setInterval(changed, 500);
            container.addEventListener('controllerchange', changed);
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
