"use client";

/**
 * The photos of a storefront design, kept in this browser (IndexedDB) so
 * «Editează designul» can open the design again: the cart (localStorage) only
 * holds their upload keys, and uploads are not readable back by visitors.
 * Best effort — private windows or cleared site data lose them, and the
 * editor then asks for the photos again. Entries older than 30 days go.
 */

const DB_NAME = "anvi_shop_designs";
const STORE = "photos";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface PhotoRow {
  key: string;
  blob: Blob;
  at: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** Remember photos by their upload key (old entries are dropped). */
export async function saveDesignPhotos(photos: readonly { key: string; blob: Blob }[]): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const now = Date.now();
    for (const p of photos) store.put({ key: p.key, blob: p.blob, at: now } satisfies PhotoRow);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return;
      const row = c.value as PhotoRow;
      if (now - row.at > MAX_AGE_MS) c.delete();
      c.continue();
    };
    await done(tx);
  } catch {
    /* storage full / blocked: «edit again» will ask for the photos */
  } finally {
    db.close();
  }
}

/** Photos found for these keys (missing ones are left out). */
export async function loadDesignPhotos(keys: readonly string[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  if (keys.length === 0) return out;
  const db = await open();
  if (!db) return out;
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    for (const k of keys) {
      const req = store.get(k);
      req.onsuccess = () => {
        const row = req.result as PhotoRow | undefined;
        if (row?.blob) out.set(k, row.blob);
      };
    }
    await done(tx);
  } catch {
    /* ignore */
  } finally {
    db.close();
  }
  return out;
}
