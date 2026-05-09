import type { MugProduct } from "@prisma/client";
import { z } from "zod";

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
  /** @deprecated Removed from catalog; kept for old order JSON */
  isFallback: z.boolean().optional(),
  /** Client chose «Other» — mug not from catalog */
  isOther: z.boolean().optional(),
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

export function mugProductToSnapshot(p: MugProduct): MugProductSnapshot {
  return {
    id: p.id,
    sku: p.sku,
    nameRo: p.nameRo,
    nameRu: p.nameRu,
    nameEn: p.nameEn,
    imageUrl: p.imageUrl,
    bodyColorHex: p.bodyColorHex,
    handleColorHex: p.handleColorHex,
    innerColorHex: p.innerColorHex,
    rimColorHex: p.rimColorHex,
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
    isOther: true,
  };
}

export function parseMugProductSnapshot(raw: unknown): MugProductSnapshot | null {
  const r = mugProductSnapshotSchema.safeParse(raw);
  if (!r.success) return null;
  return normalizeSnapshot(r.data);
}
