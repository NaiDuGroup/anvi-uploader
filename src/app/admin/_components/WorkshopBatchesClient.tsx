"use client";

/**
 * Client wrapper for `/admin/workshop-batches`. Renders the two batch layout
 * tools (notebook + pen), each above its own 7-day shared history rail. Bumps
 * a per-kind refresh key on every successful upload so the history rail
 * re-fetches without a full page reload.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Layers } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { WorkshopBatchHistoryList } from "./WorkshopBatchHistoryList";

// Both tools use HTMLCanvas + createImageBitmap; SSR would just crash them.
const NotebookBatchLayoutTool = dynamic(
  () =>
    import("./NotebookBatchLayoutTool").then((m) => m.NotebookBatchLayoutTool),
  { ssr: false },
);
const PenBatchLayoutTool = dynamic(
  () => import("./PenBatchLayoutTool").then((m) => m.PenBatchLayoutTool),
  { ssr: false },
);

export default function WorkshopBatchesClient() {
  const { t } = useLanguageStore();
  const s = t.workshopBatches;

  // Bumped after each successful upload; propagated into the corresponding
  // history rail as `refreshKey` to trigger a re-fetch.
  const [notebookRefresh, setNotebookRefresh] = useState(0);
  const [penRefresh, setPenRefresh] = useState(0);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <header className="mb-6 flex items-start gap-3">
        <Layers className="mt-0.5 h-6 w-6 shrink-0 text-gray-500" aria-hidden />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {s.pageTitle}
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-gray-600">
            {s.pageSubtitle}
          </p>
        </div>
      </header>

      <NotebookBatchLayoutTool
        defaultOpen
        onSaved={() => setNotebookRefresh((n) => n + 1)}
      />
      <WorkshopBatchHistoryList kind="notebook" refreshKey={notebookRefresh} />

      <PenBatchLayoutTool
        defaultOpen
        onSaved={() => setPenRefresh((n) => n + 1)}
      />
      <WorkshopBatchHistoryList kind="pen" refreshKey={penRefresh} />
    </main>
  );
}
