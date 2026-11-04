import { prisma } from "@/lib/prisma";
import type { DtfLocalizedNames } from "@/lib/dtf/dtfDto";

type NamesById = ReadonlyMap<string, DtfLocalizedNames>;

/** The line's garment snapshot when it has a stock item but no localized names yet. */
function garmentWithoutNames(dtfLineData: unknown): { stockItemId: string; names?: unknown } | null {
  if (dtfLineData == null || typeof dtfLineData !== "object" || Array.isArray(dtfLineData)) return null;
  const g: unknown = (dtfLineData as { garment?: unknown }).garment;
  if (g == null || typeof g !== "object") return null;
  const garment = g as { stockItemId?: unknown; names?: unknown };
  if (garment.names != null || typeof garment.stockItemId !== "string" || !garment.stockItemId) return null;
  return garment as { stockItemId: string; names?: unknown };
}

/** Stock items whose names the lines miss. */
export function dtfStockItemIdsWithoutNames(lines: Iterable<{ dtfLineData: unknown }>): string[] {
  const ids = new Set<string>();
  for (const line of lines) {
    const g = garmentWithoutNames(line.dtfLineData);
    if (g) ids.add(g.stockItemId);
  }
  return [...ids];
}

/** Writes the item names into the lines' garment snapshots (in place). */
export function applyDtfGarmentNames(lines: Iterable<{ dtfLineData: unknown }>, namesById: NamesById): void {
  for (const line of lines) {
    const g = garmentWithoutNames(line.dtfLineData);
    const names: DtfLocalizedNames | undefined = g ? namesById.get(g.stockItemId) : undefined;
    if (g && names) g.names = names;
  }
}

/**
 * DTF lines priced before 2026-11-05 kept only the Romanian item name. Fill in
 * the names of their stock item, so a Russian viewer reads «Кепка ERIS
 * тёмно-синяя» and not «Șapcă ERIS bleumarin». One query; no-op when every
 * line has its names (or no stock item).
 */
export async function fillDtfGarmentNames(lines: readonly { dtfLineData: unknown }[]): Promise<void> {
  const ids: string[] = dtfStockItemIdsWithoutNames(lines);
  if (ids.length === 0) return;
  const rows = await prisma.stockItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameRo: true, nameRu: true, nameEn: true },
  });
  applyDtfGarmentNames(
    lines,
    new Map(rows.map((r) => [r.id, { ro: r.nameRo, ru: r.nameRu, en: r.nameEn }])),
  );
}
