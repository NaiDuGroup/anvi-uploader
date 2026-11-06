"use client";

import type { StudioDoc, StudioKind } from "./document";

/**
 * Studio storage in this browser (IndexedDB `anvi_studio`): photo originals
 * by local id (`blobs`) and documents (`docs`, autosave). Best effort:
 * private windows / blocked storage just keep everything in memory.
 */

const DB_NAME = "anvi_studio";
const BLOBS = "blobs";
const DOCS = "docs";
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export interface StoredStudioDoc {
  id: string;
  kind: StudioKind;
  doc: StudioDoc;
  /** Small JPEG data URL (drafts list, cart). */
  preview?: string | null;
  /** Product / variant the draft was made for. */
  slug?: string | null;
  variantId?: string | null;
  /** Shop step the draft was saved in (resume goes back there). */
  step?: "personalise" | "edit" | "form" | "verify" | "cardShort" | null;
  /** Business cards saved in «Editare rapidă»: its picks (`CardShortState`, parsed back with `parseCardShortState`). */
  cardShort?: unknown;
  /**
   * When it was put in the cart: not a draft to resume any more (the order may
   * be placed and the cart empty by the next visit). The cart line still opens
   * it for editing by id. Kept by later autosaves of the same design.
   */
  cartedAt?: number | null;
  at: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

async function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  try {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    let out: T | null = null;
    if (req) req.onsuccess = () => (out = (req.result as T) ?? null);
    await done(tx);
    return out;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await withStore(BLOBS, "readwrite", (s) => void s.put({ id, blob, at: Date.now() }));
}

export async function getBlob(id: string): Promise<Blob | null> {
  const row = await withStore<{ blob: Blob } | undefined>(BLOBS, "readonly", (s) => s.get(id));
  return row?.blob ?? null;
}

export async function saveDoc(row: Omit<StoredStudioDoc, "at"> & { at?: number }): Promise<void> {
  await withStore(DOCS, "readwrite", (s) => {
    const at: number = row.at ?? Date.now();
    if (row.cartedAt !== undefined) return void s.put({ ...row, at });
    // Autosave after «Adaugă în coș» (e.g. «Continuă editarea»): the design stays out of the drafts.
    const prev = s.get(row.id);
    prev.onsuccess = () => {
      const cartedAt: number | null = (prev.result as StoredStudioDoc | undefined)?.cartedAt ?? null;
      s.put({ ...row, at, ...(cartedAt ? { cartedAt } : {}) });
    };
  });
}

/**
 * Drafts the customer may resume on the product `slug`: made for that very
 * product (a TALBOT draft is not offered on LOIS, a BUKS one not on the magic
 * mug — print size and look differ), something on them and never put in the
 * cart. Drafts saved without a product are not offered. Pure.
 */
export function resumableDrafts(rows: readonly StoredStudioDoc[], cartDocIds: readonly string[], slug: string): StoredStudioDoc[] {
  return rows.filter((d) => d.slug === slug && !d.cartedAt && !cartDocIds.includes(d.id) && d.doc.surfaces.some((s) => s.layers.length > 0));
}

export async function loadDoc(id: string): Promise<StoredStudioDoc | null> {
  return (await withStore<StoredStudioDoc | undefined>(DOCS, "readonly", (s) => s.get(id))) ?? null;
}

export async function deleteDoc(id: string): Promise<void> {
  await withStore(DOCS, "readwrite", (s) => void s.delete(id));
}

/** Drafts of a product kind, newest first (old ones are dropped). */
export async function listDocs(kind?: StudioKind): Promise<StoredStudioDoc[]> {
  const all = (await withStore<StoredStudioDoc[]>(DOCS, "readonly", (s) => s.getAll())) ?? [];
  const now = Date.now();
  const stale = all.filter((d) => now - d.at > MAX_AGE_MS);
  if (stale.length) void withStore(DOCS, "readwrite", (s) => stale.forEach((d) => s.delete(d.id)));
  return all.filter((d) => now - d.at <= MAX_AGE_MS && (!kind || d.kind === kind)).sort((a, b) => b.at - a.at);
}
