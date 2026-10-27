import { describe, expect, it } from 'vitest';
import { applyWorkspaceHistory, appendWorkspaceHistory, createWorkspaceHistoryEntry, EMPTY_WORKSPACE_HISTORY, type HistoryWorkspace } from './workspaceHistory';
import type { Project, Setlist, StoredSong } from '../types';
const project: Project = { id:'project',name:'專案',createdAt:1,updatedAt:1 };
const song: StoredSong = { id:'song',title:'歌曲',currentKey:'C',originalKey:'C',timeSignature:'4/4',sections:[],updatedAt:1 };
const list: Setlist = { id:'list',name:'聚會一',projectId:project.id,displayMode:'chord-movable-key',createdAt:1,updatedAt:1,
  songs:['a','b','c'].map((id,order)=>({id,setlistId:'list',songId:song.id,order,sectionOrder:[],overrideKey:'C'})) };
const workspace = (): HistoryWorkspace => structuredClone({ projects:[project],setlists:[list],songs:[song] });
const entry = (before: Setlist, after: Setlist, group?:string) => createWorkspaceHistoryEntry({zh:'歌曲排序',en:'song order'},[{resource:'setlist',id:list.id,before,after}],group)!;
const reordered = { ...list,songs:[list.songs[1],list.songs[2],list.songs[0]].map((item,order)=>({...item,order})) };
describe('global workspace history',()=>{
 it('restores project identity and classification together without affecting another project',()=>{
   const before=workspace();before.projects.push({...project,id:'other',name:'其他'});
   const change=createWorkspaceHistoryEntry({zh:'刪除專案',en:'project deletion'},[
     {resource:'project',id:project.id,before:project,after:null},
     {resource:'setlist',id:list.id,before:list,after:{...list,projectId:null}}
   ])!;
   const deleted=applyWorkspaceHistory(before,change,'redo');
   expect(deleted.projects.map(item=>item.id)).toEqual(['other']);expect(deleted.setlists[0].projectId).toBeNull();
   const restored=applyWorkspaceHistory(deleted,change,'undo');
   expect(restored.projects).toEqual(expect.arrayContaining([expect.objectContaining({id:project.id,name:project.name})]));
   expect(restored.setlists[0].projectId).toBe(project.id);
   expect(before.projects).toHaveLength(2);
 });
 it('changes only order while retaining a later key, personal capo and score edit',()=>{
   const current=workspace();current.setlists=[structuredClone(reordered)];
   current.setlists[0].songs[0]={...current.setlists[0].songs[0],overrideKey:'E',personalCapoOverride:4,songData:{...song,title:'後續修改'}};
   const restored=applyWorkspaceHistory(current,entry(list,reordered),'undo');
   expect(restored.setlists[0].songs.map(item=>item.id)).toEqual(['a','b','c']);
   expect(restored.setlists[0].songs[1]).toMatchObject({overrideKey:'E',personalCapoOverride:4,songData:{title:'後續修改'}});
 });
 it('rejects a conflicting order or reused identity without mutating the current state',()=>{
   const current=workspace();const original=structuredClone(current);
   expect(()=>applyWorkspaceHistory(current,entry(list,reordered),'undo')).toThrow(/其他修改/);
   expect(current).toEqual(original);
   const deletion=createWorkspaceHistoryEntry({zh:'刪除',en:'delete'},[{resource:'project',id:project.id,before:project,after:null}])!;
   expect(()=>applyWorkspaceHistory(current,deletion,'undo')).toThrow(/其他修改/);
 });
 it('merges scalar fields and preserves unrelated later metadata',()=>{
   const next={...project,name:'新名字'};const change=createWorkspaceHistoryEntry({zh:'重新命名',en:'rename'},[{resource:'project',id:project.id,before:project,after:next}])!;
   const current=workspace();current.projects=[{...next,archived:true}];
   expect(applyWorkspaceHistory(current,change,'undo').projects[0]).toMatchObject({name:'專案',archived:true});
 });
 it('coalesces one held drag and discards a drag returned to its starting order',()=>{
   const intermediate={...list,songs:[list.songs[1],list.songs[0],list.songs[2]].map((item,order)=>({...item,order}))};
   const first=entry(list,intermediate,'held');
   const second=entry(intermediate,reordered,'held');
   const state=appendWorkspaceHistory(appendWorkspaceHistory(EMPTY_WORKSPACE_HISTORY,first),second);
   expect(state.past).toHaveLength(1);expect(state.past[0].changes[0].order?.before).toEqual(['a','b','c']);
   expect(state.past[0].changes[0].before).not.toHaveProperty('songs');
   expect(appendWorkspaceHistory(state,entry(reordered,list,'held')).past).toHaveLength(0);
 });
 it('can undo a new collection after server hydration adds defaults and derived access metadata',()=>{
   const created={...list,projectId:undefined};
   const change=createWorkspaceHistoryEntry({zh:'新增',en:'create'},[{resource:'setlist',id:list.id,before:null,after:created}])!;
   const current=workspace();current.setlists=[{...created,projectId:null,archived:false,assignedToCurrentUser:false}];
   expect(applyWorkspaceHistory(current,change,'undo').setlists).toEqual([]);
   const projectChange=createWorkspaceHistoryEntry({zh:'新增',en:'create'},[{resource:'project',id:project.id,before:null,after:project}])!;
   current.setlists=[];current.projects=[{...project,archived:false}];
   expect(applyWorkspaceHistory(current,projectChange,'undo').projects).toEqual([]);
 });
 it('starts a new branch after a new edit and ignores timestamp-only mutations',()=>{
   const change=entry(list,reordered);
   expect(appendWorkspaceHistory({past:[],future:[change]},change).future).toEqual([]);
   expect(createWorkspaceHistoryEntry({zh:'編輯',en:'edit'},[{resource:'project',id:project.id,before:project,after:{...project,updatedAt:999}}])).toBeNull();
 });
});
