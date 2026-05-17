import { Prisma } from "@prisma/client";

/**
 * Coerce catalog print dimensions (cm) to values compatible with
 * `@db.Decimal(5, 2)` when writing mug/notebook product rows.
 */
export function catalogPrintCmDecimal(cm: number): Prisma.Decimal {
  return new Prisma.Decimal(cm.toFixed(2));
}
