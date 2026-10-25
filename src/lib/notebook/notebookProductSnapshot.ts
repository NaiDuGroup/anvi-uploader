import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";
import { z } from "zod";
import { NOTEBOOK_DEFAULT_PRINT } from "../printDimensions";
import {
  NOTEBOOK_PAPER_KIND_DEFAULT,
  coerceNotebookPaperKind,
  notebookPaperKindZod,
} from "./notebookPaperKind";
import { parseNotebookAttributes, type NotebookAttributes } from "./notebookVariantAttributes";

function randomUuid(): string {
  const c = globalThis.crypto;
  if (!c?.randomUUID) {
    throw new Error("crypto.randomUUID is not available in this environment");
  }
  return c.randomUUID();
}

const notebookProductSnapshotSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().optional(),
  nameRo: z.string().optional(),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  /** @deprecated legacy */
  name: z.string().optional(),
  imageUrl: z.string().nullable(),
  coverColorHex: z.string(),
  strapColorHex: z.string(),
  bookmarkColorHex: z.string(),
  // Paper layout (ruled / squared / dated). Optional for legacy snapshots —
  // `normalizeSnapshot` defaults missing/invalid values to "ruled".
  paperKind: notebookPaperKindZod.optional(),
  // Print area frozen at order creation. Older orders without these fields
  // fall back to `NOTEBOOK_DEFAULT_PRINT` (the legacy A5 hardcover canvas).
  printWidthCm: z.number().positive().optional(),
  printHeightCm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  // 3D-preview availability frozen at order creation. Defaults to true when
  // missing from older snapshots.
  has3dPreview: z.boolean().optional(),
  /** Client chose «Other» — notebook not from catalog */
  isOther: z.boolean().optional(),
  /**
   * Frozen catalog retail price in MDL with bani precision (2dp). Legacy
   * snapshots with whole-lei integer values are accepted by the same
   * `z.number()` check — both `15` and `15.50` round-trip cleanly.
   */
  sellPrice: z.number().nonnegative().nullable().optional(),
  /** Frozen catalog purchase cost in MDL with bani precision (2dp). */
  purchaseCost: z.number().nonnegative().nullable().optional(),
});

export type NotebookProductSnapshot = z.infer<typeof notebookProductSnapshotSchema>;

function normalizeSnapshot(
  d: z.infer<typeof notebookProductSnapshotSchema>,
): NotebookProductSnapshot | null {
  const paperKind = coerceNotebookPaperKind(d.paperKind);

  if (d.isOther === true) {
    return {
      ...d,
      nameRo: d.nameRo?.trim() || "Alt caiet (descrieți în observații)",
      nameRu: d.nameRu?.trim() || "Другой блокнот (опишите в комментарии)",
      nameEn: d.nameEn?.trim() || "Other notebook (describe in order notes)",
      sku: d.sku ?? "OTHER",
      paperKind,
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
      paperKind,
    };
  }
  if (ro && ru && en) {
    return {
      ...d,
      nameRo: ro,
      nameRu: ru,
      nameEn: en,
      sku: d.sku ?? "—",
      paperKind,
    };
  }
  return null;
}

/** Minimal unified notebook shape (variant + item) the snapshot needs. */
export type NotebookVariantSnapshotSource = {
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
 * Snapshot frozen onto a notebook order line, built from the unified notebook
 * (item + its single variant). Same JSON shape as the legacy notebook-product
 * snapshot; `id` is the variant id, `purchaseCost` = variant avg cost, else the
 * purchase-cost hint.
 */
export function notebookVariantToSnapshot(v: NotebookVariantSnapshotSource): NotebookProductSnapshot {
  const a: NotebookAttributes = parseNotebookAttributes(v.item.attributes);
  return {
    id: v.id,
    sku: v.item.sku,
    nameRo: v.item.nameRo,
    nameRu: v.item.nameRu,
    nameEn: v.item.nameEn,
    imageUrl: v.item.imageUrl,
    coverColorHex: a.coverColorHex,
    strapColorHex: a.strapColorHex,
    bookmarkColorHex: a.bookmarkColorHex,
    paperKind: a.paperKind,
    printWidthCm: a.printWidthCm,
    printHeightCm: a.printHeightCm,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
    sellPrice: numberOrNull(v.sellPrice),
    purchaseCost: effectiveUnitCost(numberOrNull(v.avgCost), numberOrNull(v.purchaseCost)),
  };
}

export function otherNotebookProductSnapshot(): NotebookProductSnapshot {
  return {
    id: randomUuid(),
    sku: "OTHER",
    nameRo: "Alt caiet (descrieți în observații)",
    nameRu: "Другой блокнот (опишите в комментарии)",
    nameEn: "Other notebook (describe in order notes)",
    imageUrl: null,
    coverColorHex: "#1f1f1f",
    strapColorHex: "#1f1f1f",
    bookmarkColorHex: "#c0392b",
    paperKind: NOTEBOOK_PAPER_KIND_DEFAULT,
    printWidthCm: NOTEBOOK_DEFAULT_PRINT.widthCm,
    printHeightCm: NOTEBOOK_DEFAULT_PRINT.heightCm,
    printDpi: NOTEBOOK_DEFAULT_PRINT.dpi,
    has3dPreview: true,
    isOther: true,
  };
}

export function parseNotebookProductSnapshot(
  raw: unknown,
): NotebookProductSnapshot | null {
  const r = notebookProductSnapshotSchema.safeParse(raw);
  if (!r.success) return null;
  return normalizeSnapshot(r.data);
}
