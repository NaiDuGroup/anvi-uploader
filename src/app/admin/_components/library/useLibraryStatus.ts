"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Page-wide «В библиотеке» lookup for order files: every `useInLibrary` call
 * within ~30 ms goes out as one `POST /api/admin/library/status`. Value: the
 * library item id, `null` when not in the library, `undefined` while loading.
 */
const cache = new Map<string, string | null>();
/** Files whose library copy is archived (and no active copy): file id → library id. */
const archivedCache = new Map<string, string>();
/** From the server: the current user may restore / edit library items (admins, not the workshop). */
let canManage = false;
const pending = new Set<string>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const CHUNK = 200;

function notify(): void {
  for (const l of listeners) l();
}

async function flush(): Promise<void> {
  timer = null;
  const ids = queue;
  queue = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let found: Record<string, string> = {};
    let archived: Record<string, string> = {};
    try {
      const res = await fetch("/api/admin/library/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          inLibrary?: Record<string, string>;
          archived?: Record<string, string>;
          canManage?: boolean;
        };
        found = body.inLibrary ?? {};
        archived = body.archived ?? {};
        canManage = Boolean(body.canManage);
      }
    } catch {
      // leave them «not in library»; a reload asks again
    }
    for (const id of chunk) {
      pending.delete(id);
      cache.set(id, found[id] ?? null);
      if (archived[id]) archivedCache.set(id, archived[id]!);
      else archivedCache.delete(id);
    }
    notify();
  }
}

function request(id: string): void {
  if (cache.has(id) || pending.has(id)) return;
  pending.add(id);
  queue.push(id);
  if (!timer) timer = setTimeout(() => void flush(), 30);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** After a save: mark files as in the library without asking the server again. */
export function markInLibrary(entries: ReadonlyArray<{ fileId: string; libraryId: string }>): void {
  for (const e of entries) {
    cache.set(e.fileId, e.libraryId);
    archivedCache.delete(e.fileId);
  }
  notify();
}

/** The file's copy turned out to be archived (save refused with `archived_in_library`). */
export function markArchivedInLibrary(fileId: string, libraryId: string): void {
  cache.set(fileId, null);
  archivedCache.set(fileId, libraryId);
  notify();
}

/** Library id of the file's archived copy (none active), else null. */
export function useArchivedInLibrary(fileId: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (fileId ? (archivedCache.get(fileId) ?? null) : null),
    () => null,
  );
}

/** May the current user restore / edit library items (known after the first status answer). */
export function useCanManageLibrary(): boolean {
  return useSyncExternalStore(subscribe, () => canManage, () => false);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useInLibrary(fileId: string | null | undefined): string | null | undefined {
  const value = useSyncExternalStore(
    subscribe,
    () => (fileId ? cache.get(fileId) : null),
    () => undefined,
  );
  useEffect(() => {
    if (fileId && UUID_RE.test(fileId)) request(fileId);
  }, [fileId]);
  return value;
}
