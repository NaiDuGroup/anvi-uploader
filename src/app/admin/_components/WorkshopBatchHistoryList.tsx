"use client";

/**
 * Shared 7-day history rail for the workshop batch tools. Rendered under each
 * tool on `/admin/workshop-batches`, one instance per `kind`.
 *
 * The list is not real-time — the parent bumps `refreshKey` after a successful
 * upload to force a re-fetch. Individual entries can be soft-deleted
 * (`DELETE /api/workshop-batches/[id]`); the underlying R2 object is left
 * alone and will be swept by the `uploads/` lifecycle rule at
 * `createdAt + 7 days`. See `src/lib/workshopBatches/lifecycle.ts`.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { workshopBatchLifecycleStatus } from "@/lib/workshopBatches/lifecycle";
import type { WorkshopBatchKind } from "@/lib/workshopBatches/uploadClient";

interface HistoryItem {
  id: string;
  kind: WorkshopBatchKind;
  fileKey: string;
  fileName: string;
  sizeBytes: number;
  tileCount: number;
  createdAt: string;
  createdByName: string | null;
  previewUrl: string;
  downloadUrl: string;
  expiresAt: string;
}

interface Props {
  kind: WorkshopBatchKind;
  /** Bumped by the parent after a successful compose+upload. */
  refreshKey: number;
}

const ACCENT: Record<WorkshopBatchKind, { border: string; bg: string; text: string; badge: string }> = {
  notebook: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/30",
    text: "text-emerald-900",
    badge: "border-emerald-300 bg-white/70 text-emerald-800",
  },
  pen: {
    border: "border-pink-200",
    bg: "bg-pink-50/30",
    text: "text-pink-900",
    badge: "border-pink-300 bg-white/70 text-pink-800",
  },
  freepack: {
    border: "border-indigo-200",
    bg: "bg-indigo-50/30",
    text: "text-indigo-900",
    badge: "border-indigo-300 bg-white/70 text-indigo-800",
  },
};

function formatCreatedAt(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ExpiryBadge({ createdAt }: { createdAt: string }) {
  const { t } = useLanguageStore();
  const s = t.workshopBatches;
  const status = workshopBatchLifecycleStatus(new Date(createdAt));
  if (status.kind === "expired") {
    return (
      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        {s.historyExpired}
      </span>
    );
  }
  if (status.kind === "expiresToday") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        {s.historyExpiresToday}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
      {s.historyExpiresIn(status.days)}
    </span>
  );
}

export function WorkshopBatchHistoryList({ kind, refreshKey }: Props) {
  const { t, locale } = useLanguageStore();
  const s = t.workshopBatches;
  const accent = ACCENT[kind];

  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/workshop-batches?kind=${encodeURIComponent(kind)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as { items: HistoryItem[] };
      setItems(payload.items);
    } catch (error) {
      console.error("Failed to load workshop batch history:", error);
      setLoadError(s.historyLoadError);
    } finally {
      setLoading(false);
    }
  }, [kind, s.historyLoadError]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems, refreshKey]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(s.historyDeleteConfirm)) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/workshop-batches/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
      } catch (error) {
        console.error("Failed to delete workshop batch:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [s.historyDeleteConfirm],
  );

  const count = items?.length ?? 0;

  return (
    <section className={cn("mb-5 rounded-2xl border shadow-sm", accent.border, accent.bg)}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className={cn("flex items-center gap-2 min-w-0", accent.text)}>
          <History className="h-4 w-4 shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold truncate">
            {s.historyTitle(kind)}
          </h2>
          {count > 0 && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                accent.badge,
              )}
            >
              {s.historyCount(count)}
            </span>
          )}
        </div>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden />
        )}
      </header>

      <div className={cn("border-t px-4 py-3 space-y-2", accent.border)}>
        {loadError && (
          <p className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            {loadError}
          </p>
        )}

        {items && items.length === 0 && !loadError && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white/60 px-3 py-6 text-center text-xs text-gray-500">
            {s.historyEmpty}
          </p>
        )}

        {items && items.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {items.map((it) => {
              const sizeKb = Math.max(1, Math.round(it.sizeBytes / 1024));
              return (
                <li
                  key={it.id}
                  className="flex items-stretch gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.previewUrl}
                    alt={it.fileName}
                    className="h-16 w-24 shrink-0 rounded border border-gray-200 object-contain bg-gray-50"
                    loading="lazy"
                  />
                  <div className="flex min-w-0 flex-1 flex-col justify-between text-[11px]">
                    <div className="min-w-0">
                      <p
                        className="truncate font-semibold text-gray-900"
                        title={it.fileName}
                      >
                        {it.fileName}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
                        <span>{s.historyTileCount(it.tileCount)}</span>
                        <span aria-hidden>·</span>
                        <span>{s.historySizeKb(sizeKb)}</span>
                        <span aria-hidden>·</span>
                        <span>{formatCreatedAt(it.createdAt, locale)}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <ExpiryBadge createdAt={it.createdAt} />
                        {it.createdByName && (
                          <span className="text-gray-500">
                            {s.historyCreatedBy(it.createdByName)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a href={it.downloadUrl} download={it.fileName}>
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          {s.historyDownload}
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleDelete(it.id);
                        }}
                        disabled={deletingId === it.id}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {deletingId === it.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {s.historyDelete}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
