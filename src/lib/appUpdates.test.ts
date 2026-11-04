import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppUpdates } from './appUpdates';

const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup(firstInstall = false) {
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  const container = Object.assign(new EventTarget(), { controller: firstInstall ? null : {} });
  const registration = Object.assign(new EventTarget(), { waiting: worker as typeof worker | null, installing: null as typeof worker | null, update: vi.fn(async () => {}) });
  const reload = vi.fn();
  const updates = createAppUpdates(container as unknown as ServiceWorkerContainer, reload);
  updates.watch(registration as unknown as ServiceWorkerRegistration);
  disposals.push(updates.dispose);
  const activate = () => { registration.waiting = null; container.controller = {}; container.dispatchEvent(new Event('controllerchange')); };
  return { worker, container, registration, reload, updates, activate };
}

describe('explicit app updates', () => {
  it('does not show an update for the first offline installation', () => {
    const { updates, activate, reload } = setup(true);
    expect(updates.getSnapshot()).toBe(false);
    activate();
    expect(updates.getSnapshot()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
  it('shows an already waiting update and offers updates installed later', () => {
    const { updates, registration, worker } = setup();
    expect(updates.getSnapshot()).toBe(true);
    const later = setup(true);
    later.registration.waiting = null;
    later.activate();
    later.worker.state = 'installing';
    later.registration.installing = later.worker;
    later.registration.dispatchEvent(new Event('updatefound'));
    expect(later.updates.getSnapshot()).toBe(false);
    later.registration.waiting = later.worker;
    later.worker.state = 'installed';
    later.worker.dispatchEvent(new Event('statechange'));
    expect(later.updates.getSnapshot()).toBe(true);
    expect(registration.waiting).toBe(worker);
  });
  it('saves before activating, ignores double clicks and reloads exactly once', async () => {
    const { updates, worker, activate, reload } = setup();
    let saved!: () => void;
    const prepare = vi.fn(() => new Promise<void>(resolve => { saved = resolve; }));
    const pending = updates.apply(prepare);
    expect(updates.apply(prepare)).toBe(pending);
    expect(worker.postMessage).not.toHaveBeenCalled();
    saved(); await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'CHORDMASTER_ACTIVATE_UPDATE' });
    expect(reload).not.toHaveBeenCalled();
    activate(); await pending;
    expect(reload).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
  });
  it('keeps edits on save failure and permits retry', async () => {
    const { updates, worker, reload, activate } = setup();
    await expect(updates.apply(async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
    expect(worker.postMessage).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    worker.postMessage.mockImplementation(activate);
    await updates.apply(async () => {});
    expect(reload).toHaveBeenCalledOnce();
  });
  it('does not reload when another tab updates, even while this tab is still saving', async () => {
    const { updates, activate, reload } = setup();
    activate(); expect(reload).not.toHaveBeenCalled();
    let saved!: () => void;
    const pending = updates.apply(() => new Promise<void>(resolve => { saved = resolve; }));
    activate(); expect(reload).not.toHaveBeenCalled();
    saved(); await pending;
    expect(reload).toHaveBeenCalledOnce();
  });
  it('times out without reloading and removes its activation listener', async () => {
    vi.useFakeTimers();
    const { updates, reload, activate } = setup();
    const pending = updates.apply(async () => {});
    const rejected = expect(pending).rejects.toThrow('更新尚未完成');
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    activate(); expect(reload).not.toHaveBeenCalled();
  });
});
