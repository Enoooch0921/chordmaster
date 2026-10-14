// Keep large workspace snapshots outside Web Storage's small string quota.
const DATABASE = 'chordmaster-workspaces';
const STORE = 'snapshots';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE, 1);
  let expired = false;
  const timeout = window.setTimeout(() => {
    expired = true;
    reject(new Error('Local workspace storage is temporarily unavailable.'));
  }, 3000);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  request.onsuccess = () => {
    clearTimeout(timeout);
    if (expired) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
});

export const readWorkspaceDatabase = async (): Promise<{ current: unknown; previous: unknown }> => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const current = store.get('current');
      const previous = store.get('previous');
      transaction.oncomplete = () => resolve({ current: current.result, previous: previous.result });
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
};

export const writeWorkspaceDatabase = async (
  serialized: string,
  isValid: (raw: unknown) => boolean,
  legacySnapshot: string | null
) => {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      // Rotation and replacement commit together. Failure leaves both old copies intact.
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Local workspace write failed.'));
      const current = store.get('current');
      current.onsuccess = () => {
        try {
          if (isValid(current.result)) store.put(current.result, 'previous');
          else {
            if (current.result !== undefined) store.put(current.result, 'corrupt');
            if (isValid(legacySnapshot)) store.put(legacySnapshot, 'previous');
          }
          store.put(serialized, 'current');
          const verification = store.get('current');
          verification.onsuccess = () => {
            if (verification.result !== serialized || !isValid(verification.result)) {
              failure = new Error('Local workspace verification failed.');
              transaction.abort();
            }
          };
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
    });
  } finally { db.close(); }
};
