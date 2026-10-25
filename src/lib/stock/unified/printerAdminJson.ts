import type { Prisma, PrismaClient } from "@prisma/client";
import { toStockVariantJson } from "./adminJson";
import { categoryUnit } from "./apiRoute";
import {
  categoryCodeForRole,
  isPrinterSlotRole,
  PRINTER_SLOT_ROLES,
  type PrinterConsumableOptionJson,
  type PrinterJson,
  type PrinterSlotJson,
  type PrintersResponse,
} from "./printerAdmin";
import { blendedInkCost, PrinterSlotRole, tonerCostPerSheet } from "./printerMath";

/** Prisma rows → JSON for `/api/admin/stock/printers/**`. */

type Db = Prisma.TransactionClient | PrismaClient;

export const PRINTER_INCLUDE = {
  slots: {
    orderBy: [{ sortOrder: "asc" as const }, { label: "asc" as const }],
    include: {
      variant: {
        include: {
          item: {
            select: {
              id: true,
              sku: true,
              nameRo: true,
              nameRu: true,
              nameEn: true,
              isActive: true,
              category: { select: { code: true, unit: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PrinterInclude;

type PrinterRow = Prisma.PrinterGetPayload<{ include: typeof PRINTER_INCLUDE }>;
type SlotRow = PrinterRow["slots"][number];

function num(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

export function toPrinterSlotJson(row: SlotRow): PrinterSlotJson {
  const v = row.variant;
  const variant = v ? toStockVariantJson(v) : null;
  return {
    id: row.id,
    label: row.label,
    role: isPrinterSlotRole(row.role) ? row.role : PrinterSlotRole.Ink,
    share: num(row.share),
    sheetsPerUnit: row.sheetsPerUnit,
    sortOrder: row.sortOrder,
    loaded:
      v && variant
        ? {
            variant,
            item: {
              id: v.item.id,
              sku: v.item.sku,
              nameRo: v.item.nameRo,
              nameRu: v.item.nameRu,
              nameEn: v.item.nameEn,
              isActive: v.item.isActive,
            },
            categoryCode: v.item.category.code,
            unit: categoryUnit(v.item.category.unit),
            effectiveCost: variant.avgCost ?? variant.purchaseCost,
          }
        : null,
  };
}

export function toPrinterJson(row: PrinterRow): PrinterJson {
  const slots: PrinterSlotJson[] = row.slots.map(toPrinterSlotJson);
  const costed = (role: PrinterSlotRole) =>
    slots
      .filter((s) => s.role === role)
      .map((s) => ({ share: s.share, sheetsPerUnit: s.sheetsPerUnit, unitCost: s.loaded?.effectiveCost ?? null }));
  const ink = costed(PrinterSlotRole.Ink);
  const toner = costed(PrinterSlotRole.Toner);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    technology: row.technology,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    slots,
    inkCostPerMl: ink.length > 0 ? blendedInkCost(ink) : null,
    tonerCostPerSheet: toner.length > 0 ? tonerCostPerSheet(toner) : null,
  };
}

export async function loadPrinterJson(db: Db, id: string): Promise<PrinterJson | null> {
  const row = await db.printer.findUnique({ where: { id }, include: PRINTER_INCLUDE });
  return row ? toPrinterJson(row) : null;
}

/** All printers plus, per slot role, the loadable variants of the matching category. */
export async function loadPrintersResponse(db: Db): Promise<PrintersResponse> {
  const [printers, categories] = await Promise.all([
    db.printer.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: PRINTER_INCLUDE }),
    db.stockCategory.findMany({
      where: { code: { in: PRINTER_SLOT_ROLES.map(categoryCodeForRole) } },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
        },
      },
    }),
  ]);

  const consumables = {} as PrintersResponse["consumables"];
  for (const role of PRINTER_SLOT_ROLES) {
    const code: string = categoryCodeForRole(role);
    const category = categories.find((c) => c.code === code);
    const options: PrinterConsumableOptionJson[] = (category?.items ?? []).flatMap((item) =>
      item.variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        label: v.label,
        itemId: item.id,
        nameRo: item.nameRo,
        nameRu: item.nameRu,
        nameEn: item.nameEn,
        stockQuantity: num(v.stockQuantity) ?? 0,
        isActive: item.isActive && v.isActive,
      })),
    );
    consumables[role] = {
      categoryId: category?.id ?? null,
      categoryCode: code,
      unit: category ? categoryUnit(category.unit) : null,
      options,
    };
  }
  return { printers: printers.map(toPrinterJson), consumables };
}
