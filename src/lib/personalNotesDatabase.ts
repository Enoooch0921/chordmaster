import { type NoteOperation, validNoteOperation } from './personalNotes';

interface NoteRecord { owner: string; song: string; id: string; operation: NoteOperation; pending: boolean }
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('chordmaster-personal-notes', 1);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; reject(new Error('Notes storage timeout')); }, 5000);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore('operations', { keyPath: ['owner', 'song', 'id'] });
    store.createIndex('score', ['owner', 'song']);
  };
  request.onerror = () => { clearTimeout(timer); reject(request.error); };
  request.onsuccess = () => { clearTimeout(timer); request.result.onversionchange = () => request.result.close(); if (timedOut) request.result.close(); else resolve(request.result); };
});
export async function readNoteRecords(owner: string, song: string): Promise<NoteRecord[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('operations', 'readonly');
      const request = tx.objectStore('operations').index('score').getAll([owner, song]);
      tx.oncomplete = () => resolve((request.result as NoteRecord[]).filter(r => validNoteOperation(r.operation)));
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function writeNoteRecords(owner: string, song: string, operations: NoteOperation[], pending: boolean) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite');
      for (const operation of operations) tx.objectStore('operations').put({ owner, song, id: operation.id, operation, pending });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
