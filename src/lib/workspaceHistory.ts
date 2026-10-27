import type { Project, Setlist, SetlistSong, StoredSong } from '../types';

export type HistoryResource = 'project' | 'setlist' | 'song';
export type HistoryValue = Project | Setlist | StoredSong;
export interface HistoryTrashResource { type: 'project' | 'setlist' | 'entry'; id: string; trashId?: string }
export interface WorkspaceHistoryChange {
  resource: HistoryResource;
  id: string;
  before: HistoryValue | null;
  after: HistoryValue | null;
  order?: { before: string[]; after: string[] };
  entries?: Array<{ id: string; before: SetlistSong | null; after: SetlistSong | null }>;
}
export interface WorkspaceHistoryEntry {
  id: string;
  label: { zh: string; en: string };
  changes: WorkspaceHistoryChange[];
  group?: string;
  trashId?: string;
  trashResource?: { type: 'project' | 'setlist' | 'entry'; id: string };
  trashResources?: HistoryTrashResource[];
  inverseTrash?: boolean;
}
export interface HistoryWorkspace { songs: StoredSong[]; setlists: Setlist[]; projects: Project[] }
export interface WorkspaceHistoryState { past: WorkspaceHistoryEntry[]; future: WorkspaceHistoryEntry[] }
export const EMPTY_WORKSPACE_HISTORY: WorkspaceHistoryState = { past: [], future: [] };
export const WORKSPACE_HISTORY_LIMIT = 50;
const transient = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'archivedBy', 'personalCapoOverride', 'sourceBaseline', 'sourceArchivedAt', 'assignedToCurrentUser']);

export interface HistoryRpcPatch { resource: HistoryResource | 'entry' | 'order'; id: string; before: Record<string, unknown>; after: Record<string, unknown> }
export function historyFieldPatch(resource: HistoryRpcPatch['resource'], id: string, expected: Record<string, unknown>, desired: Record<string, unknown>): HistoryRpcPatch | null {
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(expected), ...Object.keys(desired)])) {
    if (transient.has(key) || key === 'id' || key === 'teamSource' || historySignature(expected[key]) === historySignature(desired[key])) continue;
    before[key] = expected[key] ?? null; after[key] = desired[key] ?? null;
  }
  return Object.keys(after).length ? { resource, id, before, after } : null;
}

export function historySignature(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([key, field]) => !transient.has(key) && field !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, normalize(field)]));
    return item;
  };
  return JSON.stringify(normalize(value ?? null));
}

function resourceSignature(resource: HistoryResource, value: HistoryValue | null) {
  if (!value || resource === 'song') return historySignature(value);
  return historySignature({ ...value, archived: (value as Project).archived ?? false,
    ...(resource === 'setlist' ? { projectId: (value as Setlist).projectId ?? null } : {}) });
}

export function createWorkspaceHistoryEntry(label: WorkspaceHistoryEntry['label'], changes: WorkspaceHistoryChange[], group?: string): WorkspaceHistoryEntry | null {
  const meaningful = changes.filter(change => resourceSignature(change.resource, change.before) !== resourceSignature(change.resource, change.after)).map(compactHistoryChange);
  return meaningful.length ? { id: crypto.randomUUID(), label, changes: structuredClone(meaningful), ...(group ? { group } : {}) } : null;
}

export function compactHistoryChange(change: WorkspaceHistoryChange): WorkspaceHistoryChange {
  if (!change.before || !change.after) return change;
  const before = change.before as unknown as Record<string, unknown>, after = change.after as unknown as Record<string, unknown>;
  const fields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key])=>key!=='songs'));
  const scalar = historyFieldPatch(change.resource, change.id, change.resource==='setlist'?fields(before):before, change.resource==='setlist'?fields(after):after);
  const result: WorkspaceHistoryChange = { ...change,
    before:{id:change.id,...Object.fromEntries(Object.keys(scalar?.before??{}).map(key=>[key,before[key]]))} as unknown as HistoryValue,
    after:{id:change.id,...Object.fromEntries(Object.keys(scalar?.after??{}).map(key=>[key,after[key]]))} as unknown as HistoryValue };
  if (change.resource !== 'setlist' || !Array.isArray(before.songs) || !Array.isArray(after.songs)) return result;
  const from = before.songs as SetlistSong[], to = after.songs as SetlistSong[];
  const fromIds=from.map(item=>item.id), toIds=to.map(item=>item.id);
  if(historySignature(fromIds)!==historySignature(toIds)) result.order={before:fromIds,after:toIds};
  const entries: NonNullable<WorkspaceHistoryChange['entries']>=[];
  const withoutOrder=(item:SetlistSong)=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='order'));
  for(const id of new Set([...fromIds,...toIds])) {
    const original=from.find(item=>item.id===id), desired=to.find(item=>item.id===id);
    if(!original || !desired) entries.push({id,before:original??null,after:desired??null});
    else {
      const patch=historyFieldPatch('entry',id,withoutOrder(original),withoutOrder(desired));
      if(patch)entries.push({id,before:{id,...Object.fromEntries(Object.keys(patch.before).map(key=>[key,(original as unknown as Record<string,unknown>)[key]]))} as unknown as SetlistSong,
        after:{id,...Object.fromEntries(Object.keys(patch.after).map(key=>[key,(desired as unknown as Record<string,unknown>)[key]]))} as unknown as SetlistSong});
    }
  }
  if(entries.length)result.entries=entries;
  return result;
}
const hasMeaningfulChange=(change:WorkspaceHistoryChange)=>historySignature(change.before)!==historySignature(change.after)
  || Boolean(change.order && historySignature(change.order.before)!==historySignature(change.order.after))
  || Boolean(change.entries?.some(entry=>historySignature(entry.before)!==historySignature(entry.after)));

export function appendWorkspaceHistory(state: WorkspaceHistoryState, entry: WorkspaceHistoryEntry): WorkspaceHistoryState {
  const last = state.past.at(-1);
  if (entry.group && last?.group === entry.group && last.changes.length === entry.changes.length
      && last.changes.every((change, index) => change.resource === entry.changes[index].resource && change.id === entry.changes[index].id)) {
    const merged = { ...entry, id: last.id, changes: entry.changes.map((change, index) => ({ ...change, before: last.changes[index].before,
      ...(change.order ? {order:{before:last.changes[index].order?.before??change.order.before,after:change.order.after}} : {}) })) };
    const meaningful = merged.changes.some(hasMeaningfulChange);
    return { past: meaningful ? [...state.past.slice(0, -1), merged] : state.past.slice(0, -1), future: [] };
  }
  return { past: [...state.past, entry].slice(-WORKSPACE_HISTORY_LIMIT), future: [] };
}

export class WorkspaceHistoryConflict extends Error {
  constructor() { super('內容已有其他修改，無法安全撤銷。請重新整理後確認目前版本。'); }
}

function mergeFields(current: Record<string, unknown>, expected: Record<string, unknown>, desired: Record<string, unknown>) {
  const next = { ...current };
  for (const key of new Set([...Object.keys(expected), ...Object.keys(desired)])) {
    if (transient.has(key) || key === 'id' || historySignature(expected[key]) === historySignature(desired[key])) continue;
    if (historySignature(current[key]) !== historySignature(expected[key])) throw new WorkspaceHistoryConflict();
    if (desired[key] === undefined) delete next[key];
    else next[key] = structuredClone(desired[key]);
  }
  return next;
}

/** Change only the fields owned by this action; unrelated later edits survive. */
export function applyWorkspaceHistory(workspace: HistoryWorkspace, entry: WorkspaceHistoryEntry, direction: 'undo' | 'redo'): HistoryWorkspace {
  const result = { songs: [...workspace.songs], setlists: [...workspace.setlists], projects: [...workspace.projects] };
  for (const rawChange of entry.changes) {
    const change=compactHistoryChange(rawChange);
    const expected = direction === 'undo' ? change.after : change.before;
    const desired = direction === 'undo' ? change.before : change.after;
    const collection = change.resource === 'song' ? 'songs' : change.resource === 'setlist' ? 'setlists' : 'projects';
    const rows: HistoryValue[] = result[collection];
    const index = rows.findIndex(row => row.id === change.id);
    const current = rows[index];
    if (!expected) {
      if (current || !desired) throw new WorkspaceHistoryConflict();
      rows.push({ ...structuredClone(desired), updatedAt: Date.now() });
    } else if (!current) throw new WorkspaceHistoryConflict();
    else if (!desired) {
      if (resourceSignature(change.resource, current) !== resourceSignature(change.resource, expected)) throw new WorkspaceHistoryConflict();
      if(change.resource==='project' && result.setlists.some(list=>list.projectId===change.id && !entry.changes.some(item=>item.resource==='setlist'&&item.id===list.id)))throw new WorkspaceHistoryConflict();
      rows.splice(index, 1);
    } else {
      const before = expected as unknown as Record<string, unknown>;
      const after = desired as unknown as Record<string, unknown>;
      if (change.resource === 'setlist') {
        const currentSetlist = current as Setlist;
        const fromOrder=direction==='undo'?change.order?.after:change.order?.before;
        const toOrder=direction==='undo'?change.order?.before:change.order?.after;
        if(fromOrder && historySignature(currentSetlist.songs.map(item=>item.id))!==historySignature(fromOrder))throw new WorkspaceHistoryConflict();
        const byId=new Map(currentSetlist.songs.map(item=>[item.id,item]));
        for(const edit of change.entries??[]) {
          const from=direction==='undo'?edit.after:edit.before, to=direction==='undo'?edit.before:edit.after;
          const item=byId.get(edit.id);
          if(!from) { if(item||!to)throw new WorkspaceHistoryConflict();byId.set(edit.id,structuredClone(to)); }
          else if(!item)throw new WorkspaceHistoryConflict();
          else if(!to) {if(historySignature(item)!==historySignature(from))throw new WorkspaceHistoryConflict();byId.delete(edit.id);}
          else byId.set(edit.id,mergeFields(item as unknown as Record<string,unknown>,from as unknown as Record<string,unknown>,to as unknown as Record<string,unknown>) as unknown as SetlistSong);
        }
        const ids=toOrder??currentSetlist.songs.map(item=>item.id);
        if(ids.length!==byId.size||ids.some(id=>!byId.has(id)))throw new WorkspaceHistoryConflict();
        rows[index]={...mergeFields(currentSetlist as unknown as Record<string,unknown>,before,after),songs:ids.map((id,order)=>({...byId.get(id)!,order})),updatedAt:Date.now()} as unknown as Setlist;
        continue;
      }
      rows[index] = { ...mergeFields(current as unknown as Record<string, unknown>, before, after), updatedAt: Date.now() } as unknown as HistoryValue;
    }
  }
  return result;
}
