"use client";

import { useEffect, useState } from "react";
import type { FileMetaJson } from "./fileMetaFormat";
import { readLocalFileMeta } from "./localFileMeta";

const cache = new WeakMap<File, Promise<FileMetaJson>>();

/** Facts of a picked (not yet uploaded) file; `undefined` while reading. */
export function useLocalFileMeta(file: File | null | undefined): FileMetaJson | undefined {
  const [state, setState] = useState<{ file: File; meta: FileMetaJson } | null>(null);
  useEffect(() => {
    if (!file) return;
    let job = cache.get(file);
    if (!job) {
      job = readLocalFileMeta(file);
      cache.set(file, job);
    }
    let alive = true;
    void job.then((meta) => alive && setState({ file, meta }));
    return () => {
      alive = false;
    };
  }, [file]);
  return file && state?.file === file ? state.meta : undefined;
}

/** Read several picked files at once (cabinet submit check). */
export function readLocalFileMetaCached(file: File): Promise<FileMetaJson> {
  let job = cache.get(file);
  if (!job) {
    job = readLocalFileMeta(file);
    cache.set(file, job);
  }
  return job;
}
