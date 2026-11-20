"use client";

import { GiftSetBadge } from "@/components/orders/GiftSetBadge";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  RefreshCw,
  Flame,
  MessageCircle,
  ScanLine,
  Download,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Loader2,
  Layers,
  Package,
  UserCheck,
  Send,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useWorkshopBoardStore } from "@/stores/useWorkshopBoardStore";
import { cn } from "@/lib/utils";
import { StatusDropdown } from "@/app/admin/_components/StatusDropdown";
import type {
  WorkshopBoardSection,
  WorkshopBoardGroup,
  WorkshopBoardLine,
  LfRollCandidate,
  BoardSectionKey,
} from "@/lib/workshopBoard/types";
import { summarizeSection } from "@/lib/workshopBoard/sectionSummary";
import { PRODUCT_TYPE_UI } from "./workshopBoard/productTypeUi";
import { DtfFilmLayoutButton, UvDtfFilmLayoutButton } from "./workshopBoard/DtfBoardParts";
import { BoardLineFacts } from "./workshopBoard/BoardLineFacts";
import { FileThumbnailStrip, OpenFileContext, type LightboxFile } from "./workshopBoard/BoardFiles";
import { BOARD_HIGHLIGHT_MS, BoardOrderPanelContext, useBoardOrderPanel, type BoardOrderHighlight } from "./workshopBoard/orderPanelContext";
import { orderLinesOnBoard } from "@/lib/workshopBoard/orderOverviewAccess";
import { TypeOverviewGrid } from "./workshopBoard/TypeOverviewGrid";
import { prepareTiles } from "@/lib/largeFormat/layoutTiles";
import { evaluateLfRollOptions } from "@/lib/largeFormat/lfRollChoice";
import { lfSheetSizeCmLabel } from "@/lib/largeFormat/lfSheet";
import { GROUP_TILE_PACK_DEFAULT_GAP_CM } from "@/lib/largeFormat/groupTilePack";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import type { OrderStatus } from "@/lib/validations";
import { DealerEditedBadge } from "./DealerEditedBadge";
import { DealerUrgencyBadge } from "./DealerUrgencyBadge";
import { boardLineStatus, type SettableLineStatus } from "@/lib/orderStatusFromLines";
import { isLineHeldForLayout, isLineNeedsLayout, type LayoutIssueReason } from "@/lib/layoutIssue";
import { clearLineLayoutIssue, flagLineLayoutIssue } from "@/lib/layoutIssueClient";
import { canDownloadSheetLayout } from "@/lib/workshopBoard/productionPick";
import { boardLineKey, isLegacyBoardLine, patchOrderLineStatus } from "@/lib/workshopBoard/lineStatusClient";
import { orderStatusWriteNotice, readOrderStatusWriteResponse } from "@/lib/orderStatusWriteClient";
import { StatusWriteNotice, useStatusWriteNotice } from "./StatusWriteNotice";
import {
  LineLayoutIssueInfo,
  LineStatusContext,
  LineStatusControls,
  lineDoneOnBoard,
  lineStatusEditable,
  shownLineStatus,
  useLineStatus,
} from "./workshopBoard/LineStatusControls";
import type { IssueReasonKey } from "../_lib/constants";

const CommentPanel = dynamic(() => import("./CommentPanel"), { ssr: false });
const OrderOverviewDrawer = dynamic(
  () => import("./workshopBoard/OrderOverviewDrawer").then((m) => m.OrderOverviewDrawer),
  { ssr: false },
);
const IssueReasonModal = dynamic(() => import("./IssueReasonModal"), { ssr: false });
const LayoutIssueModal = dynamic(() => import("./LayoutIssueModal"), { ssr: false });
const ClearLayoutIssueDialog = dynamic(() => import("./ClearLayoutIssueDialog"), { ssr: false });
const StaffReplaceLayoutFileDialog = dynamic(() => import("./StaffReplaceLayoutFileDialog"), { ssr: false });
const SheetLayoutPlannerModal = dynamic(
  () => import("./SheetLayoutPlannerModal").then((m) => m.SheetLayoutPlannerModal),
  { ssr: false },
);
const LayoutPlannerModal = dynamic(
  () => import("./LayoutPlannerModal").then((m) => m.LayoutPlannerModal),
  { ssr: false },
);
const SendNotebookSectionToWorkshopModal = dynamic(
  () => import("./SendNotebookSectionToWorkshopModal"),
  { ssr: false },
);
const SendMugSectionToWorkshopModal = dynamic(
  () => import("./SendMugSectionToWorkshopModal"),
  { ssr: false },
);
const DateRangeFilter = dynamic(() =>
  import("./DateRangeFilter").then((m) => m.DateRangeFilter),
);
const FileLightbox = dynamic(
  () => import("@/components/FileLightbox").then((m) => m.FileLightbox),
  { ssr: false },
);
// Notebook and pen batch composer tools have moved to their own page at
// `/admin/workshop-batches` (see WorkshopBatchesClient). Keeping the workshop
// board focused on orders — the batch tools now also persist a 7-day history
// which would clutter this dense layout.

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
  const { openOrder, highlight } = useBoardOrderPanel();
  const highlighted = highlight?.orderId === line.orderId;

  const lineSummary = <BoardLineFacts line={line} />;

  // A done line of an order still on the board: kept visible, marked ✓ and de-emphasised.
  const done = lineDoneOnBoard(line);
  // «Нужен макет»: the line is paused until a new file comes.
  const needsLayout = isLineNeedsLayout(line.lineStatus);

  return (
    <div
      data-testid={`board-line-${line.orderLineId}`}
      data-line-status={line.lineStatus}
      data-board-order={line.orderId}
      data-highlighted={highlighted ? "true" : undefined}
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-colors",
        highlighted && "animate-pulse ring-2 ring-amber-400 ring-offset-2",
        line.isPrio && !done && !needsLayout && "border-l-4 border-l-red-400 bg-red-50/30",
        line.unreadCommentCount > 0 && !line.isPrio && !done && !needsLayout && "border-l-4 border-l-blue-400",
        needsLayout && "border-amber-200 border-l-4 border-l-amber-400 bg-amber-50/40",
        done && "border-emerald-200 bg-emerald-50/40 opacity-70 hover:opacity-100",
      )}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openOrder(line.orderId, line.orderLineId)}
            title={t.orderPanel.openWholeOrder}
            aria-label={`${t.orderPanel.openWholeOrder} ${ref}`}
            data-testid={`board-line-ref-${line.orderLineId}`}
            className="cursor-pointer rounded font-mono text-[10px] font-bold uppercase tracking-wide text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {ref}
          </button>
          {line.isPrio && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 leading-none">
              <Flame className="h-2.5 w-2.5" aria-hidden />
              Срочно
            </span>
          )}
          {line.giftSet ? (
            <GiftSetBadge
              label={line.giftSet.label}
              role={line.giftSet.role}
              note={line.giftSet.packNote ?? null}
              procurement={line.giftSet.procurement ? t.giftSet.boardProcurement : null}
            />
          ) : null}
          {line.dealerEditedAt ? <DealerEditedBadge at={line.dealerEditedAt} t={t} /> : null}
          {line.dealerUrgency ? (
            <DealerUrgencyBadge orderId={line.orderId} urgency={line.dealerUrgency} t={t} allowWaive={false} />
          ) : null}
          {line.unreadCommentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 leading-none animate-pulse">
              <MessageCircle className="h-2.5 w-2.5" aria-hidden />
              {line.unreadCommentCount}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Whole-order status (moves every line): ISSUE, back to the studio, … */}
          <span className="inline-flex items-center gap-1" title={t.lineStatus.orderDropdownHint}>
            <span className="text-[11px] font-medium text-gray-400">
              {t.lineStatus.orderLabel}:
            </span>
            <StatusDropdown
              order={{ id: line.orderId, status: line.status }}
              t={t}
              isWorkshop={isWorkshop}
              onStatusChange={onStatusChange}
              statusTriggerTestScope="board"
              isSaving={isStatusSaving}
            />
          </span>
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

      {/* This line's own production status */}
      <div className="mb-2">
        <LineStatusControls line={line} />
        <LineLayoutIssueInfo line={line} />
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

      {/* Business cards and flyers: build the imposed sheet the workshop prints from. */}
      {line.facts.kind === "sheet_product" && !line.facts.data.sticker && (
        <div className="mb-2">
          <BusinessCardLayoutButton line={line} onStatusChange={onStatusChange} />
        </div>
      )}

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

interface BusinessCardLayoutFile {
  downloadUrl: string;
  fileName: string;
}

type BusinessCardLayoutError = "generic" | "notRaster" | "pdfUnreadable";

function triggerDownload(file: BusinessCardLayoutFile): void {
  const link = document.createElement("a");
  link.href = file.downloadUrl;
  link.download = file.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Builds the sheet imposition (business cards, flyers, postcards) for one line
 * on demand and downloads it as ONE PDF for the Ricoh: page 1 the front, page 2
 * the back (two-sided lines), each page the exact sheet size, ready to print
 * in duplex. The sheets are generated server-side from the
 * grid frozen on the order line, so they always match what the order was
 * priced with. A successful download marks THIS line «Печатается» when it was
 * still waiting (the order's other lines keep their status; the order status
 * is re-derived). A legacy order without lines moves as a whole, as before.
 */
function BusinessCardLayoutButton({
  line,
  onStatusChange,
}: {
  line: WorkshopBoardLine;
  onStatusChange: (orderId: string, status: string) => Promise<void>;
}) {
  const { t } = useLanguageStore();
  const { setLineStatus } = useLineStatus();
  const { orderLineId, orderId, status } = line;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BusinessCardLayoutError | null>(null);
  // «Нужен макет»: the old file must not be imposed.
  const held = !canDownloadSheetLayout(line);

  async function build(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workshop-board/sheet-product-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderLineId }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<BusinessCardLayoutFile> & {
        error?: string;
      };
      if (!res.ok || !body.downloadUrl || !body.fileName) {
        setError(
          body.error === "business_card_artwork_not_raster"
            ? "notRaster"
            : body.error === "sheet_artwork_pdf_unreadable"
              ? "pdfUnreadable"
              : "generic",
        );
        return;
      }
      triggerDownload({ downloadUrl: body.downloadUrl, fileName: body.fileName });
      if (isLegacyBoardLine(orderLineId)) {
        if (status === "SENT_TO_WORKSHOP") await onStatusChange(orderId, "WORKSHOP_PRINTING");
      } else if (lineStatusEditable(line) && shownLineStatus(line) === "WAITING") {
        await setLineStatus(line, "PRINTING");
      }
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || held}
        title={held ? t.layoutIssue.sheetDownloadHeld : undefined}
        data-testid={`line-sheet-layout-download-${orderLineId}`}
        onClick={() => void build()}
        className={cn(
          "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60",
          held ? "disabled:cursor-not-allowed" : "disabled:cursor-wait",
        )}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3 w-3" aria-hidden />
        )}
        {busy ? t.admin.bcLayoutBuilding : t.admin.bcLayoutDownloadBtn}
      </button>
      {held ? (
        <p className="mt-1 text-[11px] text-amber-800" data-testid={`line-sheet-layout-held-${orderLineId}`}>
          {t.layoutIssue.sheetDownloadHeld}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-[11px] text-red-600">
          {error === "notRaster"
            ? t.admin.bcLayoutNotRaster
            : error === "pdfUnreadable"
              ? t.admin.bcLayoutPdfUnreadable
              : t.admin.bcLayoutFailed}
        </p>
      ) : null}
    </>
  );
}

// ─── Group card (material / SKU) ──────────────────────────────────────────────

function BoardGroupCard({
  group,
  sectionKey,
  isWorkshop,
  saving,
  lfRollCandidates,
  onStatusChange,
  onTogglePrio,
  onComment,
  onAssembleLayout,
}: {
  group: WorkshopBoardGroup;
  /** Board section the card sits in (product type, or «uv_dtf»). */
  sectionKey: BoardSectionKey;
  isWorkshop: boolean;
  saving: SavingState;
  lfRollCandidates: LfRollCandidate[];
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  onTogglePrio: (orderId: string, currentPrio: boolean) => Promise<void>;
  onComment: (orderId: string) => void;
  onAssembleLayout: (group: WorkshopBoardGroup) => void;
}) {
  const { t } = useLanguageStore();
  const [collapsed, setCollapsed] = useState(false);
  const { highlight } = useBoardOrderPanel();
  // «Показать на доске»: open the group when it holds a line of that order.
  useEffect(() => {
    if (highlight && group.lines.some((l) => l.orderId === highlight.orderId)) setCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new highlight
  }, [highlight]);
  const { aggregate, meta } = group;
  const productType = sectionKey;
  const isLf = productType === "large_format_print";
  /** Sheet material (VATMAN A1): printed sheet by sheet, no roll layout. */
  const isLfSheet = isLf && meta.lfSheet === true;
  const borderColor = PRODUCT_TYPE_UI[sectionKey].groupBorderClass;

  // Cheapest-roll hint: when the family has ≥2 catalog rolls, pack the whole
  // group on each and surface the winner with its savings vs the alternative.
  const rollHint = useMemo(() => {
    if (!isLf || isLfSheet || !meta.familyKey) return null;
    const candidates = lfRollCandidates.filter(
      (c) => c.familyKey === meta.familyKey,
    );
    if (candidates.length < 2) return null;
    const tiles = prepareTiles(group.lines, new Map(), true);
    if (tiles.length === 0) return null;
    const { evaluations, best } = evaluateLfRollOptions(
      tiles,
      candidates,
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );
    if (!best) return null;
    const runnerUp = evaluations.find((e) => e.fits && e !== best);
    if (!runnerUp) return null;
    const savingsMdl = runnerUp.costMdl - best.costMdl;
    if (savingsMdl <= 0) return null;
    return { name: best.option.name, savingsMdl };
  }, [isLf, isLfSheet, meta.familyKey, lfRollCandidates, group.lines]);

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

          {/* Sheet size for sheet materials (VATMAN A1), roll width for rolls */}
          {isLfSheet
            ? (() => {
                const f = group.lines[0]?.facts;
                const sh = f?.kind === "lf" ? f.data.sheets : undefined;
                return sh ? (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {t.admin.lfSheet.formSheet} {lfSheetSizeCmLabel(sh)} см
                  </p>
                ) : null;
              })()
            : null}
          {isLf && !isLfSheet && meta.rollWidthMeters && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              {t.workshopBoard.rollWidth(meta.rollWidthMeters)}
            </p>
          )}

          {/* Cheaper-roll recommendation for LF families with several rolls */}
          {isLf && rollHint && (
            <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
              {t.workshopBoard.groupCheaperRollHint(rollHint.name, rollHint.savingsMdl)}
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
            {isLfSheet && aggregate.totalSheetsLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 leading-none">
                {aggregate.totalSheetsLabel}
              </span>
            ) : null}
            {(isLf || sectionKey === "uv_dtf") && !isLfSheet && aggregate.totalLinearMeters !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 leading-none">
                {t.workshopBoard.groupTotalLm(aggregate.totalLinearMeters)}
              </span>
            )}
            {/* Ordered-material tally when a family group mixes roll widths */}
            {isLf &&
              meta.materialBreakdown &&
              meta.materialBreakdown.length > 1 &&
              meta.materialBreakdown.map((entry) => (
                <span
                  key={entry.name}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 leading-none"
                  title={entry.name}
                >
                  {entry.name} × {entry.lineCount}
                </span>
              ))}
            {!isLf && (
              <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 leading-none">
                {t.workshopBoard.groupTotalQty(aggregate.totalQty)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Layout button: sheet layout for sheet materials, roll layout for rolls */}
          {isLfSheet && (
            <button
              type="button"
              onClick={() => onAssembleLayout(group)}
              data-testid="lf-sheet-layout-open"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-600 hover:bg-sky-100 hover:border-sky-400 transition-colors"
            >
              <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.workshopBoard.sheetLayoutCta}
            </button>
          )}
          {isLf && !isLfSheet && (
            <button
              type="button"
              onClick={() => onAssembleLayout(group)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-600 hover:bg-sky-100 hover:border-sky-400 transition-colors"
            >
              <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.workshopBoard.assembleLayoutCta}
            </button>
          )}
          {productType === "dtf_apparel" && <DtfFilmLayoutButton group={group} />}
          {sectionKey === "uv_dtf" && <UvDtfFilmLayoutButton group={group} />}
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
  lfRollCandidates,
  onStatusChange,
  onTogglePrio,
  onComment,
  onAssembleLayout,
  onSendNotebookSection,
  onSendMugSection,
}: {
  section: WorkshopBoardSection;
  isWorkshop: boolean;
  saving: SavingState;
  lfRollCandidates: LfRollCandidate[];
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  onTogglePrio: (orderId: string, currentPrio: boolean) => Promise<void>;
  onComment: (orderId: string) => void;
  onAssembleLayout: (group: WorkshopBoardGroup) => void;
  /** Only fires for the notebook section. Opens the auto-batcher modal. */
  onSendNotebookSection: (section: WorkshopBoardSection) => void;
  /** Only fires for the mug section. Opens the A4 sheet auto-batcher modal. */
  onSendMugSection: (section: WorkshopBoardSection) => void;
}) {
  const { t } = useLanguageStore();
  const [collapsed, setCollapsed] = useState(false);
  const { highlight } = useBoardOrderPanel();
  useEffect(() => {
    if (highlight && section.groups.some((g) => g.lines.some((l) => l.orderId === highlight.orderId))) {
      setCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new highlight
  }, [highlight]);
  const pt = section.key;

  // Count tiles whose LINE is still waiting (SENT_TO_WORKSHOP in order-status
  // words; the order may already print something else) — the notebook and mug
  // CTAs use this both for the label ("Assemble · N notebooks") and the
  // disable gate. Notebooks need 2 to fill a grid; a mug sheet accepts one.
  const freshTileCount = useMemo(() => {
    if (pt !== "notebook" && pt !== "mug") return 0;
    let n = 0;
    for (const g of section.groups) {
      for (const l of g.lines) {
        if (boardLineStatus(l.status, l.lineStatus) !== "SENT_TO_WORKSHOP") continue;
        if (isLineHeldForLayout(l)) continue; // «Нужен макет»: not batched
        for (const f of l.files) {
          n += Math.max(1, Math.floor(f.copies || 1));
        }
      }
    }
    return n;
  }, [pt, section.groups]);

  const ui = PRODUCT_TYPE_UI[pt];
  const SectionIcon = ui.icon;

  return (
    <section className="mb-6">
      <div
        className={cn(
          "mb-3 flex items-center justify-between rounded-xl border px-4 py-2.5",
          ui.sectionClass,
        )}
      >
        <div className="flex items-center gap-2">
          <SectionIcon className="h-4 w-4 shrink-0" aria-hidden />
          <h2 className="text-sm font-bold">{ui.label(t)}</h2>
          <span className="rounded-full border border-current/20 bg-white/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none">
            {section.totals.lineCount}
          </span>
          {(pt === "large_format_print" || pt === "uv_dtf") && section.totals.totalLinearMeters !== undefined && (
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
        <div className="flex items-center gap-2">
          {pt === "notebook" && (
            <button
              type="button"
              onClick={() => onSendNotebookSection(section)}
              disabled={freshTileCount < 2}
              title={
                freshTileCount < 2
                  ? t.workshopBoard.sendNotebookSectionNeedMore
                  : undefined
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                freshTileCount >= 2
                  ? "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
                  : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
              )}
            >
              <Send className="h-3 w-3" aria-hidden />
              {t.workshopBoard.sendNotebookSectionCta(freshTileCount)}
            </button>
          )}
          {pt === "mug" && (
            <button
              type="button"
              onClick={() => onSendMugSection(section)}
              disabled={freshTileCount < 1}
              title={
                freshTileCount < 1
                  ? t.workshopBoard.sendMugSectionNeedMore
                  : undefined
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                freshTileCount >= 1
                  ? "border-amber-300 bg-white text-amber-700 hover:bg-amber-100"
                  : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
              )}
            >
              <Send className="h-3 w-3" aria-hidden />
              {t.workshopBoard.sendMugSectionCta(freshTileCount)}
            </button>
          )}
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
      </div>

      {!collapsed && (
        <div className="space-y-4">
          {section.groups.map((group) => (
            <BoardGroupCard
              key={group.key}
              group={group}
              sectionKey={pt}
              isWorkshop={isWorkshop}
              saving={saving}
              lfRollCandidates={lfRollCandidates}
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

const LINE_STATUS_TIP_KEY = "workshop-board-line-status-tip";

function readLineStatusTipDismissed(): boolean {
  try {
    return localStorage.getItem(LINE_STATUS_TIP_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function noopSubscribe(): () => void {
  return () => {};
}

/**
 * One-time tip about per-line statuses. Read after hydration (server render =
 * hidden) so the first client render matches the server markup.
 */
function LineStatusTip() {
  const { t } = useLanguageStore();
  const storedDismissed = useSyncExternalStore(noopSubscribe, readLineStatusTipDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  if (storedDismissed || dismissedNow) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(LINE_STATUS_TIP_KEY, "dismissed");
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setDismissedNow(true);
  };

  return (
    <div
      data-testid="line-status-tip"
      className="mb-4 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden />
        <span>
          <span className="font-semibold">{t.lineStatus.boardTipTitle}</span> {t.lineStatus.boardTipText}
        </span>
      </p>
      <button
        type="button"
        data-testid="line-status-tip-dismiss"
        onClick={dismiss}
        className="h-8 shrink-0 self-end rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 sm:self-auto"
      >
        {t.lineStatus.boardTipDismiss}
      </button>
    </div>
  );
}

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
  const [savingLineKey, setSavingLineKey] = useState<string | null>(null);
  const [commentOrder, setCommentOrder] = useState<{ id: string; orderNumber: number } | null>(null);
  // «Весь заказ» panel (opened from a card's line code) and «Показать на доске».
  const [panelOrder, setPanelOrder] = useState<{ orderId: string; orderLineId: string } | null>(null);
  const [highlight, setHighlight] = useState<BoardOrderHighlight | null>(null);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [layoutGroup, setLayoutGroup] = useState<WorkshopBoardGroup | null>(null);
  const [lightboxFile, setLightboxFile] = useState<LightboxFile | null>(null);
  // Notebook section → "assemble & send to printer" modal. We stash the
  // *whole section* so the modal can snapshot it (status + order ids +
  // files) independently of ongoing board refreshes.
  const [sendModalSection, setSendModalSection] =
    useState<WorkshopBoardSection | null>(null);

  // Same idea for the mug section → A4 sheet auto-batcher.
  const [sendMugModalSection, setSendMugModalSection] =
    useState<WorkshopBoardSection | null>(null);

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

  const { notice: statusNotice, show: showStatusNotice, hide: hideStatusNotice } = useStatusWriteNotice();

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
        const outcome = await readOrderStatusWriteResponse(res);
        // «Нужен макет» lines kept (or the write refused): say so.
        showStatusNotice(orderStatusWriteNotice(t, outcome));
        if (outcome.kind === "error") throw new Error("Failed to update status");
        if (outcome.kind === "ok") await fetchBoard(true);
      } finally {
        setSaving(null);
      }
    },
    [fetchBoard, showStatusNotice, t],
  );

  // One line's own status; the server re-derives the order status.
  const handleLineStatusChange = useCallback(
    async (line: WorkshopBoardLine, status: SettableLineStatus) => {
      setSavingLineKey(boardLineKey(line.orderId, line.orderLineId));
      try {
        await patchOrderLineStatus(line.orderId, [line.orderLineId], status);
      } catch (error) {
        console.error("line status change failed:", error);
        window.alert(t.lineStatus.saveFailed);
      } finally {
        await fetchBoard(true).catch(() => {});
        setSavingLineKey(null);
      }
    },
    [fetchBoard, t],
  );
  // «Нужен макет»: the modal's line, POST on confirm, DELETE on «Снять отметку».
  const [layoutIssueLine, setLayoutIssueLine] = useState<WorkshopBoardLine | null>(null);
  const [layoutIssueSaving, setLayoutIssueSaving] = useState(false);
  const [layoutIssueError, setLayoutIssueError] = useState<string | null>(null);
  const openLayoutIssue = useCallback((line: WorkshopBoardLine) => {
    setLayoutIssueError(null);
    setLayoutIssueLine(line);
  }, []);
  const handleConfirmLayoutIssue = useCallback(
    async (reason: LayoutIssueReason, note: string | null) => {
      const line = layoutIssueLine;
      if (!line) return;
      setLayoutIssueSaving(true);
      setLayoutIssueError(null);
      setSavingLineKey(boardLineKey(line.orderId, line.orderLineId));
      try {
        await flagLineLayoutIssue(line.orderId, line.orderLineId, reason, note);
        setLayoutIssueLine(null);
      } catch (error) {
        console.error("layout issue flag failed:", error);
        setLayoutIssueError(t.layoutIssue.flagFailed);
      } finally {
        await fetchBoard(true).catch(() => {});
        setLayoutIssueSaving(false);
        setSavingLineKey(null);
      }
    },
    [layoutIssueLine, fetchBoard, t],
  );
  // «Снять отметку»: in-page confirm dialog → DELETE.
  const [clearLayoutLine, setClearLayoutLine] = useState<WorkshopBoardLine | null>(null);
  const [clearLayoutError, setClearLayoutError] = useState<string | null>(null);
  const openClearLayout = useCallback(async (line: WorkshopBoardLine) => {
    setClearLayoutError(null);
    setClearLayoutLine(line);
  }, []);
  const handleConfirmClearLayout = useCallback(async () => {
    const line = clearLayoutLine;
    if (!line) return;
    setClearLayoutError(null);
    setSavingLineKey(boardLineKey(line.orderId, line.orderLineId));
    try {
      await clearLineLayoutIssue(line.orderId, line.orderLineId);
      setClearLayoutLine(null);
    } catch (error) {
      console.error("layout issue clear failed:", error);
      setClearLayoutError(t.layoutIssue.clearFailed);
    } finally {
      await fetchBoard(true).catch(() => {});
      setSavingLineKey(null);
    }
  }, [clearLayoutLine, fetchBoard, t]);
  // «Заменить файл»: the staff replace dialog for this line only.
  const [replaceLayoutLine, setReplaceLayoutLine] = useState<WorkshopBoardLine | null>(null);

  const lineStatusContext = useMemo(
    () => ({
      savingKey: savingLineKey,
      setLineStatus: handleLineStatusChange,
      flagLayout: openLayoutIssue,
      clearLayout: openClearLayout,
      replaceLayoutFile: setReplaceLayoutLine,
    }),
    [savingLineKey, handleLineStatusChange, openLayoutIssue, openClearLayout],
  );

  const handleConfirmIssue = useCallback(
    async (reason: string, code: IssueReasonKey) => {
      if (!issueOrderId) return;
      setSaving({ orderId: issueOrderId, kind: "status" });
      try {
        const res = await fetch(`/api/orders/${issueOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ISSUE", issueReason: reason, issueReasonCode: code }),
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

  // ── Section filtering by the overview tiles ──────────────────────────────

  const activeTypeList = useWorkshopBoardStore((s) => s.activeTypes);
  const setActiveTypes = useWorkshopBoardStore((s) => s.setActiveTypes);

  const sections = useMemo(() => data?.sections ?? [], [data]);
  const lfRollCandidates = data?.lfRollCandidates ?? [];
  const summaries = useMemo(() => sections.map(summarizeSection), [sections]);
  // Types picked earlier but gone from the board no longer filter anything.
  const activeTypes = useMemo(() => {
    const present = new Set(sections.map((s) => s.key));
    return new Set(activeTypeList.filter((pt) => present.has(pt)));
  }, [activeTypeList, sections]);
  const visibleSections: WorkshopBoardSection[] =
    activeTypes.size === 0 ? sections : sections.filter((s) => activeTypes.has(s.key));

  const selectType = useCallback(
    (pt: BoardSectionKey, additive: boolean) => {
      if (additive) {
        const next = new Set(activeTypes);
        if (next.has(pt)) next.delete(pt);
        else next.add(pt);
        setActiveTypes([...next]);
      } else {
        const onlyThis = activeTypes.size === 1 && activeTypes.has(pt);
        setActiveTypes(onlyThis ? [] : [pt]);
      }
    },
    [activeTypes, setActiveTypes],
  );

  // Find orderNumber for comment by searching board lines
  const openComment = useCallback((orderId: string) => {
    const allLines = sections.flatMap((s) => s.groups.flatMap((g) => g.lines));
    const line = allLines.find((l) => l.orderId === orderId);
    setCommentOrder(line ? { id: orderId, orderNumber: line.orderNumber } : { id: orderId, orderNumber: 0 });
  }, [sections]);

  const isEmpty = !loading && sections.length === 0;

  const panelLinesOnBoard = useMemo(
    () => (panelOrder ? orderLinesOnBoard(sections, panelOrder.orderId) : new Set<string>()),
    [sections, panelOrder],
  );
  const closePanel = useCallback(() => setPanelOrder(null), []);
  const showOrderOnBoard = useCallback(() => {
    if (!panelOrder) return;
    const { orderId } = panelOrder;
    setPanelOrder(null);
    // A type filter hiding the order's sections is cleared first.
    const hiddenByFilter = sections.some(
      (s) =>
        activeTypes.size > 0 &&
        !activeTypes.has(s.key) &&
        s.groups.some((g) => g.lines.some((l) => l.orderId === orderId)),
    );
    if (hiddenByFilter) setActiveTypes([]);
    setHighlight({ orderId, nonce: Date.now() });
  }, [panelOrder, sections, activeTypes, setActiveTypes]);
  // After the groups expanded: scroll to the first card of the order, then let the highlight fade.
  useEffect(() => {
    if (!highlight) return;
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-board-order="${CSS.escape(highlight.orderId)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => setHighlight(null), BOARD_HIGHLIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [highlight]);
  const orderPanelApi = useMemo(
    () => ({
      openOrder: (orderId: string, orderLineId: string) => setPanelOrder({ orderId, orderLineId }),
      highlight,
    }),
    [highlight],
  );

  return (
    <LineStatusContext.Provider value={lineStatusContext}>
    <BoardOrderPanelContext.Provider value={orderPanelApi}>
    <OpenFileContext.Provider value={setLightboxFile}>
      <StatusWriteNotice notice={statusNotice} onClose={hideStatusNotice} />
      {lightboxFile && (
        <FileLightbox
          fileId={lightboxFile.id}
          fileName={lightboxFile.name}
          onClose={() => setLightboxFile(null)}
        />
      )}

      {/* Issue reason modal */}
      {issueOrderId && (
        <IssueReasonModal
          onConfirm={handleConfirmIssue}
          onClose={() => setIssueOrderId(null)}
          t={t}
        />
      )}

      {/* «Нужен макет» modal (one line) */}
      {layoutIssueLine && (
        <LayoutIssueModal
          lineCode={formatOrderLineItemRef(
            layoutIssueLine.orderNumber,
            layoutIssueLine.lineIndex,
            layoutIssueLine.totalLines,
          )}
          isSubmitting={layoutIssueSaving}
          error={layoutIssueError}
          onConfirm={(reason, note) => void handleConfirmLayoutIssue(reason, note)}
          onClose={() => setLayoutIssueLine(null)}
        />
      )}
      {clearLayoutLine && (
        <ClearLayoutIssueDialog
          lineCode={formatOrderLineItemRef(clearLayoutLine.orderNumber, clearLayoutLine.lineIndex, clearLayoutLine.totalLines)}
          isSubmitting={savingLineKey === boardLineKey(clearLayoutLine.orderId, clearLayoutLine.orderLineId)}
          error={clearLayoutError}
          onConfirm={() => void handleConfirmClearLayout()}
          onClose={() => setClearLayoutLine(null)}
        />
      )}
      {replaceLayoutLine && (
        <StaffReplaceLayoutFileDialog
          target={{
            orderId: replaceLayoutLine.orderId,
            lineId: replaceLayoutLine.orderLineId,
            lineCode: formatOrderLineItemRef(
              replaceLayoutLine.orderNumber,
              replaceLayoutLine.lineIndex,
              replaceLayoutLine.totalLines,
            ),
            productType: replaceLayoutLine.productType,
            declared:
              replaceLayoutLine.facts.kind === "lf"
                ? { widthCm: replaceLayoutLine.facts.data.widthCm, heightCm: replaceLayoutLine.facts.data.heightCm }
                : null,
            currentFiles: replaceLayoutLine.files.map((f) => ({ id: f.id, fileName: f.fileName })),
          }}
          onDone={() => fetchBoard(true).catch(() => {})}
          onClose={() => setReplaceLayoutLine(null)}
        />
      )}

      {/* Sheet layout modal (sheet materials: pieces pooled on whole sheets) */}
      {layoutGroup && layoutGroup.meta.lfSheet && (
        <SheetLayoutPlannerModal
          group={layoutGroup}
          onStockChanged={() => {
            fetchBoard(true).catch(() => {});
          }}
          onClose={() => setLayoutGroup(null)}
        />
      )}

      {/* Roll layout planner modal (rolls only) */}
      {layoutGroup && !layoutGroup.meta.lfSheet && (
        <LayoutPlannerModal
          group={layoutGroup}
          rollCandidates={lfRollCandidates}
          onStockChanged={() => {
            fetchBoard(true).catch(() => {});
          }}
          onClose={() => setLayoutGroup(null)}
        />
      )}

      {/* Notebook auto-batcher modal */}
      {sendModalSection && (
        <SendNotebookSectionToWorkshopModal
          section={sendModalSection}
          onClose={(didWork) => {
            setSendModalSection(null);
            if (didWork) {
              fetchBoard(true).catch(() => {});
            }
          }}
        />
      )}

      {/* Mug A4 sheet auto-batcher modal */}
      {sendMugModalSection && (
        <SendMugSectionToWorkshopModal
          section={sendMugModalSection}
          onClose={(didWork) => {
            setSendMugModalSection(null);
            if (didWork) {
              fetchBoard(true).catch(() => {});
            }
          }}
        />
      )}

      {/* «Весь заказ» panel (comments and the file viewer open above it) */}
      {panelOrder && (
        <OrderOverviewDrawer
          orderId={panelOrder.orderId}
          focusLineId={panelOrder.orderLineId}
          linesOnBoard={panelLinesOnBoard}
          escSuspended={commentOrder !== null || lightboxFile !== null}
          onClose={closePanel}
          onShowOnBoard={showOrderOnBoard}
          onOpenComments={(id, orderNumber) => setCommentOrder({ id, orderNumber })}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/workshop-batches">
                <Layers className="h-4 w-4" />
                {t.workshopBatches.navLink}
              </Link>
            </Button>
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
        </div>

        <LineStatusTip />

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

        {sections.length > 0 && (
          <TypeOverviewGrid
            summaries={summaries}
            activeTypes={activeTypes}
            onSelect={selectType}
            onReset={() => setActiveTypes([])}
            t={t}
          />
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
            key={section.key}
            section={section}
            isWorkshop={isWorkshop}
            saving={saving}
            lfRollCandidates={lfRollCandidates}
            onStatusChange={handleStatusChange}
            onTogglePrio={handleTogglePrio}
            onComment={openComment}
            onAssembleLayout={setLayoutGroup}
            onSendNotebookSection={setSendModalSection}
            onSendMugSection={setSendMugModalSection}
          />
        ))}
      </main>
    </OpenFileContext.Provider>
    </BoardOrderPanelContext.Provider>
    </LineStatusContext.Provider>
  );
}
