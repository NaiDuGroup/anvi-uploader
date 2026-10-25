import { z } from "zod";
import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";
import { parsePenAttributes, type PenAttributes } from "./penVariantAttributes";

export type PenProductSnapshot = {
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  /** Storage key, not a URL — resolve with `publicAssetUrlFromStorageKey`. */
  imageUrl: string | null;
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  sellPrice: number | null;
  dealerPrice: number | null;
  /** Unit COGS frozen at order time (weighted-average receipt cost or catalog hint). */
  purchaseCost?: number | null;
};

/**
 * Reader schema for the JSON frozen onto orders. Only the identity fields are
 * required — colours and print dimensions were always written by
 * {@link penProductToSnapshot}, but staying lenient means a snapshot from an
 * older catalog shape still renders instead of making the line disappear.
 */
const penProductSnapshotSchema = z.object({
  sku: z.string().optional(),
  nameRo: z.string().optional(),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  // Added after the first pen orders shipped, so it is optional rather than
  // nullable-required: those snapshots have no key at all.
  imageUrl: z.string().nullable().optional(),
  bodyColorHex: z.string().optional(),
  clipColorHex: z.string().optional(),
  printWidthCm: z.number().positive().optional(),
  printHeightCm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  has3dPreview: z.boolean().optional(),
  sellPrice: z.number().nonnegative().nullable().optional(),
  dealerPrice: z.number().nonnegative().nullable().optional(),
  purchaseCost: z.number().nonnegative().nullable().optional(),
});

/** Minimal unified pen shape (variant + item) the snapshot needs. */
export type PenVariantSnapshotSource = {
  sellPrice: { toString(): string } | null;
  dealerPrice: { toString(): string } | null;
  avgCost: { toString(): string } | null;
  purchaseCost: { toString(): string } | null;
  item: {
    sku: string;
    nameRo: string;
    nameRu: string;
    nameEn: string;
    imageUrl: string | null;
    attributes: unknown;
  };
};

function priceOrNull(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  const n: number = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Snapshot frozen onto a pen order line, built from the unified pen (item +
 * its single variant). Same JSON shape as the legacy pen-product snapshot;
 * `purchaseCost` = variant avg cost, else the purchase-cost hint.
 */
export function penVariantToSnapshot(v: PenVariantSnapshotSource): PenProductSnapshot {
  const a: PenAttributes = parsePenAttributes(v.item.attributes);
  return {
    sku: v.item.sku,
    nameRo: v.item.nameRo,
    nameRu: v.item.nameRu,
    nameEn: v.item.nameEn,
    imageUrl: v.item.imageUrl,
    bodyColorHex: a.bodyColorHex,
    clipColorHex: a.clipColorHex,
    printWidthCm: a.printWidthCm,
    printHeightCm: a.printHeightCm,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
    sellPrice: priceOrNull(v.sellPrice),
    dealerPrice: priceOrNull(v.dealerPrice),
    purchaseCost: effectiveUnitCost(
      v.avgCost == null ? null : Number(v.avgCost.toString()),
      v.purchaseCost == null ? null : Number(v.purchaseCost.toString()),
    ),
  };
}

export function otherPenProductSnapshot(): PenProductSnapshot {
  return {
    sku: "OTHER",
    nameRo: "Alt Pix",
    nameRu: "Другая ручка",
    nameEn: "Other Pen",
    imageUrl: null,
    bodyColorHex: "#1f1f1f",
    clipColorHex: "#c0c0c0",
    printWidthCm: 4.0,
    printHeightCm: 1.5,
    printDpi: 300,
    has3dPreview: false,
    sellPrice: null,
    dealerPrice: null,
  };
}

/**
 * Parse the snapshot JSON stored on an order line. Returns `null` only when
 * the value is not an object at all — callers (e.g. the workshop board) drop
 * the line in that case, so missing optional fields are filled with the same
 * defaults «Other» uses rather than rejected.
 */
export function parsePenProductSnapshot(raw: unknown): PenProductSnapshot | null {
  const parsed = penProductSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const fallback = otherPenProductSnapshot();
  const ro = d.nameRo?.trim();
  const ru = d.nameRu?.trim();
  const en = d.nameEn?.trim();
  return {
    sku: d.sku?.trim() || "—",
    nameRo: ro || ru || en || fallback.nameRo,
    nameRu: ru || ro || en || fallback.nameRu,
    nameEn: en || ro || ru || fallback.nameEn,
    imageUrl: d.imageUrl ?? null,
    bodyColorHex: d.bodyColorHex ?? fallback.bodyColorHex,
    clipColorHex: d.clipColorHex ?? fallback.clipColorHex,
    printWidthCm: d.printWidthCm ?? fallback.printWidthCm,
    printHeightCm: d.printHeightCm ?? fallback.printHeightCm,
    printDpi: d.printDpi ?? fallback.printDpi,
    has3dPreview: d.has3dPreview ?? fallback.has3dPreview,
    sellPrice: d.sellPrice ?? null,
    dealerPrice: d.dealerPrice ?? null,
    purchaseCost: d.purchaseCost ?? null,
  };
}
