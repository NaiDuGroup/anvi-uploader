"use client";

import { createContext, useContext } from "react";
import { Clock, FilePen } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { canFlagLayoutIssue, isLayoutRecentlyFixed, isLineNeedsLayout } from "@/lib/layoutIssue";
import { formatLayoutFixedTime, layoutIssueReasonLabel, layoutIssueWaitLabel } from "@/lib/layoutIssueClient";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import type { StaffReplaceTarget } from "./StaffReplaceLayoutFileDialog";
import { isOwnerReplaceMarkerVisible } from "@/lib/ownerLineFileReplace";
import { OwnerReplacedBadge } from "./OwnerReplacedBadge";
import { LINE_MENU_ICONS, LineMoreMenu } from "./LineMoreMenu";

/**
 * Studio orders list: «Ждёт файл» (NEEDS_LAYOUT) on one order line (step 3). The
 * amber line card (reason, comment, waiting time, how to replace the file), the
 * «⋯» menu with «Проблема с файлом…» / «Снять отметку» and the order-row label. Actions come from
 * {@link AdminLayoutIssueContext} so the memoised list cells need no new props.
 */

export interface AdminLayoutIssueLineRef {
  orderId: string;
  lineId: string;
  lineCode: string;
}

export interface AdminLayoutIssueContextValue {
  /** Line id being saved (flag / clear), or null. */
  savingLineId: string | null;
  flag: (ref: AdminLayoutIssueLineRef) => void;
  /** «Снять отметку»: opens the in-page confirm (`ClearLayoutIssueDialog`). */
  clear: (ref: AdminLayoutIssueLineRef) => void;
  /** «Заменить файл»: opens the staff replace dialog for this line only. */
  replaceFile: (target: StaffReplaceTarget) => void;
}

export const AdminLayoutIssueContext = createContext<AdminLayoutIssueContextValue | null>(null);

interface LayoutIssueLineFields {
  id: string;
  productionStatus?: string;
  layoutIssueReason?: string | null;
  layoutIssueNote?: string | null;
  layoutIssueAt?: string | null;
  layoutFixedAt?: string | null;
  ownerReplacedAt?: string | null;
  ownerReplacedRole?: string | null;
  productType?: string;
  largeFormatLineData?: unknown;
  files?: readonly { id: string; fileName: string }[];
}

/** The staff replace dialog's input for one flagged line of the list. */
export function staffReplaceTargetOf(orderId: string, line: LayoutIssueLineFields, lineCode: string): StaffReplaceTarget {
  const lf = line.productType === "large_format_print" ? parseLargeFormatLineData(line.largeFormatLineData) : null;
  return {
    orderId,
    lineId: line.id,
    lineCode,
    productType: line.productType ?? "",
    declared: lf ? { widthCm: lf.printWidthCm, heightCm: lf.printHeightCm } : null,
    currentFiles: (line.files ?? []).map((f) => ({ id: f.id, fileName: f.fileName })),
  };
}

/** Flagged lines in the order (0 when none). */
export function orderLayoutIssueCount(order: { orderLines?: readonly { productionStatus?: string }[] }): number {
  return (order.orderLines ?? []).filter((l) => isLineNeedsLayout(l.productionStatus)).length;
}

/** Calm amber frame classes for a flagged line in the list. */
export function layoutIssueFrameClass(line: { productionStatus?: string }): string | undefined {
  return isLineNeedsLayout(line.productionStatus)
    ? "border-amber-200 border-l-amber-400 bg-amber-50/60"
    : undefined;
}

/** «Ждут файл: 2 поз.» under the order status (desktop row and mobile card). */
export function OrderLayoutIssueLabel({
  order,
}: {
  order: { id: string; orderLines?: readonly { productionStatus?: string }[] };
}) {
  const { t } = useLanguageStore();
  const count = orderLayoutIssueCount(order);
  if (count === 0) return null;
  return (
    <p
      data-testid={`admin-order-layout-issue-${order.id}`}
      className="inline-flex w-fit max-w-full items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-amber-900"
    >
      <Clock className="h-3 w-3 shrink-0 text-amber-700" aria-hidden />
      {t.layoutIssue.adminRowLabel(count)}
    </p>
  );
}

/**
 * Inside one line frame of the list: the amber «Ждёт файл» card with
 * «Заменить файл» + «⋯» → «Снять отметку», the green «✓ Новый файл получен»,
 * or «⋯» → «Проблема с файлом…» for a line the workshop may still flag.
 */
export function AdminLineLayoutIssue({
  orderId,
  orderStatus,
  line,
  lineCode,
}: {
  orderId: string;
  orderStatus: string;
  line: LayoutIssueLineFields;
  lineCode: string;
}) {
  const { t } = useLanguageStore();
  const ctx = useContext(AdminLayoutIssueContext);
  const li = t.layoutIssue;
  if (line.id === "legacy") return null;
  const ref: AdminLayoutIssueLineRef = { orderId, lineId: line.id, lineCode };
  const busy = ctx?.savingLineId === line.id;
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold normal-case tracking-normal transition-colors disabled:cursor-wait disabled:opacity-60";

  if (isLineNeedsLayout(line.productionStatus)) {
    return (
      <div
        data-testid={`admin-line-layout-issue-${line.id}`}
        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
      >
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          <span className="font-bold">{li.waitingLabel}</span>
          <span className="text-amber-300" aria-hidden>·</span>
          <span className="font-medium">{layoutIssueReasonLabel(li, line.layoutIssueReason)}</span>
          {line.layoutIssueAt ? (
            <>
              <span className="text-amber-300" aria-hidden>·</span>
              <span className="tabular-nums text-amber-700">{layoutIssueWaitLabel(li, line.layoutIssueAt)}</span>
            </>
          ) : null}
        </p>
        {line.layoutIssueNote ? (
          <p className="mt-0.5 break-words italic text-amber-800">«{line.layoutIssueNote}»</p>
        ) : null}
        <p className="mt-1 text-[11px] leading-snug text-amber-800">{li.staffReplaceHint}</p>
        {ctx ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid={`admin-line-replace-file-${line.id}`}
              onClick={() => ctx.replaceFile(staffReplaceTargetOf(orderId, line, lineCode))}
              className={`${btn} border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50`}
            >
              <FilePen className="h-3.5 w-3.5" aria-hidden />
              {li.staffReplaceButton}
            </button>
            <LineMoreMenu
              label={li.moreActions}
              testId={`admin-line-more-${line.id}`}
              disabled={busy}
              items={[
                {
                  key: "clearLayout",
                  label: li.clear,
                  icon: LINE_MENU_ICONS.clearLayout,
                  testId: `admin-line-clear-layout-${line.id}`,
                  onSelect: () => ctx.clear(ref),
                },
              ]}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const fixed = line.layoutFixedAt && isLayoutRecentlyFixed({ lineStatus: line.productionStatus, layoutFixedAt: line.layoutFixedAt });
  const flaggable = ctx !== null && canFlagLayoutIssue(orderStatus, line.productionStatus ?? "");
  const replaced = isOwnerReplaceMarkerVisible(line);
  if (!fixed && !flaggable && !replaced) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {replaced && line.ownerReplacedAt ? (
        <OwnerReplacedBadge
          at={line.ownerReplacedAt}
          role={line.ownerReplacedRole}
          li={li}
          testId={`admin-line-owner-replaced-${line.id}`}
        />
      ) : null}
      {fixed && line.layoutFixedAt ? (
        <span
          data-testid={`admin-line-layout-fixed-${line.id}`}
          className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
        >
          {li.fixedAt(formatLayoutFixedTime(line.layoutFixedAt))}
        </span>
      ) : null}
      {flaggable && ctx ? (
        <LineMoreMenu
          label={li.moreActions}
          testId={`admin-line-more-${line.id}`}
          disabled={busy}
          size="sm"
          className="ml-auto"
          items={[
            {
              key: "flagLayout",
              label: li.flagButton,
              title: li.flagButtonHint(lineCode),
              icon: LINE_MENU_ICONS.flagLayout,
              testId: `admin-line-flag-layout-${line.id}`,
              onSelect: () => ctx.flag(ref),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
