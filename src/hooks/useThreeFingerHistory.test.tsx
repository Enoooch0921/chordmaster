import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useThreeFingerHistory } from './useThreeFingerHistory';
import { useSongHistoryShortcuts } from './useSongHistoryShortcuts';
const points=(x=200,y=100,count=3)=>Array.from({length:count},(_,identifier)=>({identifier,clientX:x+identifier*30,clientY:y}));
const props=()=>({enabled:true,onUndo:vi.fn(),onRedo:vi.fn()});
beforeEach(()=>{vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)');});
afterEach(()=>vi.restoreAllMocks());
const swipe=(target:Window | HTMLElement,dx:number,count=3)=>{
 fireEvent.touchStart(target,{touches:points(200,100,count)});
 fireEvent.touchMove(target,{touches:points(200+dx,100,count)});
 fireEvent.touchEnd(target,{touches:[],changedTouches:points(200+dx,100,count)});
};
it('undoes once with three fingers left and redoes once to the right',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 swipe(window,-70);expect(options.onUndo).toHaveBeenCalledTimes(1);expect(options.onRedo).not.toHaveBeenCalled();
 swipe(window,70);expect(options.onRedo).toHaveBeenCalledTimes(1);
});
it('ignores one/two/four fingers, vertical pans, short movement, pinch and cancelled gestures',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 for(const count of [1,2,4])swipe(window,-80,count);
 swipe(window,-20);
 fireEvent.touchStart(window,{touches:points()});fireEvent.touchMove(window,{touches:points(195,180)});fireEvent.touchEnd(window,{touches:[]});
 fireEvent.touchStart(window,{touches:points()});fireEvent.touchMove(window,{touches:[points(120)[0],points(200)[1],points(280)[2]]});fireEvent.touchEnd(window,{touches:[]});
 fireEvent.touchStart(window,{touches:points()});fireEvent.touchMove(window,{touches:points(120)});fireEvent.touchCancel(window,{touches:[]});
 expect(options.onUndo).not.toHaveBeenCalled();expect(options.onRedo).not.toHaveBeenCalled();
 // A fresh gesture after cancellation works; real fingers arrive one at a time.
 fireEvent.touchStart(window,{touches:points(200,100,1)});swipe(window,-70);expect(options.onUndo).toHaveBeenCalledTimes(1);
});
it('leaves gestures inside native text inputs and modals to the system',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 render(<><input aria-label="Search"/><div role="dialog"><button>Invite</button></div></>);
 swipe(screen.getByLabelText('Search'),-80);swipe(screen.getByText('Invite'),-80);
 expect(options.onUndo).not.toHaveBeenCalled();
});
it('reserves three-finger input before Safari can turn the first small move into a list scroll',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 expect(fireEvent.touchStart(window,{touches:points(200,100,1)})).toBe(true);
 expect(fireEvent.touchStart(window,{touches:points(200,100,2)})).toBe(true);
 expect(fireEvent.touchStart(window,{touches:points()})).toBe(false);
 expect(fireEvent.touchMove(window,{touches:points(190)})).toBe(false);
 expect(options.onUndo).not.toHaveBeenCalled();
 expect(fireEvent.touchMove(window,{touches:points(120)})).toBe(false);
 fireEvent.touchEnd(window,{touches:points(120,100,2)});fireEvent.touchEnd(window,{touches:[]});
 expect(options.onUndo).toHaveBeenCalledTimes(1);
});
it('uses release coordinates when iPhone coalesces the last touchmove',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 fireEvent.touchStart(window,{touches:points()});
 fireEvent.touchMove(window,{touches:points(180)});
 fireEvent.touchEnd(window,{touches:points(130,100,2),changedTouches:[points(130)[2]]});
 fireEvent.touchEnd(window,{touches:[],changedTouches:points(130,100,2)});
 expect(options.onUndo).toHaveBeenCalledTimes(1);
});
it('undoes on the list even when its sort control still has keyboard focus',()=>{
 const options=props();renderHook(()=>useThreeFingerHistory(options));
 render(<><select aria-label="Sort"><option>Recent</option></select><div data-testid="list">歌單列表</div></>);
 screen.getByLabelText('Sort').focus();swipe(screen.getByTestId('list'),-70);
 expect(options.onUndo).toHaveBeenCalledTimes(1);
});
it.each(['before','after'])('handles a custom chord input once when native undo arrives %s the touch fallback',order=>{
 const options=props();renderHook(()=>{
   const gestureSession=useThreeFingerHistory(options);useSongHistoryShortcuts({...options,gestureSession});
 });
 render(<input data-song-history-input aria-label="Chord"/>);const input=screen.getByLabelText('Chord');input.focus();
 fireEvent.touchStart(input,{touches:points()});fireEvent.touchMove(input,{touches:points(120)});
 const native=()=>input.dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}));
 if(order==='before')expect(native()).toBe(false);
 fireEvent.touchEnd(input,{touches:[]});if(order==='after')expect(native()).toBe(false);
 expect(options.onUndo).toHaveBeenCalledTimes(1);
});
it('uses current callbacks, cleans up, and stays disabled on other platforms',()=>{
 const options=props();const hook=renderHook(useThreeFingerHistory,{initialProps:options});
 const next=props();hook.rerender(next);swipe(window,-80);expect(next.onUndo).toHaveBeenCalledTimes(1);expect(options.onUndo).not.toHaveBeenCalled();
 hook.rerender({...next,enabled:false});swipe(window,-80);expect(next.onUndo).toHaveBeenCalledTimes(1);
 hook.unmount();vi.spyOn(navigator,'userAgent','get').mockReturnValue('Android');renderHook(()=>useThreeFingerHistory(options));swipe(window,-80);expect(options.onUndo).not.toHaveBeenCalled();
});
