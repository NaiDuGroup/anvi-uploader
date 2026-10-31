import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";
import { z } from "zod";
import { MUG_DEFAULT_PRINT } from "../printDimensions";
import { parseMugAttributes, type MugAttributes } from "./mugVariantAttributes";
import { MUG_FINISHES } from "./mugSurface";

/** Browser-safe UUID (also works in Node 18+ global Web Crypto). Avoids `import "crypto"` in client bundles. */
function randomUuid(): string {
  const c = globalThis.crypto;
  if (!c?.randomUUID) {
    throw new Error("crypto.randomUUID is not available in this environment");
  }
  return c.randomUUID();
}

/** Stored on orders; legacy rows may have `name` or `isFallback`. */
const mugProductSnapshotSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().optional(),
  nameRo: z.string().optional(),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  /** @deprecated Old orders: single label before trilingual catalog */
  name: z.string().optional(),
  imageUrl: z.string().nullable(),
  bodyColorHex: z.string(),
  handleColorHex: z.string(),
  innerColorHex: z.string().nullable(),
  rimColorHex: z.string().nullable().optional(),
  // Print area frozen at order creation. Older orders without these fields
  // fall back to `MUG_DEFAULT_PRINT` (the legacy hardcoded canvas).
  printWidthCm: z.number().positive().optional(),
  printHeightCm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  // 3D-preview availability frozen at order creation. Older orders without
  // this field default to `true` to preserve legacy behaviour.
  has3dPreview: z.boolean().optional(),
  // 3D surface frozen at order creation; older orders = glossy, no gradient.
  finish: z.enum(MUG_FINISHES).optional(),
  gradientColorHex: z.string().nullable().optional(),
  gradientHeightPct: z.number().optional(),
  /** @deprecated Removed from catalog; kept for old order JSON */
  isFallback: z.boolean().optional(),
  /** Client chose «Other» — mug not from catalog */
  isOther: z.boolean().optional(),
  /**
   * Frozen catalog retail price in MDL with bani precision (2dp). Older
   * snapshots stored integer-only values; the schema accepts both since
   * `1.5` and `1` both parse as `z.number()`.
   */
  sellPrice: z.number().nonnegative().nullable().optional(),
  /** Frozen catalog purchase cost in MDL with bani precision (2dp). */
  purchaseCost: z.number().nonnegative().nullable().optional(),
});

export type MugProductSnapshot = z.infer<typeof mugProductSnapshotSchema>;

function normalizeSnapshot(
  d: z.infer<typeof mugProductSnapshotSchema>,
): MugProductSnapshot | null {
  if (d.isOther === true) {
    return {
      ...d,
      nameRo: d.nameRo?.trim() || "Altă cană (descrieți în observații)",
      nameRu: d.nameRu?.trim() || "Другая кружка (опишите в комментарии)",
      nameEn: d.nameEn?.trim() || "Other mug (describe in order notes)",
      sku: d.sku ?? "OTHER",
      isOther: true,
    };
  }

  const legacy = d.name?.trim();
  const ro = d.nameRo?.trim();
  const ru = d.nameRu?.trim();
  const en = d.nameEn?.trim();
  if (legacy && !ro && !ru && !en) {
    return {
      ...d,
      nameRo: legacy,
      nameRu: legacy,
      nameEn: legacy,
      sku: d.sku ?? "—",
    };
  }
  if (ro && ru && en) {
    return {
      ...d,
      nameRo: ro,
      nameRu: ru,
      nameEn: en,
      sku: d.sku ?? "—",
    };
  }
  return null;
}

/** Minimal unified mug shape (variant + item) the snapshot needs. */
export type MugVariantSnapshotSource = {
  id: string;
  sellPrice: { toString(): string } | null;
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

function numberOrNull(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  const n: number = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Snapshot frozen onto a mug order line, built from the unified mug (item +
 * its single variant). Same JSON shape as the legacy mug-product snapshot;
 * `id` is the variant id, `purchaseCost` = variant avg cost, else the
 * purchase-cost hint.
 */
export function mugVariantToSnapshot(v: MugVariantSnapshotSource): MugProductSnapshot {
  const a: MugAttributes = parseMugAttributes(v.item.attributes);
  return {
    id: v.id,
    sku: v.item.sku,
    nameRo: v.item.nameRo,
    nameRu: v.item.nameRu,
    nameEn: v.item.nameEn,
    imageUrl: v.item.imageUrl,
    bodyColorHex: a.bodyColorHex,
    handleColorHex: a.handleColorHex,
    innerColorHex: a.innerColorHex,
    rimColorHex: a.rimColorHex,
    printWidthCm: a.printWidthCm,
    printHeightCm: a.printHeightCm,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
    finish: a.finish,
    gradientColorHex: a.gradientColorHex,
    gradientHeightPct: a.gradientHeightPct,
    sellPrice: numberOrNull(v.sellPrice),
    purchaseCost: effectiveUnitCost(numberOrNull(v.avgCost), numberOrNull(v.purchaseCost)),
  };
}

/** When the client picks «Other» instead of a catalog SKU. */
export function otherMugProductSnapshot(): MugProductSnapshot {
  return {
    id: randomUuid(),
    sku: "OTHER",
    nameRo: "Altă cană (descrieți în observații)",
    nameRu: "Другая кружка (опишите в комментарии)",
    nameEn: "Other mug (describe in order notes)",
    imageUrl: null,
    bodyColorHex: "#f5f5f0",
    handleColorHex: "#a8a29e",
    innerColorHex: null,
    rimColorHex: null,
    // Legacy mug canvas — keeps "Other" mugs rendering at the well-known size.
    printWidthCm: MUG_DEFAULT_PRINT.widthCm,
    printHeightCm: MUG_DEFAULT_PRINT.heightCm,
    printDpi: MUG_DEFAULT_PRINT.dpi,
    has3dPreview: true,
    isOther: true,
  };
}

export function parseMugProductSnapshot(raw: unknown): MugProductSnapshot | null {
  const r = mugProductSnapshotSchema.safeParse(raw);
  if (!r.success) return null;
  return normalizeSnapshot(r.data);
}
