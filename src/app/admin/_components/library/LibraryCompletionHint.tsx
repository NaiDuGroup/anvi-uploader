"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import { libraryHintMissingCount } from "@/lib/library/libraryHint";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { libraryOrderNumber } from "./libraryClient";
import { SaveToLibraryDialog } from "./SaveToLibraryDialog";
import type { LibraryOwner } from "./LibraryOwnerField";

export interface LibraryHintOrder {
  orderId: string;
  orderNumber: number;
  orderClient: LibraryOwner | null;
  /** Stored order files that could go to the library (`libraryHintCandidateIds`). */
  fileIds: string[];
  fileCount: number;
}

/** The hint goes away on its own if nobody reacts. */
const AUTO_HIDE_MS = 20_000;

/**
 * «Сохранить макеты в библиотеку?» after staff set an order to ready /
 * delivered: a toast in the corner (never blocks the status change), shown
 * only when some of the order's files are not in the library yet. The button
 * opens the usual «Все в библиотеку» dialog.
 */
export function LibraryCompletionHint({ order, onClose }: { order: LibraryHintOrder; onClose: () => void }) {
  const d = useLanguageStore((s) => s.t.library);
  const [missing, setMissing] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/library/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: order.fileIds.slice(0, 200) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { inLibrary?: Record<string, string>; archived?: Record<string, string> } | null) => {
        if (cancelled) return;
        const n = body ? libraryHintMissingCount(order.fileIds, body) : 0;
        if (n === 0) onClose();
        else setMissing(n);
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [order, onClose]);

  useEffect(() => {
    if (missing === null || dialogOpen) return;
    const tmr = setTimeout(onClose, AUTO_HIDE_MS);
    return () => clearTimeout(tmr);
  }, [missing, dialogOpen, onClose]);

  if (dialogOpen) {
    return (
      <SaveToLibraryDialog
        target={{
          kind: "order",
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          fileCount: order.fileCount,
          orderClient: order.orderClient,
        }}
        onClose={onClose}
      />
    );
  }
  if (missing === null) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[55] mx-auto max-w-sm rounded-xl border border-amber-200 bg-white p-3 text-gray-900 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4"
      data-testid="library-completion-hint"
    >
      <div className="flex items-start gap-2">
        <BookmarkPlus className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{d.hintTitle}</p>
          <p className="mt-0.5 text-xs text-gray-600">{d.hintText(libraryOrderNumber(order.orderNumber), missing)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
              data-testid="library-hint-open"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
              {d.hintAction}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg px-3 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              {d.hintDismiss}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
          aria-label={d.close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
