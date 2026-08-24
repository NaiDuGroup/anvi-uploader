"use client";

import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "./doc";
import { resolveDesignFileUrl } from "./fileUrls";

/**
 * Loads every bitmap referenced by the document and returns them keyed by
 * `fileKey`. The returned map identity changes whenever a new image finishes
 * decoding, which is what triggers a canvas re-render.
 *
 * Images are cached per module so switching designs (or re-adding the same
 * clipart) never re-downloads.
 */

const globalCache = new Map<string, HTMLImageElement>();

function loadImage(fileKey: string): Promise<HTMLImageElement> {
  const cached = globalCache.get(fileKey);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      globalCache.set(fileKey, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load ${fileKey}`));
    img.src = resolveDesignFileUrl(fileKey);
  });
}

function snapshotCached(keys: readonly string[]): Map<string, HTMLImageElement> {
  const next = new Map<string, HTMLImageElement>();
  for (const key of keys) {
    const img = globalCache.get(key);
    if (img) next.set(key, img);
  }
  return next;
}

export function useDesignImages(doc: DesignDoc): {
  images: ReadonlyMap<string, HTMLImageElement>;
  loading: boolean;
} {
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const el of doc.elements) {
      if (el.kind === "image") out.push(el.fileKey);
    }
    return out;
  }, [doc.elements]);

  const keysSignature = keys.join("|");
  const missing = keys.filter((k) => !globalCache.has(k));

  // Bumped from the async callback so a completed download re-reads the cache.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(missing.map(loadImage)).then(() => {
      if (!cancelled) setGeneration((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // `missing` is derived from keys + cache; the signature is the stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature]);

  const images = useMemo(
    () => snapshotCached(keys),
    // generation is intentional: it invalidates after async loads finish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keysSignature, generation],
  );

  return { images, loading: missing.length > 0 };
}

/** Preload an image outside of React (e.g. right after an upload). */
export async function preloadDesignImage(fileKey: string): Promise<HTMLImageElement> {
  return loadImage(fileKey);
}
