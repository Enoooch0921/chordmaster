import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { useSetlistSongDrag } from './useSetlistSongDrag';

const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 40, clientY: 180 };
const options = () => ({ enabled: true, scopeKey: 'team/meeting', items: undefined as readonly { id: string }[] | undefined,
  onMove: vi.fn(), onDraggingChange: vi.fn(), onTargetChange: vi.fn() });
type Options = ReturnType<typeof options>;
function Harness({ config, select = () => {} }: { config: Options; select?: () => void }) {
  const { onPointerDown } = useSetlistSongDrag(config);
  return <><div data-setlist-detail-scroll data-testid="pane">
    <div data-setlist-song-id="a"><button onPointerDown={event => onPointerDown(event, 'a')}>Drag A</button></div>
    <div data-setlist-song-id="b"><button onClick={select}>Select B</button></div>
    <div data-setlist-song-id="c">Song C</div>
  </div><div data-setlist-song-id="outside">Another pane</div></>;
}
const card = (id: string) => document.querySelector<HTMLElement>(`[data-setlist-song-id="${id}"]`)!;
const frame = () => act(() => vi.advanceTimersByTime(16));
const move = (y: number) => { fireEvent.pointerMove(window, { ...pointer, clientY: y }); frame(); };
const rect = (top: number, height: number) => ({top,bottom:top+height,left:0,right:240,height,width:240,x:0,y:top,toJSON(){}});

beforeAll(() => {
  if (!window.PointerEvent) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number; readonly pointerType: string; readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; this.isPrimary = init.isPrimary ?? true;
    }
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(Date.now()), 16));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const index = ['a','b','c'].indexOf(this.dataset.setlistSongId ?? '');
    return index >= 0 ? rect(100 + index * 100,100) : rect(0,0);
  });
});
afterEach(() => {
  cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  document.body.style.userSelect = ''; document.body.style.removeProperty('-webkit-user-select');
});

it('follows the pointer and previews neighbors without changing DOM order or notifying React targets', () => {
  const config = options(); render(<Harness config={config}/>);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag A' }), pointer);
  const targetCalls = config.onTargetChange.mock.calls.length;
  move(300);
  expect(card('a').style.transform).toBe('translate3d(0, 120px, 0)');
  expect(card('b').style.transform).toBe('translate3d(0, -100px, 0)');
  expect([...screen.getByTestId('pane').children].map(n => (n as HTMLElement).dataset.setlistSongId)).toEqual(['a','b','c']);
  move(420);
  expect(card('c').style.transform).toBe('translate3d(0, -100px, 0)');
  expect(config.onMove).not.toHaveBeenCalled();
  expect(config.onTargetChange).toHaveBeenCalledTimes(targetCalls);
  fireEvent.pointerUp(window, pointer);
  expect(config.onMove).toHaveBeenCalledExactlyOnceWith('a','c');
  for (const id of ['a','b','c']) expect(card(id).style.transform).toBe('');
  expect(document.body.style.userSelect).toBe('');
});

it('captures the stationary pane and commits once using the latest callback after lost capture', () => {
  const config = options(); const view = render(<Harness config={config}/>);
  const pane = screen.getByTestId('pane'), capture = vi.fn(() => { throw new Error('Unsupported capture'); });
  Object.defineProperty(pane, 'setPointerCapture', { configurable: true, value: capture });
  const handle = screen.getByRole('button', { name: 'Drag A' });
  fireEvent.pointerDown(handle, pointer); expect(capture).toHaveBeenCalledWith(1);
  fireEvent.lostPointerCapture(handle, pointer); move(300);
  const latest = options(); view.rerender(<Harness config={latest}/>); move(420);
  expect(config.onMove).not.toHaveBeenCalled(); expect(latest.onMove).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, pointer);
  expect(latest.onMove).toHaveBeenCalledExactlyOnceWith('a','c');
  expect(latest.onDraggingChange).toHaveBeenLastCalledWith(null);
});

it('returns to its original slot without creating a reorder', () => {
  const config=options();render(<Harness config={config}/>);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),pointer);move(420);move(180);
  expect(card('b').style.transform).toBe('');expect(card('c').style.transform).toBe('');
  fireEvent.pointerUp(window,pointer);expect(config.onMove).not.toHaveBeenCalled();
});

it('waits for a touch hold and cancels on a second pointer without committing', () => {
  const config=options();render(<Harness config={config}/>);const touch={...pointer,pointerType:'touch'};
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),touch);
  fireEvent.pointerMove(window,{...touch,clientY:300});
  act(()=>vi.advanceTimersByTime(179));expect(card('a').style.transform).toBe('');
  act(()=>vi.advanceTimersByTime(17));expect(card('a').style.transform).toBe('translate3d(0, 120px, 0)');
  fireEvent.pointerMove(window,{...touch,pointerId:2,clientY:420});frame();
  expect(card('a').style.transform).toBe('translate3d(0, 120px, 0)');
  fireEvent.pointerDown(window,{...touch,pointerId:2,isPrimary:false});
  expect(config.onMove).not.toHaveBeenCalled();expect(card('a').style.transform).toBe('');
  expect(document.body.style.userSelect).toBe('');
});

it.each(['scope','permission','items','unmount'])('cancels and restores original styles when %s changes',reason=>{
  const config=options();const view=render(<Harness config={config}/>);card('a').style.transform='translateX(2px)';
  document.body.style.userSelect='text';fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),pointer);move(300);
  if(reason==='unmount')view.unmount();else view.rerender(<Harness config={{...config,...(reason==='scope'?{scopeKey:'other'}:reason==='permission'?{enabled:false}:{items:[{id:'a'}]})}}/>);
  fireEvent.pointerUp(window,pointer);expect(config.onMove).not.toHaveBeenCalled();
  expect(document.body.style.userSelect).toBe('text');
  if(reason!=='unmount')expect(card('a').style.transform).toBe('translateX(2px)');
});

it.each(['pointercancel','Escape','blur'])('cancels an active preview on %s without committing',event=>{
  const config=options();render(<Harness config={config}/>);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),pointer);move(420);
  if(event==='Escape')fireEvent.keyDown(window,{key:'Escape'});else if(event==='blur')fireEvent.blur(window);else fireEvent.pointerCancel(window,pointer);
  fireEvent.pointerUp(window,pointer);expect(config.onMove).not.toHaveBeenCalled();expect(card('a').style.transform).toBe('');
});

it('cancels pending touch hold and cannot activate later',()=>{
  const config=options();render(<Harness config={config}/>);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),{...pointer,pointerType:'touch'});
  fireEvent.pointerCancel(window,pointer);act(()=>vi.advanceTimersByTime(200));
  expect(config.onDraggingChange).not.toHaveBeenCalledWith('a');
});

it('auto-scrolls with a stationary pointer, previews without writes, and stops on release',()=>{
  const config=options();render(<Harness config={config}/>);const pane=screen.getByTestId('pane');
  Object.defineProperties(pane,{clientHeight:{value:200},scrollHeight:{value:800}});
  vi.spyOn(pane,'getBoundingClientRect').mockReturnValue(rect(100,200));
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),{...pointer,clientY:295});
  act(()=>vi.advanceTimersByTime(240));expect(pane.scrollTop).toBeGreaterThan(100);
  expect(card('a').style.transform).not.toBe('');expect(config.onMove).not.toHaveBeenCalled();
  fireEvent.pointerUp(window,pointer);expect(config.onMove).toHaveBeenCalledOnce();const stopped=pane.scrollTop;
  act(()=>vi.advanceTimersByTime(100));expect(pane.scrollTop).toBe(stopped);
});

it('suppresses release click while allowing the next intentional click',()=>{
  const config=options(),select=vi.fn();render(<Harness config={config} select={select}/>);
  fireEvent.pointerDown(screen.getByRole('button',{name:'Drag A'}),pointer);move(300);fireEvent.pointerUp(window,pointer);
  const button=screen.getByRole('button',{name:'Select B'});fireEvent.click(button,{detail:1});expect(select).not.toHaveBeenCalled();
  fireEvent.pointerDown(button,pointer);fireEvent.click(button,{detail:1});expect(select).toHaveBeenCalledOnce();
});
