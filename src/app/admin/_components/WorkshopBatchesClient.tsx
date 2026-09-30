"use client";

/**
 * Client wrapper for `/admin/workshop-batches`. Renders the two batch layout
 * tools (notebook + pen) inside separate tabs so the workshop operator only
 * sees one workflow at a time. Both tabs are kept mounted (toggled via
 * `hidden` rather than unmounted) so that any files a user has already
 * dropped into one tool survive a tab switch. Each tab has its own 7-day
 * shared history rail; a per-kind refresh key is bumped on every successful
 * upload so the history rail re-fetches without a full page reload.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { BookOpen, Layers, Pencil } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
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

type Tab = "notebook" | "pen";

const TAB_ORDER: readonly Tab[] = ["notebook", "pen"];

const TAB_ACCENT: Record<
  Tab,
  {
    icon: typeof BookOpen;
    active: string;
  }
> = {
  notebook: {
    icon: BookOpen,
    active: "border-emerald-500 bg-emerald-50 text-emerald-900",
  },
  pen: {
    icon: Pencil,
    active: "border-pink-500 bg-pink-50 text-pink-900",
  },
};

export default function WorkshopBatchesClient() {
  const { t } = useLanguageStore();
  const s = t.workshopBatches;

  const [activeTab, setActiveTab] = useState<Tab>("notebook");

  // Bumped after each successful upload; propagated into the corresponding
  // history rail as `refreshKey` to trigger a re-fetch.
  const [notebookRefresh, setNotebookRefresh] = useState(0);
  const [penRefresh, setPenRefresh] = useState(0);

  const tabLabels: Record<Tab, string> = {
    notebook: s.tabNotebook,
    pen: s.tabPen,
  };

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <header className="mb-5 flex items-start gap-3">
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

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label={s.pageTitle}
        className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-200"
      >
        {TAB_ORDER.map((tab) => {
          const Icon = TAB_ACCENT[tab].icon;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`workshop-batches-panel-${tab}`}
              id={`workshop-batches-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? TAB_ACCENT[tab].active
                  : "border-transparent text-gray-500 hover:text-gray-800",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {tabLabels[tab]}
            </button>
          );
        })}
      </div>

      {/* Notebook panel */}
      <section
        role="tabpanel"
        id="workshop-batches-panel-notebook"
        aria-labelledby="workshop-batches-tab-notebook"
        hidden={activeTab !== "notebook"}
      >
        <NotebookBatchLayoutTool
          defaultOpen
          onSaved={() => setNotebookRefresh((n) => n + 1)}
        />
        <WorkshopBatchHistoryList
          kind="notebook"
          refreshKey={notebookRefresh}
        />
      </section>

      {/* Pen panel */}
      <section
        role="tabpanel"
        id="workshop-batches-panel-pen"
        aria-labelledby="workshop-batches-tab-pen"
        hidden={activeTab !== "pen"}
      >
        <PenBatchLayoutTool
          defaultOpen
          onSaved={() => setPenRefresh((n) => n + 1)}
        />
        <WorkshopBatchHistoryList kind="pen" refreshKey={penRefresh} />
      </section>
    </main>
  );
}
