"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FileMetaJson } from "./fileMetaFormat";

/** Staff endpoint; the customer cabinet passes `/api/cabinet/files/meta`. */
export const STAFF_FILE_META_ENDPOINT = "/api/files/meta";
export const CABINET_FILE_META_ENDPOINT = "/api/cabinet/files/meta";

/**
 * Page-wide file facts cache, one per endpoint: every `useFileMeta` call
 * within ~30 ms goes out as one `POST <endpoint>`. `null` = asked, but the
 * server has nothing.
 */
type Store = {
  cache: Map<string, FileMetaJson | null>;
  pending: Set<string>;
  queue: string[];
  timer: ReturnType<typeof setTimeout> | null;
};
const stores = new Map<string, Store>();
const listeners = new Set<() => void>();
const CHUNK = 200;

function storeFor(endpoint: string): Store {
  let s = stores.get(endpoint);
  if (!s) {
    s = { cache: new Map(), pending: new Set(), queue: [], timer: null };
    stores.set(endpoint, s);
  }
  return s;
}

function notify(): void {
  for (const l of listeners) l();
}

async function flush(endpoint: string): Promise<void> {
  const s = storeFor(endpoint);
  s.timer = null;
  const ids = s.queue;
  s.queue = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let meta: Record<string, FileMetaJson> = {};
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk }),
      });
      if (res.ok) meta = ((await res.json()) as { meta: Record<string, FileMetaJson> }).meta ?? {};
    } catch {
      // leave them empty; a reload asks again
    }
    for (const id of chunk) {
      s.pending.delete(id);
      s.cache.set(id, meta[id] ?? null);
    }
    notify();
  }
}

function request(endpoint: string, id: string): void {
  const s = storeFor(endpoint);
  if (s.cache.has(id) || s.pending.has(id)) return;
  s.pending.add(id);
  s.queue.push(id);
  if (!s.timer) s.timer = setTimeout(() => void flush(endpoint), 30);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** File facts for one file; `undefined` while loading. */
export function useFileMeta(
  fileId: string | null | undefined,
  endpoint: string = STAFF_FILE_META_ENDPOINT,
): FileMetaJson | null | undefined {
  const meta = useSyncExternalStore(
    subscribe,
    () => (fileId ? storeFor(endpoint).cache.get(fileId) : null),
    () => undefined,
  );
  useEffect(() => {
    if (fileId) request(endpoint, fileId);
  }, [fileId, endpoint]);
  return meta;
}
