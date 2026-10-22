"use client";

import type { MouseEvent, ReactNode } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_DOT_COLORS } from "@/app/admin/_lib/orderStatus";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { OrderStatus, ProductType } from "@/lib/validations";
import { ORDER_STATUSES } from "@/lib/validations";
import {
  BOARD_STATUS_ORDER,
  summarizeBoard,
  type SectionSummary,
  type SectionVolume,
} from "@/lib/workshopBoard/sectionSummary";
import { PRODUCT_TYPE_UI } from "./productTypeUi";

/** Pipeline statuses first, anything unexpected (e.g. an issue) after them. */
const STATUS_DISPLAY_ORDER: readonly OrderStatus[] = [
  ...BOARD_STATUS_ORDER,
  ...ORDER_STATUSES.filter((s) => !BOARD_STATUS_ORDER.includes(s)),
];

export interface TypeOverviewGridProps {
  summaries: readonly SectionSummary[];
  /** Selected types; empty means every type is shown. */
  activeTypes: ReadonlySet<ProductType>;
  /** `additive` is true for Ctrl/⌘ + click, which toggles one type in a multi-selection. */
  onSelect: (productType: ProductType, additive: boolean) => void;
  onReset: () => void;
  t: TranslationDictionary;
}

export function TypeOverviewGrid({ summaries, activeTypes, onSelect, onReset, t }: TypeOverviewGridProps) {
  const totals = summarizeBoard(summaries);
  const filtering = activeTypes.size > 0;

  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
        <OverviewTile
          active={!filtering}
          dimmed={false}
          activeRingClass="ring-gray-900 border-gray-900"
          icon={<Layers className="h-4 w-4" aria-hidden />}
          iconClass="bg-gray-900 text-white"
          label={t.workshopBoard.overviewAll}
          lineCount={totals.lineCount}
          byStatus={totals.byStatus}
          footer={null}
          onClick={onReset}
          t={t}
        />
        {summaries.map((summary) => {
          const ui = PRODUCT_TYPE_UI[summary.productType];
          const Icon = ui.icon;
          const active = activeTypes.has(summary.productType);
          return (
            <OverviewTile
              key={summary.productType}
              active={active}
              dimmed={filtering && !active}
              activeRingClass={ui.activeRingClass}
              icon={<Icon className="h-4 w-4" aria-hidden />}
              iconClass={ui.accentTextClass}
              label={ui.label(t)}
              lineCount={summary.lineCount}
              byStatus={summary.byStatus}
              footer={formatVolume(summary.volume, t)}
              onClick={(e) => onSelect(summary.productType, e.ctrlKey || e.metaKey)}
              t={t}
            />
          );
        })}
      </div>
      {summaries.length > 1 && (
        <p className="mt-1.5 text-[11px] text-gray-400">{t.workshopBoard.overviewMultiSelectHint}</p>
      )}
    </div>
  );
}

function OverviewTile({
  active,
  dimmed,
  activeRingClass,
  icon,
  iconClass,
  label,
  lineCount,
  byStatus,
  footer,
  onClick,
  t,
}: {
  active: boolean;
  dimmed: boolean;
  activeRingClass: string;
  icon: ReactNode;
  iconClass: string;
  label: string;
  lineCount: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  footer: string | null;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  t: TranslationDictionary;
}) {
  const segments = STATUS_DISPLAY_ORDER.flatMap((status) => {
    const count = byStatus[status] ?? 0;
    return count > 0 ? [{ status, count }] : [];
  });

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition",
        "hover:border-gray-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
        active ? cn("ring-2", activeRingClass) : "border-gray-200",
        dimmed && "opacity-55 hover:opacity-100",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconClass)}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800" title={label}>
          {label}
        </span>
        <span className="text-lg font-bold tabular-nums leading-none text-gray-900">{lineCount}</span>
      </div>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        {segments.map(({ status, count }) => (
          <span
            key={status}
            className={cn("h-full", STATUS_DOT_COLORS[status] ?? "bg-gray-400")}
            style={{ width: `${(count / Math.max(1, lineCount)) * 100}%` }}
            title={`${t.statuses[status]}: ${count}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
        {segments.map(({ status, count }) => (
          <span key={status} className="inline-flex items-center gap-1" title={t.statuses[status]}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_COLORS[status] ?? "bg-gray-400")} />
            <span className="tabular-nums">{count}</span>
          </span>
        ))}
        {footer && <span className="ml-auto font-medium text-gray-600">{footer}</span>}
      </div>
    </button>
  );
}

function formatVolume(volume: SectionVolume, t: TranslationDictionary): string {
  switch (volume.unit) {
    case "linear_meters":
      return t.workshopBoard.groupTotalLm(volume.value);
    case "sheets":
      return t.workshopBoard.volumeSheets(volume.value);
    case "pieces":
      return t.workshopBoard.groupTotalQty(volume.value);
  }
}
