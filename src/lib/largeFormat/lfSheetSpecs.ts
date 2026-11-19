import type { Prisma, PrismaClient } from "@prisma/client";
import { lfMaterialSheetSpec, type LfSheetSpec } from "./lfSheet";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sheet spec per wide-format material id, for the sheet materials among `ids`
 * (rolls are absent from the map). Lines read the *current* form of their
 * material: a line priced while the material was a roll still prints on sheets.
 */
export async function loadLfSheetSpecs(db: Db, ids: Iterable<string | null | undefined>): Promise<Map<string, LfSheetSpec>> {
  const unique = [...new Set([...ids].filter((id): id is string => typeof id === "string" && id.length > 0))];
  const out = new Map<string, LfSheetSpec>();
  if (unique.length === 0) return out;
  const rows = await db.largeFormatMaterial.findMany({
    where: { id: { in: unique }, materialForm: "sheet" },
    select: { id: true, materialForm: true, sheetWidthCm: true, sheetHeightCm: true, sheetMarginMm: true },
  });
  for (const r of rows) {
    const spec = lfMaterialSheetSpec(r);
    if (spec) out.set(r.id, spec);
  }
  return out;
}
