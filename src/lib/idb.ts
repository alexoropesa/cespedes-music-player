/* Minimal IndexedDB blob store for cover art (the audio lives on disk). The DB name predates that. */

const DB = "bitferalda-audio";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

export const idbPut = (key: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, key));
export const idbGet = (key: string) => tx<Blob | undefined>("readonly", (s) => s.get(key));
export const idbDel = (key: string) => tx("readwrite", (s) => s.delete(key)).catch(() => undefined);
export const idbClear = () => tx("readwrite", (s) => s.clear()).catch(() => undefined);
