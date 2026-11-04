import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppViewport } from './useAppViewport';
let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('innerHeight',900); viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0, scale: 1 }); vi.stubGlobal('visualViewport', viewport); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const point = (x: number, y: number) => ({ clientX: x, clientY: y });
const touch = (target: Element, type: string, touches: ReturnType<typeof point>[]) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: touches }); fireEvent(target, event); return event; };
function setup() { const root = document.createElement('div'); document.body.append(root); const hook = renderHook(useAppViewport); act(() => hook.result.current(root)); return { root, hook, frame: () => act(() => vi.advanceTimersByTime(20)) }; }
describe('contained app viewport', () => {
 it('resyncs keyboard bounds and standalone foreground changes without document scrolling', () => {
  const { root, frame } = setup(); expect(root.style.height).toBe('100dvh');
  const input=document.createElement('textarea');root.append(input);input.focus();
  viewport.height = 380; viewport.offsetTop = 60; act(() => viewport.dispatchEvent(new Event('resize'))); frame();
  expect(root.style.height).toBe('380px'); expect(root.style.top).toBe('60px');
  input.blur();
  viewport.height = 800; viewport.offsetTop = 0; fireEvent(window, new Event('pageshow')); frame();
  expect(root.style.height).toBe('100dvh'); expect(root.style.top).toBe('0px');
  viewport.scale = 2; viewport.height = 400; act(() => viewport.dispatchEvent(new Event('resize'))); frame(); expect(root.style.height).toBe('100dvh');
 });
 it.each(['fullscreenchange','webkitfullscreenchange'])('recovers a stale fullscreen height and offset without a resize (%s)', type => {
  const { root, frame }=setup();
  const input=document.createElement('textarea');root.append(input);input.focus();
  viewport.height=380;viewport.offsetTop=60;act(()=>viewport.dispatchEvent(new Event('resize')));frame();
  expect(root.style.height).toBe('380px');
  input.blur();
  fireEvent(document,new Event(type));frame();
  // The old visual size may persist indefinitely, but must not pin the app.
  expect(root.style.height).toBe('100dvh');expect(root.style.top).toBe('0px');
 });
 it('resamples delayed keyboard geometry after fullscreen and orientation transitions', () => {
  const {root,frame}=setup();const input=document.createElement('textarea');root.append(input);input.focus();
  viewport.height=380;viewport.offsetTop=60;fireEvent(document,new Event('fullscreenchange'));frame();
  expect(root.style.height).toBe('380px');
  // Safari updates the metrics later, without a visualViewport resize event.
  viewport.height=500;viewport.offsetTop=20;act(()=>vi.advanceTimersByTime(350));
  expect(root.style.height).toBe('500px');expect(root.style.top).toBe('20px');
  fireEvent(window,new Event('orientationchange'));frame();viewport.height=450;
  act(()=>vi.advanceTimersByTime(750));expect(root.style.height).toBe('450px');
 });
 it('uses measured window height on browsers without dynamic viewport units', () => {
  vi.stubGlobal('CSS',{supports:vi.fn(()=>false)});
  const {root,frame}=setup();expect(root.style.height).toBe(`${window.innerHeight}px`);
  vi.stubGlobal('innerHeight',1000);fireEvent(document,new Event('webkitfullscreenchange'));frame();
  expect(root.style.height).toBe('1000px');
 });
 it('does not mistake the performance hardware keyboard capture for an open software keyboard', () => {
  const {root,frame}=setup();const capture=document.createElement('input');capture.inputMode='none';root.append(capture);capture.focus();
  viewport.height=500;viewport.offsetTop=24;fireEvent(document,new Event('webkitfullscreenchange'));frame();
  expect(root.style.height).toBe('100dvh');expect(root.style.top).toBe('0px');
 });
 it('allows internal scrolling but blocks a pane handing its exhausted edge to the document', () => {
  const { root } = setup(); const scroller = document.createElement('div'), child = document.createElement('p'); scroller.style.overflowY = 'auto';
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 600 } }); scroller.append(child); root.append(scroller);
  touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(true);
  scroller.scrollTop = 100; touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(false);
  scroller.scrollTop = 400; touch(child, 'touchstart', [point(100, 100)]); expect(touch(child, 'touchmove', [point(100, 70)]).defaultPrevented).toBe(true);
  touch(child, 'touchstart', [point(100, 100), point(150, 100)]); expect(touch(child, 'touchmove', [point(80, 100), point(170, 100)]).defaultPrevented).toBe(false);
 });
 it('keeps a vertical pan native through small horizontal drift, including the next gesture', () => {
  const { root } = setup(); const scroller = document.createElement('div'); scroller.style.overflowY = 'auto';
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 1000 } }); scroller.scrollTop=200; root.append(scroller);
  for(let attempt=0;attempt<2;attempt++) {
   touch(scroller,'touchstart',[point(100,300)]);
   expect(touch(scroller,'touchmove',[point(102,299)]).defaultPrevented).toBe(false);
   expect(touch(scroller,'touchmove',[point(103,260)]).defaultPrevented).toBe(false);
   expect(touch(scroller,'touchmove',[point(110,259)]).defaultPrevented).toBe(false);
   touch(scroller,'touchend',[]);
  }
 });
 it('removes global gesture and viewport work on unmount', () => {
  const { root, hook, frame } = setup();
  fireEvent(document,new Event('fullscreenchange'));hook.unmount();
  root.style.height='600px';viewport.height = 300;
  fireEvent(window, new Event('pageshow'));fireEvent(document,new Event('webkitfullscreenchange'));frame();
  act(()=>vi.advanceTimersByTime(1500));expect(root.style.height).toBe('600px');
  touch(root, 'touchstart', [point(100, 100)]); expect(touch(root, 'touchmove', [point(100, 130)]).defaultPrevented).toBe(false);
 });
});
it('uses native overscroll containment without a global blocking touch handler where supported', () => {
 vi.stubGlobal('CSS',{supports:vi.fn(()=>true)});
 const {root}=setup();
 touch(root,'touchstart',[point(100,100)]);
 expect(touch(root,'touchmove',[point(100,150)]).defaultPrevented).toBe(false);
});

it.each(['fullscreenchange', 'webkitfullscreenchange'])('fits the restored window when %s arrives before viewport resize', type => {
 vi.stubGlobal('innerHeight',1210);viewport.height=1210;
 const {root,frame}=setup();expect(root.style.height).toBe('100dvh');
 // The browser toolbar has returned, while VisualViewport still has its fullscreen height.
 vi.stubGlobal('innerHeight',1078);
 fireEvent(document,new Event(type));frame();
 expect(root.style.height).toBe('100dvh');
});

it('rechecks dimensions after the fullscreen animation even without a later resize event', () => {
 vi.stubGlobal('innerHeight',1210);viewport.height=1210;
 const {root,frame}=setup();
 fireEvent(document,new Event('fullscreenchange'));frame();
 vi.stubGlobal('innerHeight',1078);
 act(()=>vi.advanceTimersByTime(150));expect(root.style.height).toBe('100dvh');
 viewport.height=1050;viewport.offsetTop=12;
 act(()=>vi.advanceTimersByTime(450));
 expect(root.style.height).toBe('100dvh');expect(root.style.top).toBe('0px');
});

it('fits a newly mounted performance overlay and keeps it aligned through native fullscreen exit', () => {
 const root=document.createElement('div');document.body.append(root);
 const overlay={current:null as HTMLDivElement|null};
 const hook=renderHook(({open})=>useAppViewport(overlay,open),{initialProps:{open:false}});
 act(()=>hook.result.current(root));
 overlay.current=document.createElement('div');document.body.append(overlay.current);
 hook.rerender({open:true});expect(overlay.current.style.height).toBe('100dvh');
 viewport.height=1210;vi.stubGlobal('innerHeight',1210);
 fireEvent(document,new Event('fullscreenchange'));act(()=>vi.advanceTimersByTime(20));
 expect(root.style.height).toBe('100dvh');expect(overlay.current.style.height).toBe('100dvh');
 vi.stubGlobal('innerHeight',1078);viewport.offsetTop=10;
 fireEvent(document,new Event('webkitfullscreenchange'));act(()=>vi.advanceTimersByTime(20));
 expect(root.style.height).toBe('100dvh');expect(overlay.current.style.height).toBe('100dvh');
 expect(overlay.current.style.top).toBe('0px');
 hook.unmount();
});

it('cancels pending fullscreen recalibration and removes its listeners on unmount', () => {
 const {root,hook,frame}=setup();
 fireEvent(document,new Event('fullscreenchange'));frame();
 expect(vi.getTimerCount()).toBeGreaterThan(0);
 hook.unmount();expect(vi.getTimerCount()).toBe(0);
 viewport.height=300;
 for(const type of ['fullscreenchange','webkitfullscreenchange','visibilitychange'])fireEvent(document,new Event(type));
 fireEvent(window,new Event('orientationchange'));act(()=>vi.advanceTimersByTime(1200));
 expect(root.style.height).toBe('100dvh');expect(vi.getTimerCount()).toBe(0);
});
