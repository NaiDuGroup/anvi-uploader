import type { Prisma, PrismaClient } from "@prisma/client";
import { StockApiError, decimalPatch } from "./apiRoute";
import { slotFieldRoleProblem, variantFitsRole } from "./printerAdmin";
import type { PrinterSlotRole } from "./printerMath";

/** Server-side checks shared by the printer slot routes. */

type Db = Prisma.TransactionClient | PrismaClient;

/** 400 `variant_role_mismatch` unless the variant belongs to the category matching the role; 404 if missing. */
export async function assertVariantFitsRole(db: Db, variantId: string, role: PrinterSlotRole): Promise<void> {
  const v = await db.stockVariant.findUnique({
    where: { id: variantId },
    select: { item: { select: { category: { select: { code: true } } } } },
  });
  if (!v) throw new StockApiError(404, "variant_not_found");
  if (!variantFitsRole(role, v.item.category.code)) {
    throw new StockApiError(400, "variant_role_mismatch", { role, categoryCode: v.item.category.code });
  }
}

/** 400 `field_not_for_role` when share/yield is set on a slot of another role. */
export function assertFieldsFitRole(
  role: PrinterSlotRole,
  body: { share?: number | null; sheetsPerUnit?: number | null },
): void {
  const field = slotFieldRoleProblem(role, body);
  if (field) throw new StockApiError(400, "field_not_for_role", { field, role });
}

/** 409 `label_taken` when another slot of the printer already uses this label (case-insensitive). */
export async function assertSlotLabelFree(
  db: Db,
  printerId: string,
  label: string,
  excludeSlotId?: string,
): Promise<void> {
  const clash = await db.printerSlot.findFirst({
    where: {
      printerId,
      label: { equals: label, mode: "insensitive" },
      ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new StockApiError(409, "label_taken");
}

export function sharePatch(value: number | null | undefined): Prisma.Decimal | null | undefined {
  return decimalPatch(value, 4);
}
