"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Page-wide «В библиотеке» lookup for order files: every `useInLibrary` call
 * within ~30 ms goes out as one `POST /api/admin/library/status`. Value: the
 * library item id, `null` when not in the library, `undefined` while loading.
 */
const cache = new Map<string, string | null>();
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
    try {
      const res = await fetch("/api/admin/library/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      if (res.ok) found = ((await res.json()) as { inLibrary?: Record<string, string> }).inLibrary ?? {};
    } catch {
      // leave them «not in library»; a reload asks again
    }
    for (const id of chunk) {
      pending.delete(id);
      cache.set(id, found[id] ?? null);
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
  for (const e of entries) cache.set(e.fileId, e.libraryId);
  notify();
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
