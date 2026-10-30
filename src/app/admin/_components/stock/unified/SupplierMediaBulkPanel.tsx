"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { stockFetch } from "./stockApi";

type BulkResponse = { results: { photos: number; description: boolean }[]; remaining: number };

/**
 * Stock hub: pull photos and descriptions of every Stamina / ROLY item that was
 * never synced, a few items per request until none are left.
 */
export function SupplierMediaBulkPanel({ t }: { t: TranslationDictionary }) {
  const m = t.stock.media;
  const [counts, setCounts] = useState<{ pending: number; total: number } | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stockFetch<{ pending: number; total: number }>("/api/admin/stock/supplier-media")
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  if (!counts || counts.total === 0) return null;

  const run = async (): Promise<void> => {
    setRunning(true);
    setError(null);
    setSummary(null);
    const total: number = counts.pending;
    let done = 0;
    let photos = 0;
    let descriptions = 0;
    setProgress({ done, total });
    try {
      for (let guard = 0; guard < 200; guard++) {
        const res = await stockFetch<BulkResponse>("/api/admin/stock/supplier-media", {
          method: "POST",
          body: { limit: 4 },
        });
        done += res.results.length;
        photos += res.results.reduce((s, r) => s + r.photos, 0);
        descriptions += res.results.filter((r) => r.description).length;
        setProgress({ done, total });
        setCounts({ pending: res.remaining, total: counts.total });
        if (res.remaining === 0 || res.results.length === 0) break;
      }
      setSummary(m.bulkDone(photos, descriptions));
    } catch {
      setError(m.pullFailed);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{m.bulkTitle}</p>
        <p className="text-xs text-gray-500">{m.bulkHint(counts.pending, counts.total)}</p>
        {summary && <p className="mt-1 text-xs text-emerald-700">{summary}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <Button type="button" variant="outline" onClick={() => void run()} disabled={running || counts.pending === 0}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
        {running && progress ? m.bulkRunning(progress.done, progress.total) : counts.pending === 0 ? m.bulkNothing : m.bulkStart}
      </Button>
    </div>
  );
}
