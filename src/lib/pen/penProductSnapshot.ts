import type { PenProduct } from "@prisma/client";
import { z } from "zod";

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
});

export function penProductToSnapshot(p: PenProduct): PenProductSnapshot {
  return {
    sku: p.sku,
    nameRo: p.nameRo,
    nameRu: p.nameRu,
    nameEn: p.nameEn,
    imageUrl: p.imageUrl,
    bodyColorHex: p.bodyColorHex,
    clipColorHex: p.clipColorHex,
    printWidthCm: Number(p.printWidthCm),
    printHeightCm: Number(p.printHeightCm),
    printDpi: p.printDpi,
    has3dPreview: p.has3dPreview,
    sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
    dealerPrice: p.dealerPrice ? Number(p.dealerPrice) : null,
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
  };
}
