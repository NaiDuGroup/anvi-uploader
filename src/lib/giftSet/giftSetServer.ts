import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountingSettings, invalidateAccountingSettings } from "@/lib/accounting/accountingSettings";
import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { AdminOrderResolveError } from "@/lib/adminOrderCreateHelpers";
import type { UvLineData } from "@/lib/uv/types";
import {
  parseGiftSetTemplates,
  planGiftSets,
  READY_THERMOS_SET_COLOURS,
  READY_THERMOS_SET_ITEM_SKU,
  type GiftSetPlanLine,
  type GiftSetTemplate,
} from "./giftSet";
import { uvLineAtGiftSetPrice } from "./giftSetUv";

/** «Шаблоны наборов» (stored, else the defaults). */
export async function loadGiftSetTemplates(): Promise<GiftSetTemplate[]> {
  const acct = await getOrCreateAccountingSettings();
  return parseGiftSetTemplates(acct.giftSetTemplates);
}

export async function saveGiftSetTemplates(templates: GiftSetTemplate[]): Promise<void> {
  await prisma.accountingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", giftSetTemplates: templates as unknown as Prisma.InputJsonValue },
    update: { giftSetTemplates: templates as unknown as Prisma.InputJsonValue },
  });
  invalidateAccountingSettings();
}

function lineCopies(r: ResolvedAdminOrderLine): number {
  if (r.input.productType === "uv_print") {
    return (r.uvExtras?.uvLineData as UvLineData | undefined)?.quantity ?? r.input.uv?.quantity ?? 0;
  }
  return r.input.files.reduce((s, f) => s + (Number.isFinite(f.copies) ? f.copies : 0), 0);
}

/**
 * Checks and prices the set groups of resolved lines (in place): assembled
 * set lines get their share of the set price as the price per piece
 * (`manualUnitPriceMdl`), a ready set's UV line is billed at the set price;
 * every set line gets `giftSetExtras` (group id + set data). Lines outside a
 * set are untouched. Throws {@link AdminOrderResolveError} with a stable code.
 * `allowManualPrice`: staff may override the price of one set; dealers never.
 */
export async function applyGiftSetsToResolved(
  resolved: ResolvedAdminOrderLine[],
  opts: { allowManualPrice: boolean },
): Promise<void> {
  if (!resolved.some((r) => r.input.set)) return;
  const templates = await loadGiftSetTemplates();

  // Ready sets: the stock item SKU of each UV line's variant.
  const variantIds = resolved
    .filter((r) => r.input.set?.role === "ready" && r.uvExtras?.uvLineData.item)
    .map((r) => r.uvExtras!.uvLineData.item!.variantId);
  const variants = variantIds.length
    ? await prisma.stockVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, item: { select: { sku: true } } } })
    : [];
  const itemSkuByVariant = new Map(variants.map((v) => [v.id, v.item.sku]));

  const planLines: GiftSetPlanLine[] = resolved.map((r) => {
    const li = r.input;
    return {
      productType: li.productType,
      set: li.set ?? null,
      quantity: lineCopies(r),
      customerType: li.customerType === "dealer" ? "dealer" : "retail",
      readyItemSku: r.uvExtras?.uvLineData.item ? (itemSkuByVariant.get(r.uvExtras.uvLineData.item.variantId) ?? null) : null,
      otherItem: Boolean(
        (li.productType === "mug" && (li.mugOther || !r.mugExtras?.stockVariantId)) ||
          (li.productType === "notebook" && (li.notebookOther || !r.notebookExtras?.stockVariantId)) ||
          (li.productType === "pen" && (li.penOther || !r.penExtras?.stockVariantId)),
      ),
    };
  });
  const plan = planGiftSets(planLines, templates, opts);
  if (!plan.ok) throw new AdminOrderResolveError(plan.code);

  for (const [i, { groupId, data }] of plan.byLine) {
    const r = resolved[i]!;
    r.giftSetExtras = { setGroupId: groupId, setData: data };
    if (data.kind === "ready" && r.uvExtras) {
      r.uvExtras = { uvLineData: uvLineAtGiftSetPrice(r.uvExtras.uvLineData, data.lineTotalMdl) };
    } else {
      r.manualUnitPriceMdl = data.lineUnitPriceMdl;
    }
  }
}

/** Category of bought-in ready sets (UV-printable, so the set item can be a UV stock line). */
export const GIFT_SET_CATEGORY_CODE = "gift_sets";

/**
 * Creates the thermos set stock item (one variant per colour, 0 pcs, no cost)
 * in «Подарочные наборы» (created when missing, UV). Prices from the template
 * (retail / dealer). Idempotent: an existing item / variant is kept.
 * Stock arrives later through a receipt or «Инвентаризация».
 */
export async function createReadyGiftSetStockItem(template: GiftSetTemplate): Promise<{ itemId: string; created: boolean }> {
  const sku = template.readyItemSku ?? READY_THERMOS_SET_ITEM_SKU;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockItem.findUnique({ where: { sku }, select: { id: true } });
    if (existing) return { itemId: existing.id, created: false };
    const category =
      (await tx.stockCategory.findUnique({ where: { code: GIFT_SET_CATEGORY_CODE }, select: { id: true } })) ??
      (await tx.stockCategory.create({
        data: {
          code: GIFT_SET_CATEGORY_CODE,
          kind: "product",
          nameRo: "Seturi cadou",
          nameRu: "Подарочные наборы",
          nameEn: "Gift sets",
          unit: "pcs",
          printMethods: ["uv"],
          sortOrder: 90,
        },
        select: { id: true },
      }));
    const item = await tx.stockItem.create({
      data: {
        categoryId: category.id,
        sku,
        nameRu: `Набор: ${template.name.toLowerCase()}`,
        nameRo: "Set cadou: termos, agendă, pix",
        nameEn: "Gift set: thermos, notebook, pen",
        printMethods: ["uv"],
        attributes: { giftSetTemplateId: template.id, contents: "термос, блокнот, ручка, пакет" },
        internalNotes: "Готовый набор из Китая (коробка с блокнотом, ручкой, термосом и пакетом). Создан из «Шаблоны наборов».",
        variants: {
          create: READY_THERMOS_SET_COLOURS.map((c, i) => ({
            sku: `${sku}-${c.code}`,
            label: c.label,
            options: { color: c.label, colorHex: c.hex },
            sellPrice: template.retailPriceMdl,
            dealerPrice: template.dealerPriceMdl,
            sortOrder: i,
          })),
        },
      },
      select: { id: true },
    });
    return { itemId: item.id, created: true };
  });
}
