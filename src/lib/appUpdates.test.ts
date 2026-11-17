import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppUpdates } from './appUpdates';

const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup(firstInstall = false) {
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  const container = Object.assign(new EventTarget(), { controller: firstInstall ? null : {} });
  const registration = Object.assign(new EventTarget(), { active: container.controller, waiting: worker as typeof worker | null, installing: null as typeof worker | null, update: vi.fn(async () => {}) });
  const reload = vi.fn();
  const updates = createAppUpdates(container as unknown as ServiceWorkerContainer, reload);
  updates.watch(registration as unknown as ServiceWorkerRegistration);
  disposals.push(updates.dispose);
  const activate = () => { registration.waiting = null; worker.state = 'activated'; registration.active = worker; container.controller = worker; container.dispatchEvent(new Event('controllerchange')); };
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
    const rejected = expect(pending).rejects.toThrow('關閉所有 ChordMaster 視窗');
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    activate(); expect(reload).not.toHaveBeenCalled();
  });
  it('accepts worker activation even when controllerchange never arrives', async () => {
    const { updates, worker, registration, reload } = setup();
    const pending = updates.apply(async () => {});
    await Promise.resolve();
    registration.waiting = null; registration.active = worker; worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    await pending;
    expect(reload).toHaveBeenCalledOnce();
  });
  it('detects activation by polling when both browser events are missed', async () => {
    vi.useFakeTimers();
    const { updates, worker, registration, reload } = setup();
    const pending = updates.apply(async () => {});
    await Promise.resolve();
    registration.waiting = null; registration.active = worker; worker.state = 'activated';
    await vi.advanceTimersByTimeAsync(500); await pending;
    expect(reload).toHaveBeenCalledOnce();
  });
  it('uses an update activated in another tab while saving without changing this controller', async () => {
    const { updates, worker, registration, reload } = setup();
    let saved!: () => void;
    const pending = updates.apply(() => new Promise<void>(resolve => { saved = resolve; }));
    registration.waiting = null; registration.active = worker; worker.state = 'activated';
    expect(reload).not.toHaveBeenCalled();
    saved(); await pending;
    expect(reload).toHaveBeenCalledOnce();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
  it('switches to a replacement worker if another deployment supersedes the waiting update', async () => {
    const { updates, worker, registration, reload } = setup();
    const pending = updates.apply(async () => {});
    await Promise.resolve();
    const replacement = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn(() => {
      registration.waiting = null; registration.active = replacement; replacement.state = 'activated';
      replacement.dispatchEvent(new Event('statechange'));
    }) });
    registration.waiting = replacement; worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange'));
    await pending;
    expect(replacement.postMessage).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
  it('retries a missed activation request and stops polling after success', async () => {
    vi.useFakeTimers();
    const { updates, worker, activate, reload } = setup();
    worker.postMessage.mockImplementationOnce(() => {}).mockImplementation(activate);
    const pending = updates.apply(async () => {});
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000); await pending;
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });
  it('gives recovery steps immediately instead of waiting for a nonexistent worker', async () => {
    const { updates, registration, reload } = setup();
    registration.waiting = null;
    await expect(updates.apply(async () => {})).rejects.toThrow('不需要清除瀏覽器資料');
    expect(registration.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
