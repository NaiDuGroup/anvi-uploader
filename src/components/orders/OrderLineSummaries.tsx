"use client";

/**
 * Per-position product digests shared by the staff orders list and the
 * customer cabinet list: stock item plates (mug / notebook / pen), large
 * format and sheet-product lines, paper-print file specs, the pieces badge.
 *
 * Every piece renders only what it is given; the cabinet passes customer-safe
 * data (no SKU, no sheets / imposition) built by `toCabinetOrderLineView`.
 */

import { psProduct } from "@/lib/storefront/printShop/config";
import { parseShopLang } from "@/lib/storefront/i18n";
import { memo } from "react";
import {
  AlignJustify,
  BookOpen,
  CalendarDays,
  CircleOff,
  Coffee,
  CreditCard,
  FileText,
  Grid3x3,
  Link2,
  Palette,
  Pencil,
  ScanLine,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { formatPaperTypeLabel } from "@/lib/paperTypeLabel";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { mugProductDisplayNameFromSnapshot } from "@/lib/mug/mugProductLabels";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { notebookProductDisplayNameFromSnapshot } from "@/lib/notebook/notebookProductLabels";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { coerceNotebookPaperKind } from "@/lib/notebook/notebookPaperKind";
import { parsePenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import { penProductDisplayNameFromSnapshot } from "@/lib/pen/penProductLabels";
import { penOrderStockQuantityFromFiles } from "@/lib/pen/penOrderStockQuantity";
import {
  lfLineSummaryPartsFromRaw,
  type LfLineSummaryParts,
} from "@/lib/largeFormat/lfLineSummaryLabel";
import {
  toSheetLinePublicSummary,
  type SheetLinePublicSummary,
} from "@/lib/businessCard/sheetLinePublicSummary";

function isExternalUrl(fileUrl: string): boolean {
  return fileUrl.startsWith("http://") || fileUrl.startsWith("https://");
}

type AdminNotebookBadgeSize = "xs" | "sm";

const ADMIN_NOTEBOOK_BADGE_STYLES = {
  ruled: {
    bg: "bg-sky-100",
    text: "text-sky-800",
    ring: "ring-sky-200",
    icon: AlignJustify,
  },
  squared: {
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    ring: "ring-indigo-200",
    icon: Grid3x3,
  },
  dated: {
    bg: "bg-rose-100",
    text: "text-rose-800",
    ring: "ring-rose-200",
    icon: CalendarDays,
  },
} as const;

const ADMIN_NOTEBOOK_BADGE_SIZE_STYLES: Record<
  AdminNotebookBadgeSize,
  { pill: string; pillIconOnly: string; icon: string; label: string }
> = {
  xs: {
    pill: "h-5 gap-1 px-1.5 text-[10px]",
    pillIconOnly: "h-5 w-5",
    icon: "h-3 w-3",
    label: "leading-none",
  },
  sm: {
    pill: "h-6 gap-1 px-2 text-[11px]",
    pillIconOnly: "h-6 w-6",
    icon: "h-3.5 w-3.5",
    label: "leading-none",
  },
};

export function AdminNotebookPaperKindBadge({
  kind,
  t,
  size = "sm",
  iconOnly = false,
  className,
}: {
  kind: unknown;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  size?: AdminNotebookBadgeSize;
  iconOnly?: boolean;
  className?: string;
}) {
  const safeKind = coerceNotebookPaperKind(kind);
  const styles = ADMIN_NOTEBOOK_BADGE_STYLES[safeKind];
  const sizeStyles = ADMIN_NOTEBOOK_BADGE_SIZE_STYLES[size];
  const Icon = styles.icon;
  const label =
    safeKind === "squared"
      ? t.admin.notebookPaperKindSquared
      : safeKind === "dated"
        ? t.admin.notebookPaperKindDated
        : t.admin.notebookPaperKindRuled;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        styles.bg,
        styles.text,
        styles.ring,
        iconOnly ? sizeStyles.pillIconOnly : sizeStyles.pill,
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={cn(sizeStyles.icon, "shrink-0")} aria-hidden />
      {iconOnly ? null : <span className={sizeStyles.label}>{label}</span>}
    </span>
  );
}

export const AdminNotebookProductSnapshotRow = memo(function AdminNotebookProductSnapshotRow({
  snapshotRaw,
  hideSku = false,
  className,
}: {
  snapshotRaw: unknown;
  /** Customer views: the catalog code means nothing to the client. */
  hideSku?: boolean;
  className?: string;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = useLanguageStore((s) => s.t);
  const snap = parseNotebookProductSnapshot(snapshotRaw);
  if (!snap) return null;

  const name = notebookProductDisplayNameFromSnapshot(snap, locale);
  const imgUrl = publicAssetUrlFromStorageKey(snap.imageUrl);
  const showSku = !hideSku && Boolean(snap.sku && snap.sku !== "OTHER");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1.5",
        className,
      )}
    >
      <div className="relative shrink-0">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 / public URL from snapshot
          <img
            src={imgUrl}
            alt=""
            className="h-11 w-11 rounded-md border border-emerald-100/80 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-emerald-200 bg-white">
            <BookOpen className="h-5 w-5 text-emerald-600/80" aria-hidden />
          </div>
        )}
        <AdminNotebookPaperKindBadge
          kind={snap.paperKind}
          t={t}
          size="xs"
          iconOnly
          className="pointer-events-none absolute -bottom-1 -right-1 shadow-sm ring-2 ring-white"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 line-clamp-2">
            {name}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <AdminNotebookPaperKindBadge kind={snap.paperKind} t={t} size="xs" />
          {showSku ? (
            <span
              className="truncate font-mono text-[10px] text-gray-500"
              title={snap.sku}
            >
              {snap.sku}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export const AdminMugProductSnapshotRow = memo(function AdminMugProductSnapshotRow({
  snapshotRaw,
  hideSku = false,
  className,
}: {
  snapshotRaw: unknown;
  /** Customer views: the catalog code means nothing to the client. */
  hideSku?: boolean;
  className?: string;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const snap = parseMugProductSnapshot(snapshotRaw);
  if (!snap) return null;

  const name = mugProductDisplayNameFromSnapshot(snap, locale);
  const imgUrl = publicAssetUrlFromStorageKey(snap.imageUrl);
  const showSku = !hideSku && Boolean(snap.sku && snap.sku !== "OTHER");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5",
        className,
      )}
    >
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 / public URL from snapshot
        <img
          src={imgUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-md border border-amber-100/80 object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-200 bg-white">
          <Coffee className="h-5 w-5 text-amber-600/80" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-gray-900 line-clamp-2">{name}</p>
        {showSku ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-gray-500" title={snap.sku}>
            {snap.sku}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export const AdminPenProductSnapshotRow = memo(function AdminPenProductSnapshotRow({
  snapshotRaw,
  hideSku = false,
  className,
}: {
  snapshotRaw: unknown;
  /** Customer views: the catalog code means nothing to the client. */
  hideSku?: boolean;
  className?: string;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const snap = parsePenProductSnapshot(snapshotRaw);
  if (!snap) return null;

  const name = penProductDisplayNameFromSnapshot(snap, locale);
  const imgUrl = publicAssetUrlFromStorageKey(snap.imageUrl);
  const showSku = !hideSku && Boolean(snap.sku && snap.sku !== "OTHER" && snap.sku !== "—");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-pink-100 bg-pink-50/60 px-2 py-1.5",
        className,
      )}
    >
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 / public URL from snapshot
        <img
          src={imgUrl}
          alt=""
          // `contain`: a pen is long and thin, so a square crop leaves a sliver.
          className="h-11 w-11 shrink-0 rounded-md border border-pink-100/80 bg-white object-contain p-0.5"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-pink-200 bg-white">
          <Pencil className="h-5 w-5 text-pink-500/80" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-gray-900 line-clamp-2">{name}</p>
        {showSku ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-gray-500" title={snap.sku}>
            {snap.sku}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export const AdminLfLineSummaryRow = memo(function AdminLfLineSummaryRow({
  lineDataRaw,
  fileCount,
  className,
}: {
  lineDataRaw: unknown;
  /** Number of files on this line — used to show "N дизайнов" badge when > 1. */
  fileCount?: number;
  className?: string;
}) {
  const parts = lfLineSummaryPartsFromRaw(lineDataRaw);
  if (!parts) return null;
  return <LfLineSummaryView parts={parts} fileCount={fileCount} className={className} />;
});

/** Large-format line digest: material · print size (· copies) · N designs. */
export const LfLineSummaryView = memo(function LfLineSummaryView({
  parts,
  fileCount,
  showQuantity = false,
  className,
}: {
  parts: LfLineSummaryParts;
  fileCount?: number;
  /** The staff list shows copies on each file instead. */
  showQuantity?: boolean;
  className?: string;
}) {
  const t = useLanguageStore((s) => s.t);
  const multiDesign = typeof fileCount === "number" && fileCount > 1;

  return (
    <div
      className={cn(
        "mb-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50/60 px-2 py-1.5 text-[11px] text-gray-600",
        className,
      )}
    >
      <ScanLine className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
      <span
        className="min-w-0 truncate font-medium text-gray-800"
        title={parts.materialName}
      >
        {parts.materialName}
      </span>
      <span className="text-gray-300" aria-hidden>·</span>
      <span className="shrink-0 tabular-nums">
        {t.admin.lfOrderLineSizeLabel(parts.widthCm, parts.heightCm)}
      </span>
      {showQuantity && parts.quantity > 1 && (
        <>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none text-sky-900">
            ×{parts.quantity}
          </span>
        </>
      )}
      {multiDesign && (
        <>
          <span className="text-gray-300" aria-hidden>·</span>
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800 leading-none"
            title={t.admin.lfOrderLineDesignsCount(fileCount)}
          >
            {t.admin.lfOrderLineDesignsCount(fileCount)}
          </span>
        </>
      )}
    </div>
  );
});

/** Business-card / flyer line digest: paper, size, sides, run and sheets used. */
export const AdminBusinessCardLineSummaryRow = memo(function AdminBusinessCardLineSummaryRow({
  lineDataRaw,
  className,
}: {
  lineDataRaw: unknown;
  className?: string;
}) {
  const data = toSheetLinePublicSummary(lineDataRaw, { production: true });
  if (!data) return null;
  return <SheetLineSummaryView data={data} className={className} />;
});

/**
 * Sheet product digest. Sheets used / pieces per sheet render only when the
 * summary carries them (staff view).
 */
export const SheetLineSummaryView = memo(function SheetLineSummaryView({
  data,
  className,
}: {
  data: SheetLinePublicSummary;
  className?: string;
}) {
  const t = useLanguageStore((s) => s.t);
  const locale = useLanguageStore((s) => s.locale);

  return (
    <div
      className={cn(
        "mb-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-teal-100 bg-teal-50/60 px-2 py-1.5 text-[11px] text-gray-600",
        className,
      )}
    >
      <CreditCard className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
      <span className="min-w-0 truncate font-medium text-gray-800" title={data.paperName}>
        {data.paperName}
      </span>
      <span className="text-gray-300" aria-hidden>·</span>
      <span className="shrink-0 tabular-nums">
        {t.admin.bcOrderLineCardSizeLabel(data.widthCm, data.heightCm)}
      </span>
      <span className="text-gray-300" aria-hidden>·</span>
      <span className="shrink-0">
        {data.sides === "two"
          ? t.admin.bcOrderLineSidesTwo
          : t.admin.bcOrderLineSidesOne}
      </span>
      <span className="text-gray-300" aria-hidden>·</span>
      <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-teal-800">
        {t.admin.bcOrderLineRunLabel(data.quantity)}
      </span>
      {data.sheetsUsed != null && (
        <span className="shrink-0 text-gray-500">
          {t.admin.bcOrderLineSheetsLabel(data.sheetsUsed)}
        </span>
      )}
      {data.cardsPerSheet != null && (
        <span className="shrink-0 text-gray-500">
          {t.admin.bcOrderLinePerSheetLabel(data.cardsPerSheet)}
        </span>
      )}
      {data.shopProduct != null && (
        <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-violet-800">
          {psProduct(data.shopProduct)?.name[parseShopLang(locale)] ?? data.shopProduct}
        </span>
      )}
      {data.lamination != null && (
        <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-sky-800">
          {data.lamination === "matte" ? t.admin.bcOrderLineLaminationMatte : t.admin.bcOrderLineLaminationGloss}
        </span>
      )}
      {data.roundedCorners && (
        <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-sky-800">
          {t.admin.bcOrderLineRoundedCorners}
        </span>
      )}
      {data.artworkFit != null && (
        <span
          className={cn(
            "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
            data.artworkFit === "contain"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-teal-200 bg-teal-50 text-teal-800",
          )}
        >
          {data.artworkFit === "contain" ? t.admin.bcOrderLineFitContain : t.admin.bcOrderLineFitCover}
        </span>
      )}
    </div>
  );
});

export function skuLinePiecesQty(line: {
  productType: string;
  files: readonly { copies: number }[];
}): number {
  if (line.files.length === 0) return 0;
  if (line.productType === "mug") {
    return mugOrderStockQuantityFromFiles(line.files);
  }
  if (line.productType === "notebook") {
    return notebookOrderStockQuantityFromFiles(line.files);
  }
  if (line.productType === "pen") {
    return penOrderStockQuantityFromFiles(line.files);
  }
  return 0;
}

/** Product types whose line shows a catalog SKU plate + a pieces badge. */
export function isCatalogSkuLine(productType: string): boolean {
  return (
    productType === "mug" || productType === "notebook" || productType === "pen"
  );
}

export function AdminSkuPiecesQtyBadge({
  qty,
  t,
  dense,
}: {
  qty: number;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  dense?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-semibold tabular-nums text-violet-950 leading-none shadow-sm",
        dense ? "text-[10px]" : "text-[11px]",
      )}
      title={t.admin.orderPiecesQtyLabel(qty)}
      aria-label={t.admin.orderPiecesQtyLabel(qty)}
    >
      {t.admin.orderSkuPiecesBadge(qty)}
    </span>
  );
}

export interface SpecFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

export function OrderFileSpecs({
  files,
  t,
  isMug,
  compact = false,
}: {
  files: SpecFile[];
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isMug?: boolean;
  /**
   * One line per distinct colour / format / copies, without file names
   * (the customer list shows the files in their own column).
   */
  compact?: boolean;
}) {
  if (files.length === 0) return null;

  if (isMug) {
    return null;
  }

  const allSame =
    files.length > 1 &&
    files.every(
      (f) =>
        f.color === files[0].color &&
        f.paperType === files[0].paperType &&
        f.copies === files[0].copies,
    );

  const specBadge = (color: string, paper: string | null, copies: number) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
      {color === "color" ? (
        <span className="inline-flex items-center gap-0.5">
          <Palette className="w-3 h-3 text-violet-500" />
          {t.admin.color}
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5">
          <CircleOff className="w-3 h-3 text-gray-400" />
          {t.admin.bw}
        </span>
      )}
      <span className="text-gray-300">·</span>
      {formatPaperTypeLabel(paper, t.upload)}
      {copies > 1 && (
        <>
          <span className="text-gray-300">·</span>
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-800 leading-none shadow-sm"
            title={t.admin.paperFileCopiesLabel(copies)}
            aria-label={t.admin.paperFileCopiesLabel(copies)}
          >
            ×{copies}
          </span>
        </>
      )}
    </span>
  );

  if (compact) {
    const seen = new Set<string>();
    const combos = files.filter((f) => {
      const key = `${f.color}|${f.paperType ?? ""}|${f.copies}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return (
      <div className="mb-1 space-y-0.5 rounded bg-gray-50 px-2 py-1">
        {combos.map((f) => (
          <div key={f.id}>{specBadge(f.color, f.paperType, f.copies)}</div>
        ))}
      </div>
    );
  }

  if (allSame) {
    const f = files[0];
    return (
      <div className="bg-gray-50 rounded px-2 py-1 text-[11px] text-gray-500 mb-1">
        <span className="font-medium text-gray-600">{t.admin.allSameSettings}:</span>{" "}
        {specBadge(f.color, f.paperType, f.copies)}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 mb-1">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          {isExternalUrl(f.fileUrl) ? (
            <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
          ) : (
            <FileText className="w-3 h-3 text-gray-300 flex-shrink-0" />
          )}
          <span className="text-[11px] text-gray-500 truncate max-w-[100px]" title={f.fileName}>
            {f.fileName}
          </span>
          {specBadge(f.color, f.paperType, f.copies)}
        </div>
      ))}
    </div>
  );
}