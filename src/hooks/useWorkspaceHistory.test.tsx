import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useWorkspaceHistory } from './useWorkspaceHistory';
import { createWorkspaceHistoryEntry } from '../lib/workspaceHistory';
const change=()=>createWorkspaceHistoryEntry({zh:'重新命名',en:'rename'},[{resource:'project',id:'project',before:{id:'project',name:'before',createdAt:1,updatedAt:1},after:{id:'project',name:'after',createdAt:1,updatedAt:2}}])!;
const options=()=>({scope:crypto.randomUUID(),enabled:true,apply:vi.fn(async entry=>entry),onError:vi.fn(),onComplete:vi.fn()});
it('keeps failed undo retryable, and serializes repeated requests',async()=>{
 const props=options();const hook=renderHook(useWorkspaceHistory,{initialProps:props});
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 act(()=>hook.result.current.record(change()));
 props.apply.mockRejectedValueOnce(new Error('network'));
 await act(async()=>{await hook.result.current.undo();});
 expect(hook.result.current.canUndo).toBe(true);expect(hook.result.current.canRedo).toBe(false);expect(props.onError).toHaveBeenCalled();
 let finish!:(entry:ReturnType<typeof change>)=>void;
 props.apply.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let operation!:Promise<void>;act(()=>{operation=hook.result.current.undo();});
 await act(async()=>{await hook.result.current.undo();});
 expect(props.apply).toHaveBeenCalledTimes(2);
 await act(async()=>{finish(change());await operation;});
 expect(hook.result.current.canUndo).toBe(false);expect(hook.result.current.canRedo).toBe(true);
});
it('keeps accounts and libraries isolated during an in-flight undo',async()=>{
 const props=options();const hook=renderHook(useWorkspaceHistory,{initialProps:props});
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));act(()=>hook.result.current.record(change()));
 let finish!:(entry:ReturnType<typeof change>)=>void;props.apply.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let operation!:Promise<void>;act(()=>{operation=hook.result.current.undo();});
 hook.rerender({...props,scope:crypto.randomUUID()});await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 await act(async()=>{finish(change());await operation;});
 expect(hook.result.current.canUndo).toBe(false);expect(hook.result.current.canRedo).toBe(false);expect(props.onComplete).not.toHaveBeenCalled();
});
it('retains a fresh action while IndexedDB history is still loading and restores it after remount',async()=>{
 const props=options();let hook=renderHook(useWorkspaceHistory,{initialProps:props});
 act(()=>hook.result.current.record(change()));
 await waitFor(()=>expect(hook.result.current.canUndo).toBe(true));
 // Wait for the persistent transaction by reading the database in the same FIFO.
 await waitFor(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('chordmaster-workspace-history',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const stored=await new Promise<any>(resolve=>{const r=db.transaction('histories').objectStore('histories').get(props.scope);r.onsuccess=()=>resolve(r.result);});db.close();
  expect(stored?.state.past).toHaveLength(1);
 });
 hook.unmount();hook=renderHook(useWorkspaceHistory,{initialProps:props});
 await waitFor(()=>expect(hook.result.current.canUndo).toBe(true));
});
it('clears both stacks after an explicitly irreversible operation and persists the barrier',async()=>{
 const props=options();const hook=renderHook(useWorkspaceHistory,{initialProps:props});
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 act(()=>hook.result.current.record(change()));
 await act(async()=>{await hook.result.current.undo();});
 expect(hook.result.current.canRedo).toBe(true);
 await act(async()=>{await hook.result.current.clear();});
 expect(hook.result.current.canUndo).toBe(false);expect(hook.result.current.canRedo).toBe(false);
 await act(async()=>{await hook.result.current.redo();});
 expect(props.apply).toHaveBeenCalledTimes(1);
});
