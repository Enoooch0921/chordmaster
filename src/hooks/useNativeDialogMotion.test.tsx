import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNativeDialogMotion } from './useNativeDialogMotion';
const state=vi.hoisted(()=>({present:true,instant:false,reduced:false,safe:vi.fn()}));
vi.mock('motion/react',()=>({usePresence:()=>[state.present,state.safe]}));
vi.mock('./useUiMotion',()=>({useUiMotion:()=>state,isKeyboardInteraction:()=>state.instant}));
beforeEach(()=>{state.present=true;state.instant=false;state.reduced=false;vi.clearAllMocks();vi.stubGlobal('innerWidth',390);const original=window.getComputedStyle;vi.spyOn(window,'getComputedStyle').mockImplementation(node=>original(node));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();document.body.style.overflow='';});
function setup(){
 const node=document.createElement('dialog');document.body.append(node);
 node.showModal=vi.fn(()=>node.setAttribute('open',''));node.close=vi.fn(()=>node.removeAttribute('open'));
 const runs:{frames:Keyframe[];resolve:()=>void;cancel:ReturnType<typeof vi.fn>}[]=[];
 node.animate=vi.fn((frames)=>{let resolve!:()=>void;const finished=new Promise<void>(r=>resolve=r);const cancel=vi.fn();runs.push({frames:frames as Keyframe[],resolve,cancel});return {finished,cancel} as unknown as Animation;});
 const ref={current:node};const hook=renderHook(({present})=>{state.present=present;useNativeDialogMotion(ref);},{initialProps:{present:true}});
 return {node,runs,hook,finish:async()=>{await act(async()=>{runs.at(-1)!.resolve();await Promise.resolve();});}};
}
it('keeps the native top layer and scroll lock until visual exit completes',async()=>{
 const t=setup();expect(t.node.showModal).toHaveBeenCalledOnce();expect(document.body.style.overflow).toBe('hidden');
 await t.finish();t.hook.rerender({present:false});
 expect(t.node).toHaveAttribute('inert');expect(t.node).toHaveAttribute('aria-hidden','true');expect(t.node.open).toBe(true);expect(state.safe).not.toHaveBeenCalled();
 await t.finish();expect(state.safe).toHaveBeenCalledOnce();t.hook.unmount();expect(t.node.close).toHaveBeenCalledOnce();expect(document.body.style.overflow).toBe('');
});
it('reverses an interrupted close without removing the reopened dialog',async()=>{
 const t=setup();await t.finish();t.hook.rerender({present:false});const old=t.runs.at(-1)!;t.node.style.opacity='0.4';t.hook.rerender({present:true});
 expect(old.cancel).toHaveBeenCalled();expect(t.node).not.toHaveAttribute('inert');expect(t.runs.at(-1)!.frames[0].opacity).toBe(0.4);
 await act(async()=>{old.resolve();await Promise.resolve();});expect(state.safe).not.toHaveBeenCalled();
});
it('keeps keyboard-triggered opening and closing instant',async()=>{
 state.instant=true;const t=setup();expect(t.node.animate).not.toHaveBeenCalled();t.hook.rerender({present:false});await act(async()=>{await Promise.resolve();});expect(state.safe).toHaveBeenCalledOnce();
});
it('reduces entrance and exit to opacity without translating or scaling',async()=>{
 state.reduced=true;const t=setup();expect(t.runs[0].frames.every(f=>f.transform==='none')).toBe(true);await t.finish();t.hook.rerender({present:false});expect(t.runs.at(-1)!.frames.every(f=>f.transform==='none')).toBe(true);
});
it('ignores a late completion after its owner has unmounted',async()=>{
 const t=setup();t.hook.rerender({present:false});const old=t.runs.at(-1)!;t.hook.unmount();await act(async()=>{old.resolve();await Promise.resolve();});expect(state.safe).not.toHaveBeenCalled();
});

it('retains the scroll lock until the last stacked native dialog unmounts',()=>{
 document.body.style.overflow='auto';const first=setup(),second=setup();
 first.hook.unmount();expect(document.body.style.overflow).toBe('hidden');
 second.hook.unmount();expect(document.body.style.overflow).toBe('auto');
});
