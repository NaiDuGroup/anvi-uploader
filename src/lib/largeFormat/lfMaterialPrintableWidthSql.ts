import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Stale `@prisma/client` (or long-lived singleton) may not know this field yet. */
export function isPrismaUnknownPrintableWidthMetersError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Unknown argument [`']printableWidthMeters[`']/.test(msg);
}

export async function lfMaterialUpdatePrintableWidthMetersRaw(
  client: PrismaClient,
  id: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await client.$executeRaw`
      UPDATE large_format_materials SET printable_width_m = NULL WHERE id = ${id}
    `;
  } else {
    await client.$executeRaw`
      UPDATE large_format_materials
      SET printable_width_m = ${value}::decimal(8, 3)
      WHERE id = ${id}
    `;
  }
}

/** One query; safe for stale Prisma delegates that omit `printable_width_m` in SELECT. */
export async function lfMaterialPrintableWidthByIdsRaw(
  client: PrismaClient,
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;

  const rows = await client.$queryRaw<Array<{ id: string; printable_width_m: unknown }>>`
    SELECT id, printable_width_m FROM large_format_materials
    WHERE id IN (${Prisma.join(ids)})
  `;
  for (const r of rows) {
    map.set(r.id, r.printable_width_m == null ? null : String(r.printable_width_m));
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, null);
  }
  return map;
}
