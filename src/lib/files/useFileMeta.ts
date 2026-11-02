"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FileMetaJson } from "./fileMetaFormat";

/**
 * Page-wide file facts cache: every `useFileMeta` call within ~30 ms goes out
 * as one `POST /api/files/meta`. `null` = asked, but the server has nothing.
 */
const cache = new Map<string, FileMetaJson | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
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
    let meta: Record<string, FileMetaJson> = {};
    try {
      const res = await fetch("/api/files/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      if (res.ok) meta = ((await res.json()) as { meta: Record<string, FileMetaJson> }).meta ?? {};
    } catch {
      // leave them empty; a reload asks again
    }
    for (const id of chunk) {
      pending.delete(id);
      cache.set(id, meta[id] ?? null);
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

/** File facts for one file; `undefined` while loading. */
export function useFileMeta(fileId: string | null | undefined): FileMetaJson | null | undefined {
  const meta = useSyncExternalStore(
    subscribe,
    () => (fileId ? cache.get(fileId) : null),
    () => undefined,
  );
  useEffect(() => {
    if (fileId) request(fileId);
  }, [fileId]);
  return meta;
}
