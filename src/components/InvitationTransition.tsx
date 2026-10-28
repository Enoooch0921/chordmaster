import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Music2 } from 'lucide-react';
import { UI_DRAWER_EASE } from '../lib/uiMotion';
import { invitationPath, invitationTarget, type InvitationAuthReturn, type InvitationMotion, type InvitationResource } from '../lib/invitationJourney';
import '../styles/invitation.css';

type Destination = 'auth' | 'invite' | 'app';
type DestinationFocus = (routeContent: HTMLElement) => HTMLElement | null;
type Journey = InvitationAuthReturn & { destination: Destination; ticket: number; coveredAt: number; revealing: boolean };
interface TransitionContext {
  pending: Journey | null;
  cover: (resource: InvitationResource, event: MouseEvent<HTMLButtonElement>, destination: 'auth' | 'app') => Promise<number | null>;
  resume: (resource: InvitationAuthReturn) => void;
  ready: (target: string, focusTarget?: DestinationFocus) => void;
  fail: (message: string) => void;
  cancel: () => void;
  isCurrent: (ticket: number) => boolean;
  motion: () => InvitationMotion;
}
// Standalone pages/tests can still navigate without installing a visual overlay.
const Context = createContext<TransitionContext>({ pending: null, cover: async () => 0, resume: () => {}, ready: () => {}, fail: () => {}, cancel: () => {}, isCurrent: () => true, motion: () => 'instant' });
export const useInvitationTransition = () => useContext(Context);
const COVER_EASE = `cubic-bezier(${UI_DRAWER_EASE.join(',')})`;
const REVEAL_EASE = 'cubic-bezier(.77,0,.175,1)';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const currentMotion = (motion: InvitationMotion): InvitationMotion => motion === 'instant' ? motion
  : window.matchMedia?.(reducedMotionQuery).matches ? 'reduced' : motion;

/** Mounted above the routes so a lazy App load never tears down the green cover. */
export function InvitationTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const current = useRef<Journey | null>(null);
  const serial = useRef(0);
  const animations = useRef(new Set<Animation>());
  const content = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const readyTarget = useRef<string | null>(null);
  const destinationFocus = useRef<DestinationFocus | undefined>(undefined);
  const reachedApp = useRef(false);

  const cancel = useCallback(() => {
    serial.current++;
    current.current = null;
    readyTarget.current = null;
    destinationFocus.current = undefined;
    animations.current.forEach(animation => animation.cancel());
    animations.current.clear();
    setPending(null); setError(null); setSlow(false);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true }));
  }, []);
  const animate = useCallback(async (element: HTMLElement | null, frames: Keyframe[], duration: number, easing = COVER_EASE) => {
    if (!element?.animate || duration === 0) return;
    const animation = element.animate(frames, { duration, easing, fill: 'both' });
    animations.current.add(animation);
    await animation.finished.catch(() => undefined);
  }, []);
  const isCurrent = useCallback((ticket: number) => current.current?.ticket === ticket, []);
  const reveal = useCallback(async () => {
    const journey = current.current;
    if (!journey || !journey.coveredAt || journey.revealing) return;
    const target = journey.destination === 'invite' ? `invite:${journey.token}` : invitationTarget(journey);
    if (journey.destination === 'auth' || readyTarget.current !== target) return;
    journey.revealing = true;
    setPending({ ...journey });
    // Give the actual destination one paint behind the opaque cover.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!isCurrent(journey.ticket)) return;
    if (journey.motion === 'full') {
      await animate(gate.current, [{ opacity: 1 }, { opacity: 1 }], Math.max(0, 200 - (Date.now() - journey.coveredAt)));
    }
    if (!isCurrent(journey.ticket)) return;
    // The preference may have changed while waiting for the destination/hold.
    if (journey.motion === 'full') {
      await Promise.all([
        animate(title.current, [{ opacity: 1 }, { opacity: 0 }], 200),
        animate(left.current, [{ transform: 'translateX(0) rotateY(0deg)' }, { transform: 'translateX(-100%) rotateY(-55deg)' }], 650, REVEAL_EASE),
        animate(right.current, [{ transform: 'translateX(0) rotateY(0deg)' }, { transform: 'translateX(100%) rotateY(55deg)' }], 650, REVEAL_EASE),
        animate(content.current, [{ transform: 'translateY(12px) scale(.96)' }, { transform: 'translateY(0) scale(1)' }], 650, REVEAL_EASE)
      ]);
    } else if (journey.motion === 'reduced') {
      await animate(gate.current, [{ opacity: 1 }, { opacity: 0 }], 125);
    }
    if (isCurrent(journey.ticket)) {
      const focusTarget = destinationFocus.current;
      cancel();
      requestAnimationFrame(() => {
        const heading = content.current ? focusTarget?.(content.current) ?? content.current.querySelector<HTMLElement>('.invitation-page h1') : null;
        if (heading) {
          if (!heading.matches('input, select, textarea, button, a[href]')) {
            heading.setAttribute('tabindex', '-1'); heading.dataset.invitationFocus = '';
          }
          heading.focus({ preventScroll: true });
        }
      });
    }
  }, [animate, cancel, isCurrent]);

  const cover = useCallback(async (resource: InvitationResource, event: MouseEvent<HTMLButtonElement>, destination: 'auth' | 'app') => {
    if (current.current) return null;
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    trigger.current = button;
    const motion = currentMotion(event.detail === 0 ? 'instant' : 'full');
    const journey: Journey = { ...resource, motion, destination, ticket: ++serial.current, coveredAt: 0, revealing: false };
    current.current = journey; readyTarget.current = null; destinationFocus.current = undefined; reachedApp.current = false;
    flushSync(() => { setPending(journey); setError(null); setSlow(false); });
    if (motion === 'full') {
      await Promise.all([
        animate(gate.current, [
          { clipPath: `inset(${Math.max(0, rect.top)}px ${Math.max(0, window.innerWidth - rect.right)}px ${Math.max(0, window.innerHeight - rect.bottom)}px ${Math.max(0, rect.left)}px round 12px)` },
          { clipPath: 'inset(0px 0px 0px 0px round 0px)' }
        ], 500),
        animate(title.current, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], 500)
      ]);
    } else if (motion === 'reduced') {
      await animate(gate.current, [{ opacity: 0 }, { opacity: 1 }], 125);
    }
    if (!isCurrent(journey.ticket)) return null;
    journey.coveredAt = Date.now();
    // Outbound Google also gets a settled frame, even on a fast connection.
    if (destination === 'auth' && journey.motion === 'full') await animate(gate.current, [{ opacity: 1 }, { opacity: 1 }], 200);
    return isCurrent(journey.ticket) ? journey.ticket : null;
  }, [animate, isCurrent]);
  const resume = useCallback((resource: InvitationAuthReturn) => {
    animations.current.forEach(animation => animation.cancel()); animations.current.clear();
    const journey: Journey = { ...resource, motion: currentMotion(resource.motion), destination: 'invite', ticket: ++serial.current, coveredAt: Date.now(), revealing: false };
    current.current = journey; readyTarget.current = null; destinationFocus.current = undefined; reachedApp.current = false;
    setPending(journey); setError(null); setSlow(false);
  }, []);
  const ready = useCallback((target: string, focusTarget?: DestinationFocus) => {
    readyTarget.current = target; destinationFocus.current = focusTarget; void reveal();
  }, [reveal]);
  const fail = useCallback((message: string) => { if (current.current) setError(message); }, []);

  useEffect(() => {
    const media = window.matchMedia?.(reducedMotionQuery);
    const reduce = () => {
      const journey = current.current;
      if (!media?.matches || !journey || journey.motion !== 'full') return;
      journey.motion = 'reduced';
      // Cancelling resolves any in-flight cover/hold/reveal awaits without
      // leaving transformed content or a partial clip behind.
      animations.current.forEach(animation => animation.cancel());
      animations.current.clear();
      setPending({ ...journey });
    };
    media?.addEventListener?.('change', reduce);
    return () => media?.removeEventListener?.('change', reduce);
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [pending?.ticket]);
  useEffect(() => {
    const journey = current.current;
    if (!journey) return;
    const atInvite = location.pathname === invitationPath(journey.token);
    if (journey.destination === 'app' && location.pathname === '/') reachedApp.current = true;
    if (atInvite && reachedApp.current) { cancel(); return; }
    const allowed = atInvite || (journey.destination === 'app' ? location.pathname === '/' : location.pathname === '/auth/callback');
    if (!allowed) cancel();
  }, [location.pathname, cancel]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) cancel(); };
    window.addEventListener('pageshow', restore);
    return () => { window.removeEventListener('pageshow', restore); animations.current.forEach(animation => animation.cancel()); };
  }, [cancel]);
  const value = useMemo(() => ({ pending, cover, resume, ready, fail, cancel, isCurrent, motion: () => current.current?.motion ?? 'instant' as InvitationMotion }), [pending, cover, resume, ready, fail, cancel, isCurrent]);
  const zh = pending?.language !== 'en';
  return <Context.Provider value={value}>
    <div ref={content} className="invitation-route-content" inert={pending ? true : undefined} aria-hidden={pending ? true : undefined}>{children}</div>
    {pending && <div ref={gate} className={`invitation-gate${pending.motion !== 'full' ? ' invitation-gate--quiet' : ''}`} role="status" aria-live="polite" aria-label={zh ? '正在開啟邀請' : 'Opening invitation'}>
      <div ref={left} className="invitation-gate-leaf invitation-gate-left" />
      <div ref={right} className="invitation-gate-leaf invitation-gate-right" />
      <div ref={title} className="invitation-gate-center">
        <Music2 size={32} aria-hidden="true" />
        <span className="invitation-gate-brand">ChordMaster</span>
        <strong>{pending.destination === 'auth' ? (zh ? '帶著這份邀請' : 'Bring your invitation') : pending.name}</strong>
        <p>{pending.destination === 'auth' ? (zh ? '前往 Google 選擇帳號' : 'Choose your account at Google')
          : pending.destination === 'invite' ? (zh ? '正在返回邀請' : 'Returning to your invitation')
          : pending.revealing ? (zh ? '準備好了，一起開始' : 'Ready when you are')
          : zh ? `正在開啟${pending.kind === 'setlist' ? '歌單' : '專案'}` : `Opening ${pending.kind}`}</p>
        {(error || slow) && <div className="invitation-gate-recovery">
          <p role={error ? 'alert' : undefined}>{error || (zh ? '載入比預期久，仍在等候連線。' : 'This is taking longer than expected. Still waiting for the connection.')}</p>
          <button type="button" onClick={() => { const path = invitationPath(pending.token); cancel(); navigate(path, { replace: true }); }}>{zh ? '返回邀請' : 'Back to invitation'}</button>
        </div>}
      </div>
    </div>}
  </Context.Provider>;
}
