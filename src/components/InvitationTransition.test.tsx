import { useLayoutEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InvitationTransitionProvider, useInvitationTransition } from './InvitationTransition';
const resource = { kind: 'setlist' as const, id: 'sl', name: 'Sunday', token: 'invite', language: 'zh' as const };
let ready = false;
function Source() {
  const transition = useInvitationTransition(); const navigate = useNavigate();
  return <button onClick={async event => { const ticket = await transition.cover(resource, event, 'app'); if (ticket !== null && transition.isCurrent(ticket)) navigate('/?setlist=sl'); }}>Open invitation</button>;
}
function Destination() {
  const transition = useInvitationTransition();
  useLayoutEffect(() => { if (ready) transition.ready('setlist:sl'); }, [transition.ready, ready]);
  return <h1>Real destination</h1>;
}
const view = (initial = '/share/invite') => <MemoryRouter initialEntries={[initial]}><InvitationTransitionProvider><Routes><Route path="/share/:token" element={<Source />} /><Route path="/" element={<Destination />} /></Routes></InvitationTransitionProvider></MemoryRouter>;
beforeEach(() => { ready = false; window.matchMedia = vi.fn().mockReturnValue({ matches: false }); });
afterEach(() => vi.useRealTimers());
it('never animates an ordinary App opening, including a direct setlist URL', async () => {
  ready = true; render(view('/?setlist=sl'));
  expect(screen.getByRole('heading', { name: 'Real destination' })).toBeVisible();
  expect(document.querySelector('.invitation-gate')).toBeNull();
});
it('keeps the cover across navigation until the destination is actually ready', async () => {
  const rendered = render(view());
  fireEvent.click(screen.getByText('Open invitation'), { detail: 1 });
  await waitFor(() => expect(document.querySelector('h1')).toHaveTextContent('Real destination'));
  expect(document.querySelector('.invitation-gate')).toBeInTheDocument();
  expect(document.querySelector('.invitation-route-content')).toHaveAttribute('inert');
  ready = true; rendered.rerender(view());
  await waitFor(() => expect(document.querySelector('.invitation-gate')).toBeNull());
  expect(screen.getByRole('heading', { name: 'Real destination' })).toBeVisible();
  rendered.unmount(); render(view('/?setlist=sl'));
  expect(document.querySelector('.invitation-gate')).toBeNull();
});
it.each([['keyboard', 0, false], ['reduced motion', 1, true]] as const)('skips spatial motion for %s', async (_label, detail, reduced) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced });
  render(view()); fireEvent.click(screen.getByText('Open invitation'), { detail });
  await waitFor(() => expect(document.querySelector('h1')).toBeInTheDocument());
  expect(document.querySelector('.invitation-gate')).toHaveClass('invitation-gate--quiet');
});
it('lets a slow load return to the invitation and removes the cover', async () => {
  vi.useFakeTimers(); render(view());
  await act(async () => fireEvent.click(screen.getByText('Open invitation')));
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  fireEvent.click(screen.getByRole('button', { name: '返回邀請' }));
  expect(screen.getByRole('button', { name: 'Open invitation' })).toBeVisible();
  expect(document.querySelector('.invitation-gate')).toBeNull();
});


it.each(['full', 'instant'] as const)('rechecks Reduce Motion on OAuth return while preserving %s keyboard intent', async motion => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  function Return() {
    const transition = useInvitationTransition();
    useLayoutEffect(() => transition.resume({ ...resource, motion }), [transition.resume]);
    return <><h1>Return destination</h1><output data-testid="return-motion">{transition.pending?.motion}</output></>;
  }
  render(<MemoryRouter initialEntries={['/auth/callback']}><InvitationTransitionProvider><Return /></InvitationTransitionProvider></MemoryRouter>);
  expect(document.querySelector('.invitation-gate')).toHaveClass('invitation-gate--quiet');
  expect(screen.getByTestId('return-motion')).toHaveTextContent(motion === 'instant' ? 'instant' : 'reduced');
});

it('cancels spatial animation when Reduce Motion is enabled during a pending App arrival', async () => {
  let listener: (() => void) | undefined;
  const media = { matches: false, addEventListener: (_: string, callback: () => void) => { listener = callback; }, removeEventListener: () => {} };
  window.matchMedia = vi.fn().mockReturnValue(media);
  const animation = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ finished: Promise.resolve(), cancel: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animation });
  const rendered = render(view()); fireEvent.click(screen.getByText('Open invitation'), { detail: 1 });
  await waitFor(() => expect(document.querySelector('h1')).toBeInTheDocument());
  act(() => { media.matches = true; listener?.(); });
  expect(document.querySelector('.invitation-gate')).toHaveClass('invitation-gate--quiet');
  animation.mockClear(); ready = true; rendered.rerender(view());
  await waitFor(() => expect(document.querySelector('.invitation-gate')).toBeNull());
  expect(animation.mock.calls.every(([frames]) => !(frames as Keyframe[]).some(frame => frame.transform || frame.clipPath))).toBe(true);
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});
