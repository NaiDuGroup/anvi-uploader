"use client";

/**
 * Customer-side pieces shared by the cabinet orders list and the order detail
 * page: what a position is (item, colour, sizes, zones, material…) and one
 * artwork file row. They mirror the staff orders list, fed only with the
 * whitelisted `toCabinetOrderLineView` data and cabinet-scoped file endpoints.
 */

import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { MIXED_PRODUCT_ICON, PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import type { TranslationDictionary } from "@/lib/i18n";
import type { CabinetOrderLineView } from "@/lib/cabinetOrderLineView";
import { cn } from "@/lib/utils";
import { FileThumb } from "@/components/FileThumb";
import { FileMetaLine } from "@/components/FileMetaLine";
import { OrderFileLifecycleBadge } from "@/components/OrderFileLifecycleBadge";
import { CABINET_FILE_META_ENDPOINT } from "@/lib/files/useFileMeta";
import { cabinetFileKind } from "@/app/cabinet/_components/CabinetFilePreviewModal";
import { DtfLineSummaryView } from "@/app/admin/_components/dtf/DtfLineSummary";
import { UvLineSummaryView } from "@/app/admin/_components/uv/UvLineSummary";
import { SublimationLineSummaryView } from "@/app/admin/_components/sublimation/SublimationLineSummary";
import {
  AdminMugProductSnapshotRow,
  AdminNotebookProductSnapshotRow,
  AdminPenProductSnapshotRow,
  LfLineSummaryView,
  OrderFileSpecs,
  SheetLineSummaryView,
} from "@/components/orders/OrderLineSummaries";

export type CabinetOrderFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  paperType: string | null;
  pageCount: number | null;
  copies: number;
  color: string;
  orderLineId: string | null;
};

export type CabinetPreviewFile = { id: string; fileName: string };

export function isExternalUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

export const CABINET_PRODUCT_ICONS: Record<string, LucideIcon> = {
  ...PRODUCT_TYPE_ICONS,
  mixed: MIXED_PRODUCT_ICON,
};

/** Icon key of one position (`CABINET_PRODUCT_ICONS`): UV-DTF sticker lines get their own icon. */
export function cabinetLineIconKey(line: Pick<CabinetOrderLineView, "productType" | "uvSummary">): string {
  if (line.productType === "uv_print" && line.uvSummary?.source === "stickers") return "uv_dtf";
  return line.productType;
}

export function cabinetProductLabel(kind: string, t: TranslationDictionary): string {
  const byKind: Record<string, string> = {
    mug: t.cabinet.orderProductMug,
    notebook: t.cabinet.orderProductNotebook,
    pen: t.cabinet.orderProductPen,
    large_format_print: t.cabinet.orderProductLargeFormat,
    dtf_apparel: t.dtf.productType,
    uv_print: t.uv.productType,
    sublimation_print: t.sublimation.productType,
    business_card: t.cabinet.orderProductBusinessCard,
    flyer: t.cabinet.orderProductFlyer,
    sticker_sheet: t.admin.productTypeStickerSheet,
    postcard: t.admin.productTypePostcard,
    mixed: t.cabinet.orderProductMixed,
  };
  return byKind[kind] ?? t.cabinet.orderProductPaper;
}

/** Label of one position: UV-DTF sticker lines read «UV-DTF наклейки», not «UV-печать». */
export function cabinetLineLabel(
  line: Pick<CabinetOrderLineView, "productType" | "uvSummary">,
  t: TranslationDictionary,
): string {
  if (line.productType === "uv_print" && line.uvSummary?.source === "stickers") {
    return t.uv.workshop.stickers;
  }
  return cabinetProductLabel(line.productType, t);
}

export type CabinetProductLine<F extends CabinetOrderFile = CabinetOrderFile> = {
  line: CabinetOrderLineView;
  files: F[];
};

/** Positions with their files; legacy orders without positions get one synthetic line. */
export function cabinetProductLinesOf<F extends CabinetOrderFile>(order: {
  productType: string;
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  penProductSnapshot?: unknown;
  files?: F[];
  orderLines?: CabinetOrderLineView[];
}): CabinetProductLine<F>[] {
  const files = order.files ?? [];
  const lines = order.orderLines ?? [];
  if (lines.length === 0) {
    return [
      {
        line: {
          id: "legacy",
          productType: order.productType,
          mugProductSnapshot: (order.mugProductSnapshot as Record<string, unknown> | null) ?? null,
          notebookProductSnapshot:
            (order.notebookProductSnapshot as Record<string, unknown> | null) ?? null,
          penProductSnapshot: (order.penProductSnapshot as Record<string, unknown> | null) ?? null,
          dtfSummary: null,
          uvSummary: null,
          sublimationSummary: null,
          largeFormatSummary: null,
          sheetSummary: null,
        },
        files,
      },
    ];
  }
  const grouped = lines.map((line) => ({
    line,
    files: files.filter((f) => f.orderLineId === line.id),
  }));
  // Files not tied to any position (old data) stay visible under the first one.
  const known = new Set(lines.map((l) => l.id));
  const orphans = files.filter((f) => !f.orderLineId || !known.has(f.orderLineId));
  if (orphans.length > 0) grouped[0] = { ...grouped[0], files: [...grouped[0].files, ...orphans] };
  return grouped;
}

/** Item, colour, sizes, print zones, material… of one position (no studio internals). */
export function CabinetLineDigest({
  line,
  files,
  t,
}: CabinetProductLine & { t: TranslationDictionary }) {
  switch (line.productType) {
    case "mug":
      return <AdminMugProductSnapshotRow snapshotRaw={line.mugProductSnapshot} hideSku />;
    case "notebook":
      return <AdminNotebookProductSnapshotRow snapshotRaw={line.notebookProductSnapshot} hideSku />;
    case "pen":
      return <AdminPenProductSnapshotRow snapshotRaw={line.penProductSnapshot} hideSku />;
    case "dtf_apparel":
      return line.dtfSummary ? <DtfLineSummaryView data={line.dtfSummary} t={t} /> : null;
    case "uv_print":
      return line.uvSummary ? <UvLineSummaryView data={line.uvSummary} t={t} /> : null;
    case "sublimation_print":
      return line.sublimationSummary ? (
        <SublimationLineSummaryView data={line.sublimationSummary} t={t} />
      ) : null;
    case "large_format_print":
      return line.largeFormatSummary ? (
        <LfLineSummaryView
          parts={line.largeFormatSummary}
          fileCount={files.length}
          showQuantity
          className="mb-0"
        />
      ) : null;
    case "business_card":
    case "flyer":
    case "sticker_sheet":
    case "postcard":
      return line.sheetSummary ? <SheetLineSummaryView data={line.sheetSummary} productType={line.productType} className="mb-0" /> : null;
    default:
      // Paper print: colour / B&W · format · copies, once per distinct setting.
      return files.length > 0 ? <OrderFileSpecs files={files} t={t} compact /> : null;
  }
}

/**
 * One artwork file: thumbnail, name, copies / pages, storage expiry, the
 * print size line (size · dpi · px · weight) and preview / download.
 * `size="md"` (order detail) shows a real image thumbnail.
 */
export function CabinetOrderFileRow({
  file: f,
  t,
  onPreview,
  size = "sm",
}: {
  file: CabinetOrderFile;
  t: TranslationDictionary;
  onPreview: (f: CabinetPreviewFile) => void;
  size?: "sm" | "md";
}) {
  const isLink = isExternalUrl(f.fileUrl);
  const open = () => onPreview({ id: f.id, fileName: f.fileName });
  const md = size === "md";
  const isImage = cabinetFileKind(f.fileName) === "image";
  return (
    <div className={cn("flex items-center", md ? "gap-2.5" : "gap-1.5")}>
      {isLink ? (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded border border-blue-100 bg-blue-50",
            md ? "h-12 w-12" : "h-8 w-8",
          )}
        >
          <Link2 className="h-3.5 w-3.5 text-blue-500" />
        </div>
      ) : md && isImage ? (
        <ImagePreviewThumb file={f} t={t} onOpen={open} />
      ) : md ? (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center">
          <FileThumb fileId={f.id} fileName={f.fileName} onClick={open} />
        </span>
      ) : (
        <FileThumb fileId={f.id} fileName={f.fileName} onClick={open} />
      )}
      <div className="min-w-0 flex-1">
        {isLink ? (
          <a
            href={f.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block max-w-full truncate text-left text-blue-600 hover:underline",
              md && "text-sm",
            )}
            title={f.fileUrl}
          >
            {f.fileName}
          </a>
        ) : (
          <>
            <button
              type="button"
              onClick={open}
              className={cn(
                "block max-w-full truncate text-left text-blue-600 hover:underline",
                md && "text-sm",
              )}
              title={f.fileName}
            >
              {f.fileName}
            </button>
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 leading-tight",
                md ? "text-[11px]" : "text-[10px]",
              )}
            >
              {f.copies > 1 ? (
                <span className="text-gray-400">{t.cabinet.orderFileCopies(f.copies)}</span>
              ) : null}
              {f.pageCount && f.pageCount > 1 ? (
                <span className="text-gray-400">{t.cabinet.orderFilePages(f.pageCount)}</span>
              ) : null}
              <OrderFileLifecycleBadge fileUrl={f.fileUrl} />
            </div>
            <FileMetaLine
              fileId={f.id}
              hideMissing
              endpoint={CABINET_FILE_META_ENDPOINT}
              className={cn(
                "block truncate whitespace-nowrap leading-tight",
                md ? "text-[11px]" : "text-[10px]",
              )}
            />
          </>
        )}
      </div>
      {isLink ? (
        <a
          href={f.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
          title={t.upload.externalLink}
          aria-label={t.upload.externalLink}
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      ) : (
        <a
          href={`/api/cabinet/files/${f.id}/download`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
          title={t.cabinet.orderFileDownload}
          aria-label={t.cabinet.orderFileDownload}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      )}
    </div>
  );
}

/** Real image thumbnail; falls back to the extension chip when the file is gone. */
function ImagePreviewThumb({
  file,
  t,
  onOpen,
}: {
  file: CabinetOrderFile;
  t: TranslationDictionary;
  onOpen: () => void;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
        <FileThumb fileId={file.id} fileName={file.fileName} onClick={onOpen} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50 transition-all hover:ring-2 hover:ring-blue-300"
      aria-label={t.cabinet.orderFilePreview}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- cabinet-scoped preview endpoint */}
      <img
        src={`/api/cabinet/files/${file.id}/preview`}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover"
      />
    </button>
  );
}

/** Files of a position without a thumbnail-worthy name still read as a file. */
export function CabinetNoFilesNote({ t }: { t: TranslationDictionary }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-gray-400">
      <FileText className="h-3.5 w-3.5" aria-hidden />
      {t.cabinet.orderDetailNoFiles}
    </p>
  );
}
