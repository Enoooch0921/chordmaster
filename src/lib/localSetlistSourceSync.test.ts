import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot, StoredSong } from '../types';
import { normalizeSongBars, persistPersistentWorkspaceSnapshot, loadPersistentWorkspaceSnapshot } from './workspace';
import { readWorkspaceDatabase } from './workspaceDatabase';
import { applyLocalSetlistSource, captureLocalSetlistSourceEdit, previewLocalSetlistSource, reconcileLocalSetlistSource } from './localSetlistSourceSync';
import { classifySetlistSource } from './setlistSourceSync';

const fixture = (): WorkspaceSnapshot => {
  const song: StoredSong = normalizeSongBars({ id:'song', title:'個人譜面', originalKey:'C', currentKey:'D', capo:2,
    timeSignature:'4/4', updatedAt:1, barRowCount:3, lyricsDoc:{chinese:'舊歌詞',fontSize:20,displayLanguage:'chinese'},
    sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords:['C']}]}] });
  const entry = { id:'entry',setlistId:'set',songId:song.id,order:0,sectionOrder:['verse','verse'],overrideKey:'E' as const,capo:5,songData:structuredClone(song) };
  const edited = structuredClone(entry);edited.songData.sections[0].bars[0].chords=['G'];
  const tracked=captureLocalSetlistSourceEdit(song,entry,edited,2);
  return {songs:[song],setlists:[{id:'set',name:'個人歌單',displayMode:'chord-movable-key',createdAt:1,updatedAt:2,songs:[tracked,{...entry,id:'other'}]}],projects:[],joinedSetlists:[],joinedProjects:[],lastSavedAt:2};
};
beforeEach(()=>{localStorage.clear();vi.stubGlobal('indexedDB',new IDBFactory());});
const persist = async (w:WorkspaceSnapshot) => {await persistPersistentWorkspaceSnapshot(w.songs,w.setlists,w.projects);return loadPersistentWorkspaceSnapshot();};

it('tracks a known first edit and preserves legacy unknown provenance instead of guessing',()=>{
 const w=fixture(), entry=w.setlists[0].songs[0];
 expect(classifySetlistSource(w.songs[0],entry.songData!,entry.sourceBaseline)).toBe('setlist-changed');
 const legacy={...entry,sourceBaseline:undefined};
 const changed={...legacy,songData:structuredClone(legacy.songData!)};changed.songData.sections[0].bars[0].chords=['F'];
 expect(captureLocalSetlistSourceEdit(w.songs[0],legacy,changed).sourceBaseline).toBeUndefined();
});
it('uploads only the reviewed score, preserving source preferences, other copies and complete inputs',()=>{
 const w=fixture(), before=structuredClone(w), p=previewLocalSetlistSource(w,'entry');
 p.overrideJson.songData.currentKey='F';p.overrideJson.songData.capo=7;
 const result=applyLocalSetlistSource(w,p,'to-library',3);
 expect(result.workspace.songs[0]).toMatchObject({currentKey:'D',capo:2,barRowCount:3});
 expect(result.workspace.songs[0].sections[0].bars[0].chords).toEqual(['G']);
 expect(result.workspace.setlists[0].songs[0]).toMatchObject({overrideKey:'E',capo:5,sectionOrder:['verse','verse']});
 expect(result.workspace.setlists[0].songs[1]).toEqual(before.setlists[0].songs[1]);
 expect(result.backup.source).toEqual(before.songs[0]);
 expect(w).toEqual(before);
});
it('refreshes a stale copy and preserves its Key, Capo, repeated order and lyrics layout',()=>{
 const w=fixture();const entry=w.setlists[0].songs[0];entry.songData=structuredClone(w.songs[0]);
 entry.songData.currentKey='E';entry.songData.capo=8;entry.songData.lyricsDoc!.fontSize=30;
 w.songs[0].sections[0].bars[0].chords=['Am'];w.songs[0].lyricsDoc!.chinese='新歌詞';w.songs[0].updatedAt=4;
 const p=previewLocalSetlistSource(w,'entry');expect(p.status).toBe('source-newer');
 const r=applyLocalSetlistSource(w,p,'to-setlist',5);
 expect(r.result.entry.songData).toMatchObject({currentKey:'E',capo:8,lyricsDoc:{chinese:'新歌詞',fontSize:30}});
 expect(r.result.entry.sectionOrder).toEqual(['verse','verse']);
 expect(r.workspace.songs[0]).toEqual(w.songs[0]);
 expect(()=>applyLocalSetlistSource(w,p,'to-library')).toThrow('舊副本');
});
it.each(['source','entry','baseline','removed','archived'] as const)('rejects a %s change since preview before writing',which=>{
 const w=fixture(),p=previewLocalSetlistSource(w,'entry');
 if(which==='source')w.songs[0].sections[0].bars[0].chords=['Am'];
 if(which==='entry')w.setlists[0].songs[0].songData!.title='新歌名';
 if(which==='baseline')w.setlists[0].songs[0].sourceBaseline=null;
 if(which==='removed')w.setlists[0].songs=[];
 if(which==='archived')w.songs[0].archivedAt=3;
 expect(()=>applyLocalSetlistSource(w,p,'to-library')).toThrow();
});
it('commits the durable backup and score together, retaining unrelated edits from another tab',async()=>{
 let w=await persist(fixture());const p=previewLocalSetlistSource(w,'entry');const before=await readWorkspaceDatabase();
 expect(before.current).toBeDefined(); // Preview itself is read-only.
 const elsewhere=structuredClone(w);elsewhere.songs.push({...w.songs[0],id:'unrelated',title:'其他分頁新增'});
 await persist(elsewhere);
 const next=await reconcileLocalSetlistSource(p,'to-library',w);
 expect(next.workspace.songs.find(s=>s.id==='unrelated')?.title).toBe('其他分頁新增');
 expect((await loadPersistentWorkspaceSnapshot()).songs[0].sections[0].bars[0].chords).toEqual(['G']);
 expect(classifySetlistSource(next.result.source,next.result.entry.songData!,next.result.entry.sourceBaseline)).toBe('aligned');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('chordmaster-workspaces',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const keys=await new Promise<IDBValidKey[]>((resolve,reject)=>{const r=db.transaction('snapshots').objectStore('snapshots').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
 expect(keys.filter(key=>String(key).startsWith('setlist-source-sync-backup:'))).toHaveLength(1);
});
it('rejects a durable concurrent edit even when this tab still has the old in-memory score',async()=>{
 const w=await persist(fixture()),p=previewLocalSetlistSource(w,'entry');
 const other=structuredClone(w);other.songs[0].title='其他分頁修改';await persist(other);
 const before=await readWorkspaceDatabase();
 await expect(reconcileLocalSetlistSource(p,'to-library',w)).rejects.toThrow('重新比對');
 expect(await readWorkspaceDatabase()).toEqual(before);
});
it('rolls back source replacement and backup when local storage fills up',async()=>{
 const w=await persist(fixture()),p=previewLocalSetlistSource(w,'entry'),before=await readWorkspaceDatabase();
 const put=IDBObjectStore.prototype.put;
 const mock=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(value,key){if(String(key).startsWith('setlist-source-sync-backup:'))throw new DOMException('Storage full','QuotaExceededError');return put.call(this,value,key);});
 await expect(reconcileLocalSetlistSource(p,'to-library',w)).rejects.toThrow('Storage full');mock.mockRestore();
 expect(await readWorkspaceDatabase()).toEqual(before);
});
