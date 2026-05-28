"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import dynamic from "next/dynamic";
import {
  RefreshCw,
  Flame,
  MessageCircle,
  ScanLine,
  Coffee,
  BookOpen,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Loader2,
  Layers,
  Package,
  UserCheck,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileThumb } from "@/components/FileThumb";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useWorkshopBoardStore } from "@/stores/useWorkshopBoardStore";
import { cn } from "@/lib/utils";
import { StatusDropdown } from "@/app/admin/_components/StatusDropdown";
import type { ProductType } from "@/lib/validations";
import type {
  WorkshopBoardSection,
  WorkshopBoardGroup,
  WorkshopBoardLine,
  WorkshopBoardFile,
} from "@/lib/workshopBoard/types";
import { SECTION_ORDER } from "@/lib/workshopBoard/types";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import type { OrderStatus } from "@/lib/validations";

const CommentPanel = dynamic(() => import("./CommentPanel"), { ssr: false });
const IssueReasonModal = dynamic(() => import("./IssueReasonModal"), { ssr: false });
const LayoutPlannerModal = dynamic(
  () => import("./LayoutPlannerModal").then((m) => m.LayoutPlannerModal),
  { ssr: false },
);
const DateRangeFilter = dynamic(() =>
  import("./DateRangeFilter").then((m) => m.DateRangeFilter),
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface WorkshopBoardClientProps {
  currentUser: CurrentUser;
}

type SavingState = { orderId: string; kind: "status" | "prio" } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<ProductType, React.ReactNode> = {
  large_format_print: <ScanLine className="h-4 w-4 shrink-0" aria-hidden />,
  mug: <Coffee className="h-4 w-4 shrink-0" aria-hidden />,
  notebook: <BookOpen className="h-4 w-4 shrink-0" aria-hidden />,
  paper_print: <FileText className="h-4 w-4 shrink-0" aria-hidden />,
};

const SECTION_COLORS: Record<ProductType, string> = {
  large_format_print: "border-sky-200 bg-sky-50 text-sky-900",
  mug: "border-amber-200 bg-amber-50 text-amber-900",
  notebook: "border-emerald-200 bg-emerald-50 text-emerald-900",
  paper_print: "border-violet-200 bg-violet-50 text-violet-900",
};

const GROUP_BORDER_COLORS: Record<ProductType, string> = {
  large_format_print: "border-l-sky-400",
  mug: "border-l-amber-400",
  notebook: "border-l-emerald-400",
  paper_print: "border-l-violet-400",
};

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// ─── File Thumbnail strip ─────────────────────────────────────────────────────

function FileThumbnailStrip({ files }: { files: WorkshopBoardFile[] }) {
  const shown = files.slice(0, 4);
  const rest = files.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((f) => {
        const downloadUrl = isExternalUrl(f.fileUrl) ? f.fileUrl : `/api/download/${f.id}`;
        return (
          <div key={f.id} title={f.fileName}>
            <FileThumb
              fileId={f.id}
              fileName={f.fileName}
              onClick={() => { window.open(downloadUrl, "_blank"); }}
            />
          </div>
        );
      })}
      {rest > 0 && (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-[10px] font-semibold text-gray-500">
          +{rest}
        </span>
      )}
    </div>
  );
}

// ─── Line card ────────────────────────────────────────────────────────────────

function BoardLineCard({
  line,
  isWorkshop,
  saving,
  onStatusChange,
  onTogglePrio,
  onComment,
}: {
  line: WorkshopBoardLine;
  isWorkshop: boolean;
  saving: SavingState;
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  onTogglePrio: (orderId: string, currentPrio: boolean) => Promise<void>;
  onComment: (orderId: string) => void;
}) {
  const { t } = useLanguageStore();
  const ref = formatOrderLineItemRef(line.orderNumber, line.lineIndex, line.totalLines);
  const isSaving = saving?.orderId === line.orderId;
  const isPrioSaving = isSaving && saving?.kind === "prio";
  const isStatusSaving = isSaving && saving?.kind === "status";

  const lineSummary = (() => {
    switch (line.facts.kind) {
      case "lf": {
        const { materialName, widthCm, heightCm, quantity } = line.facts.data;
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <ScanLine className="h-3 w-3 shrink-0 text-sky-600" aria-hidden />
            <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={materialName}>
              {materialName}
            </span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="tabular-nums shrink-0">{widthCm}×{heightCm} см</span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 leading-none">
              {t.admin.lfFilePrintCopiesBadge(quantity)}
            </span>
          </div>
        );
      }
      case "mug": {
        const { displayName, quantity } = line.facts.data;
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <Coffee className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
            <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={displayName}>
              {displayName}
            </span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 leading-none">
              {t.admin.orderSkuPiecesBadge(quantity)}
            </span>
          </div>
        );
      }
      case "notebook": {
        const { displayName, quantity, paperKind } = line.facts.data;
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
            <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={displayName}>
              {displayName}
            </span>
            {paperKind && (
              <>
                <span className="text-gray-300" aria-hidden>·</span>
                <span className="text-gray-500">{paperKind}</span>
              </>
            )}
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 leading-none">
              {t.admin.orderSkuPiecesBadge(quantity)}
            </span>
          </div>
        );
      }
      case "paper": {
        const { paperType, color, quantity } = line.facts.data;
        const colorLabel = color === "color"
          ? t.workshopBoard.paperColorLabel
          : color === "bw"
            ? t.workshopBoard.paperBwLabel
            : t.workshopBoard.paperMixedLabel;
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <FileText className="h-3 w-3 shrink-0 text-violet-600" aria-hidden />
            <span className="font-medium text-gray-800">{paperType}</span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span>{colorLabel}</span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 leading-none">
              ×{quantity}
            </span>
          </div>
        );
      }
    }
  })();

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-colors",
        line.isPrio && "border-l-4 border-l-red-400 bg-red-50/30",
        line.unreadCommentCount > 0 && !line.isPrio && "border-l-4 border-l-blue-400",
      )}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {ref}
          </span>
          {line.isPrio && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 leading-none">
              <Flame className="h-2.5 w-2.5" aria-hidden />
              Срочно
            </span>
          )}
          {line.unreadCommentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 leading-none animate-pulse">
              <MessageCircle className="h-2.5 w-2.5" aria-hidden />
              {line.unreadCommentCount}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusDropdown
            order={{ id: line.orderId, status: line.status }}
            t={t}
            isWorkshop={isWorkshop}
            onStatusChange={onStatusChange}
            statusTriggerTestScope="board"
            isSaving={isStatusSaving}
          />
          <button
            type="button"
            title={line.isPrio ? "Снять приоритет" : "Поставить приоритет"}
            onClick={() => { void onTogglePrio(line.orderId, line.isPrio); }}
            disabled={isPrioSaving}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
              line.isPrio
                ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                : "border-gray-200 bg-white text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500",
              isPrioSaving && "opacity-60 cursor-wait",
            )}
          >
            {isPrioSaving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Flame className="h-3.5 w-3.5" aria-hidden />
            }
          </button>
          <button
            type="button"
            title={t.admin.comments}
            onClick={() => onComment(line.orderId)}
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            {line.commentCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
                {line.commentCount > 9 ? "9+" : line.commentCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Client info */}
      <p className="mb-0.5 text-xs text-gray-500">
        <a href={`tel:${line.phone}`} className="font-medium text-gray-700 hover:underline">
          {line.phone}
        </a>
        {line.clientName && (
          <span className="ml-1 text-gray-400">· {line.clientName}</span>
        )}
      </p>

      {/* Created by / Sent to workshop by */}
      <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1">
          <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
          <span>{line.createdByName ?? <span className="italic text-gray-300">клиент</span>}</span>
        </span>
        {(line.sentToWorkshopByName ?? line.createdByName) && (
          <span className="inline-flex items-center gap-1">
            <Send className="h-3 w-3 shrink-0" aria-hidden />
            <span>{line.sentToWorkshopByName ?? line.createdByName}</span>
          </span>
        )}
      </p>

      {/* Line summary */}
      <div className="mb-2">{lineSummary}</div>

      {/* Files */}
      {line.files.length > 0 && (
        <div className="mb-2">
          <FileThumbnailStrip files={line.files} />
        </div>
      )}

      {/* Notes */}
      {line.notes && (
        <p className="mt-1.5 rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-500 line-clamp-2" title={line.notes}>
          {line.notes}
        </p>
      )}

      {/* Created at */}
      <p className="mt-1.5 text-[10px] text-gray-400">
        {new Date(line.createdAt).toLocaleDateString("ru", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

// ─── Group card (material / SKU) ──────────────────────────────────────────────

function BoardGroupCard({
  group,
  productType,
  isWorkshop,
  saving,
  onStatusChange,
  onTogglePrio,
  onComment,
  onAssembleLayout,
}: {
  group: WorkshopBoardGroup;
  productType: ProductType;
  isWorkshop: boolean;
  saving: SavingState;
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  onTogglePrio: (orderId: string, currentPrio: boolean) => Promise<void>;
  onComment: (orderId: string) => void;
  onAssembleLayout: (group: WorkshopBoardGroup) => void;
}) {
  const { t } = useLanguageStore();
  const [collapsed, setCollapsed] = useState(false);
  const { aggregate, meta } = group;
  const isLf = productType === "large_format_print";
  const borderColor = GROUP_BORDER_COLORS[productType];

  return (
    <div className={cn("rounded-xl border border-gray-200 border-l-4 bg-white shadow-sm", borderColor)}>
      {/* Group header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Color swatch for mugs/notebooks */}
            {productType === "mug" && meta.bodyColorHex && (
              <span
                className="inline-block h-4 w-4 shrink-0 rounded-full border border-gray-300 shadow-sm"
                style={{ backgroundColor: meta.bodyColorHex }}
                title="Цвет кружки"
              />
            )}
            {productType === "notebook" && meta.coverColorHex && (
              <span
                className="inline-block h-4 w-4 shrink-0 rounded border border-gray-300 shadow-sm"
                style={{ backgroundColor: meta.coverColorHex }}
                title="Цвет обложки"
              />
            )}
            <h3 className="text-sm font-semibold text-gray-900 truncate max-w-[20rem]" title={group.label}>
              {group.label}
            </h3>
          </div>

          {/* Roll width info for LF */}
          {isLf && meta.rollWidthMeters && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              {t.workshopBoard.rollWidth(meta.rollWidthMeters)}
            </p>
          )}

          {/* Aggregate badges */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 leading-none">
              <Layers className="h-3 w-3 shrink-0" aria-hidden />
              {t.workshopBoard.groupLinesCount(aggregate.lineCount)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 leading-none">
              <Package className="h-3 w-3 shrink-0" aria-hidden />
              {t.workshopBoard.groupOrdersCount(aggregate.orderCount)}
            </span>
            {isLf && aggregate.totalLinearMeters !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 leading-none">
                {t.workshopBoard.groupTotalLm(aggregate.totalLinearMeters)}
              </span>
            )}
            {!isLf && (
              <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 leading-none">
                {t.workshopBoard.groupTotalQty(aggregate.totalQty)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Assemble layout button for LF groups */}
          {isLf && (
            <button
              type="button"
              onClick={() => onAssembleLayout(group)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-600 hover:bg-sky-100 hover:border-sky-400 transition-colors"
            >
              <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.workshopBoard.assembleLayoutCta}
            </button>
          )}
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            title={collapsed ? "Развернуть" : "Свернуть"}
          >
            {collapsed
              ? <ChevronDown className="h-4 w-4" aria-hidden />
              : <ChevronUp className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Lines */}
      {!collapsed && (
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {group.lines.map((line) => (
            <BoardLineCard
              key={line.uid}
              line={line}
              isWorkshop={isWorkshop}
              saving={saving}
              onStatusChange={onStatusChange}
              onTogglePrio={onTogglePrio}
              onComment={onComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function BoardSection({
  section,
  isWorkshop,
  saving,
  onStatusChange,
  onTogglePrio,
  onComment,
  onAssembleLayout,
}: {
  section: WorkshopBoardSection;
  isWorkshop: boolean;
  saving: SavingState;
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  onTogglePrio: (orderId: string, currentPrio: boolean) => Promise<void>;
  onComment: (orderId: string) => void;
  onAssembleLayout: (group: WorkshopBoardGroup) => void;
}) {
  const { t } = useLanguageStore();
  const [collapsed, setCollapsed] = useState(false);
  const pt = section.productType;

  const sectionLabel: Record<ProductType, string> = {
    large_format_print: t.workshopBoard.sectionLf,
    mug: t.workshopBoard.sectionMug,
    notebook: t.workshopBoard.sectionNotebook,
    paper_print: t.workshopBoard.sectionPaper,
  };

  const colorClass = SECTION_COLORS[pt];

  return (
    <section className="mb-6">
      <div
        className={cn(
          "mb-3 flex items-center justify-between rounded-xl border px-4 py-2.5",
          colorClass,
        )}
      >
        <div className="flex items-center gap-2">
          {SECTION_ICONS[pt]}
          <h2 className="text-sm font-bold">{sectionLabel[pt]}</h2>
          <span className="rounded-full border border-current/20 bg-white/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none">
            {section.totals.lineCount}
          </span>
          {pt === "large_format_print" && section.totals.totalLinearMeters !== undefined && (
            <span className="rounded-full border border-current/20 bg-white/60 px-1.5 py-0.5 text-[11px] font-medium leading-none">
              {t.workshopBoard.groupTotalLm(section.totals.totalLinearMeters)}
            </span>
          )}
          {pt !== "large_format_print" && (
            <span className="rounded-full border border-current/20 bg-white/60 px-1.5 py-0.5 text-[11px] font-medium leading-none">
              {t.workshopBoard.groupTotalQty(section.totals.totalQty)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
          title={collapsed ? "Развернуть раздел" : "Свернуть раздел"}
        >
          {collapsed
            ? <ChevronDown className="h-4 w-4" aria-hidden />
            : <ChevronUp className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-4">
          {section.groups.map((group) => (
            <BoardGroupCard
              key={group.key}
              group={group}
              productType={pt}
              isWorkshop={isWorkshop}
              saving={saving}
              onStatusChange={onStatusChange}
              onTogglePrio={onTogglePrio}
              onComment={onComment}
              onAssembleLayout={onAssembleLayout}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function BoardSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useLanguageStore();
  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.admin.searchPlaceholder}
        className="pl-9 pr-8 h-9 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-gray-400 hover:text-gray-600"
          aria-label={t.admin.clearSearch}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkshopBoardClient({ currentUser }: WorkshopBoardClientProps) {
  const { t, locale } = useLanguageStore();
  const data = useWorkshopBoardStore((s) => s.data);
  const loading = useWorkshopBoardStore((s) => s.loading);
  const filters = useWorkshopBoardStore((s) => s.filters);
  const fetchBoard = useWorkshopBoardStore((s) => s.fetch);
  const setSearch = useWorkshopBoardStore((s) => s.setSearch);
  const setDateFilter = useWorkshopBoardStore((s) => s.setDateFilter);
  const setIncludeDelivered = useWorkshopBoardStore((s) => s.setIncludeDelivered);

  const isWorkshop = currentUser.role === "workshop";

  const [searchInput, setSearchInput] = useState(filters.search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const [saving, setSaving] = useState<SavingState>(null);
  const [commentOrder, setCommentOrder] = useState<{ id: string; orderNumber: number } | null>(null);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [layoutGroup, setLayoutGroup] = useState<WorkshopBoardGroup | null>(null);

  // Initial fetch
  useEffect(() => {
    fetchBoard().catch(() => {});
  }, [fetchBoard]);

  // Polling every 10s
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      startTransition(() => {
        fetchBoard(true).catch(() => {});
      });
    }, 10_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchBoard]);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput, setSearch]);

  // ── Mutation handlers ──────────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: string) => {
      if (newStatus === "ISSUE") {
        setIssueOrderId(orderId);
        return;
      }
      setSaving({ orderId, kind: "status" });
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus as OrderStatus }),
        });
        if (!res.ok) throw new Error("Failed to update status");
        await fetchBoard(true);
      } finally {
        setSaving(null);
      }
    },
    [fetchBoard],
  );

  const handleConfirmIssue = useCallback(
    async (reason: string) => {
      if (!issueOrderId) return;
      setSaving({ orderId: issueOrderId, kind: "status" });
      try {
        const res = await fetch(`/api/orders/${issueOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ISSUE", issueReason: reason }),
        });
        if (!res.ok) throw new Error("Failed to set issue");
        setIssueOrderId(null);
        await fetchBoard(true);
      } finally {
        setSaving(null);
      }
    },
    [issueOrderId, fetchBoard],
  );

  const handleTogglePrio = useCallback(
    async (orderId: string, currentPrio: boolean) => {
      setSaving({ orderId, kind: "prio" });
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPrio: !currentPrio }),
        });
        if (!res.ok) throw new Error("Failed to toggle prio");
        await fetchBoard(true);
      } finally {
        setSaving(null);
      }
    },
    [fetchBoard],
  );

  // ── Section filtering by active type chip ─────────────────────────────────

  const [activeFilter, setActiveFilter] = useState<ProductType | "all">("all");

  const sections = data?.sections ?? [];
  const visibleSections: WorkshopBoardSection[] =
    activeFilter === "all"
      ? sections
      : sections.filter((s) => s.productType === activeFilter);

  const sectionLabels: Record<ProductType, string> = {
    large_format_print: t.workshopBoard.sectionLf,
    mug: t.workshopBoard.sectionMug,
    notebook: t.workshopBoard.sectionNotebook,
    paper_print: t.workshopBoard.sectionPaper,
  };

  const presentTypes = new Set(sections.map((s) => s.productType));

  // Find orderNumber for comment by searching board lines
  const openComment = useCallback((orderId: string) => {
    const allLines = sections.flatMap((s) => s.groups.flatMap((g) => g.lines));
    const line = allLines.find((l) => l.orderId === orderId);
    setCommentOrder(line ? { id: orderId, orderNumber: line.orderNumber } : { id: orderId, orderNumber: 0 });
  }, [sections]);

  const isEmpty = !loading && sections.length === 0;

  return (
    <>
      {/* Issue reason modal */}
      {issueOrderId && (
        <IssueReasonModal
          onConfirm={handleConfirmIssue}
          onClose={() => setIssueOrderId(null)}
          t={t}
        />
      )}

      {/* Layout planner modal */}
      {layoutGroup && (
        <LayoutPlannerModal
          group={layoutGroup}
          onClose={() => setLayoutGroup(null)}
        />
      )}

      {/* Comment panel */}
      {commentOrder && (
        <CommentPanel
          orderId={commentOrder.id}
          orderNumber={commentOrder.orderNumber}
          t={t}
          onClose={() => {
            setCommentOrder(null);
            fetchBoard(true).catch(() => {});
          }}
        />
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {t.workshopBoard.title}
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBoard().catch(() => {})}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t.workshopBoard.refresh}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <BoardSearchInput value={searchInput} onChange={setSearchInput} />
            <DateRangeFilter
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onChange={setDateFilter}
              locale={locale}
              t={t}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.includeDelivered}
                onChange={(e) => setIncludeDelivered(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-amber-500"
              />
              <span className="text-xs text-gray-500">{t.workshopBoard.includeDelivered}</span>
            </label>
          </div>
        </div>

        {/* Section type chips */}
        {sections.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === "all"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
              )}
            >
              Все · {sections.reduce((n, s) => n + s.totals.lineCount, 0)}
            </button>
            {SECTION_ORDER.filter((pt) => presentTypes.has(pt)).map((pt) => {
              const sec = sections.find((s) => s.productType === pt);
              if (!sec) return null;
              return (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setActiveFilter(pt)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    activeFilter === pt
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  {SECTION_ICONS[pt]}
                  {sectionLabels[pt]}
                  <span className="tabular-nums">{sec.totals.lineCount}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-20 text-center">
            <Package className="mb-3 h-10 w-10 text-gray-300" aria-hidden />
            <p className="text-sm font-medium text-gray-500">{t.workshopBoard.emptyBoard}</p>
          </div>
        )}

        {/* Board sections */}
        {visibleSections.map((section) => (
          <BoardSection
            key={section.productType}
            section={section}
            isWorkshop={isWorkshop}
            saving={saving}
            onStatusChange={handleStatusChange}
            onTogglePrio={handleTogglePrio}
            onComment={openComment}
            onAssembleLayout={setLayoutGroup}
          />
        ))}
      </main>
    </>
  );
}
