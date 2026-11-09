import type { PaperType } from "@/app/admin/_lib/constants";
import { PAPER_OPTIONS } from "@/app/admin/_lib/constants";
import type { SlotPaperPrint } from "@/app/admin/_components/AdminPaperRowFields";
import { businessCardFaces } from "@/lib/businessCard/businessCardConstants";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { uvZoneIdFromPaperType } from "@/lib/uv/uvConstants";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";

/**
 * Zones whose files ride on one wizard row when a stored line comes back
 * (edit, «Повторить заказ»): the DTF / UV line's own zones. Empty for every
 * other line — and for a «Набор» line: a ready gift set keeps one row per
 * print place (its files are the set's zones, each its own row).
 */
export function wizardLineZoneIds(line: {
  productType: string;
  setGroupId?: string | null;
  dtfLineData?: unknown;
  uvLineData?: unknown;
}): string[] {
  if (line.setGroupId) return [];
  if (line.productType === "dtf_apparel") return parseDtfLineData(line.dtfLineData)?.zones.map((z) => z.id) ?? [];
  if (line.productType === "uv_print") return parseUvLineData(line.uvLineData)?.zones.map((z) => z.id) ?? [];
  return [];
}

/**
 * Which stored files of one order line become their own wizard row.
 *
 * Normally that is every file. Two exceptions keep a multi-file line as one row:
 * - a double-sided business-card run: both faces are imposed on the same
 *   sheet, so the reverse is carried alongside the front;
 * - DTF on apparel / UV with `zoneIds` (the line's zones, {@link wizardLineZoneIds}):
 *   one item with a print per zone, so the zone files ride on the row
 *   (`zoneFiles`) instead of each becoming an item of its own. The row file is
 *   the one tagged to the first zone (else the first file). Extra files of a
 *   zone that already has one — or untagged files once every zone has a file —
 *   stay separate rows.
 */
export function wizardRowFilesForLine<
  T extends { id: string; paperType: string | null },
>(
  productType: string,
  files: readonly T[],
  opts: { zoneIds?: readonly string[] } = {},
): {
  rowFiles: T[];
  businessCardBack: T | null;
  /** DTF / UV: files of the other zones, in zone order. */
  zoneFiles?: { zoneId: string; file: T }[];
  /** DTF / UV: zone the row's own file prints in. */
  rowZoneId?: string | null;
} {
  const zoneIds: readonly string[] = opts.zoneIds ?? [];
  const zoneIdOf =
    productType === "dtf_apparel" ? dtfZoneIdFromPaperType : productType === "uv_print" ? uvZoneIdFromPaperType : null;
  if (zoneIdOf && zoneIds.length > 0 && files.length > 0) {
    return zoneRowFiles(files, zoneIds, zoneIdOf);
  }
  if (!isSheetProductType(productType)) {
    return { rowFiles: [...files], businessCardBack: null };
  }
  const { front, back } = businessCardFaces(files);
  return {
    rowFiles: front != null ? [front] : [],
    businessCardBack: back,
  };
}

function zoneRowFiles<T extends { id: string; paperType: string | null }>(
  files: readonly T[],
  zoneIds: readonly string[],
  zoneIdOf: (paperType: string | null) => string | null,
): { rowFiles: T[]; businessCardBack: null; zoneFiles: { zoneId: string; file: T }[]; rowZoneId: string } {
  const known = (f: T): string | null => {
    const z = zoneIdOf(f.paperType);
    return z && zoneIds.includes(z) ? z : null;
  };
  const rowFile: T = files.find((f) => known(f) === zoneIds[0]) ?? files[0]!;
  const rowZoneId: string = known(rowFile) ?? zoneIds[0]!;
  const byZone = new Map<string, T>();
  const leftovers: T[] = [];
  for (const f of files) {
    if (f === rowFile) continue;
    const z = known(f);
    if (z && z !== rowZoneId && !byZone.has(z)) byZone.set(z, f);
    else leftovers.push(f);
  }
  // Untagged / unknown-zone files fill zones still without a file, in zone order.
  const separate: T[] = [];
  for (const f of leftovers) {
    const free = zoneIds.find((z) => z !== rowZoneId && !byZone.has(z));
    if (free && known(f) == null) byZone.set(free, f);
    else separate.push(f);
  }
  return {
    rowFiles: [rowFile, ...separate],
    businessCardBack: null,
    zoneFiles: zoneIds.flatMap((zoneId) => {
      const file = byZone.get(zoneId);
      return file ? [{ zoneId, file }] : [];
    }),
    rowZoneId,
  };
}

/** Restore admin paper row state from stored `File` row on an order line. */
export function paperPrintFromStoredFile(f: {
  paperType: string | null;
  color: string;
  pageCount: number | null;
}): SlotPaperPrint {
  const raw = f.paperType ?? "A4";
  if (raw.startsWith("other:")) {
    const rest = raw.slice(6);
    const [w, h] = rest.split("x");
    return {
      color: f.color === "color" ? "color" : "bw",
      paperType: "other",
      customWidth: w?.trim() ?? "",
      customHeight: h?.trim() ?? "",
      pageCount: f.pageCount ?? undefined,
    };
  }
  const pt = PAPER_OPTIONS.includes(raw as PaperType)
    ? (raw as PaperType)
    : "A4";
  return {
    color: f.color === "color" ? "color" : "bw",
    paperType: pt,
    customWidth: "",
    customHeight: "",
    pageCount: f.pageCount ?? undefined,
  };
}
