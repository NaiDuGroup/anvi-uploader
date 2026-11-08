/**
 * «Набор» in the order wizard — pure helpers (the wizard and its tests share them).
 *
 * A set is a group of wizard rows sharing `giftSet.groupId`:
 *  - assembled: one row per component, each a normal pen / notebook / mug
 *    row with its own file; quantity = N sets on every row;
 *  - ready: one row per printed component (thermos / notebook / pen file),
 *    all merged into ONE `uv_print` order line on save.
 */
import {
  designerProductForCategory,
  printMethodForDesignerProduct,
  type DesignerPrintMethod,
} from "@/lib/printMethods/designerProducts";
import type { UvStockItemJson } from "@/lib/uv/dto";
import {
  giftSetUnitPrice,
  skuMatches,
  splitSetUnitPrice,
  type GiftSetCustomerType,
  type GiftSetLineRole,
  type GiftSetRole,
  type GiftSetTemplate,
  type OrderLineSetData,
} from "./giftSet";

/** What a wizard row keeps about its set. */
export interface GiftSetRowAssign {
  groupId: string;
  templateId: string;
  role: GiftSetLineRole;
  /** Ready set: the zone (component) this row's file is for. */
  zoneId?: string;
  /** Ready set: the colour variant of the set item. */
  readyVariantId?: string;
  quantity: number;
  /** Staff: price of one set instead of the template's (null = template). */
  manualUnitPriceMdl: number | null;
}

/** What the set dialog returns. */
export interface GiftSetChoice {
  templateId: string;
  quantity: number;
  /** Assembled: picked variant per component. */
  variants: Partial<Record<GiftSetRole, string>>;
  /** Ready: picked colour variant. */
  readyVariantId: string | null;
  manualUnitPriceMdl: number | null;
}

export interface GiftSetCatalogs {
  uv: readonly UvStockItemJson[];
  sublimation: readonly UvStockItemJson[];
}

function methodFor(role: GiftSetRole): DesignerPrintMethod {
  return printMethodForDesignerProduct(role)!;
}

/** Stock variants offered for a component: the role's category, matching the template's SKU glob. */
export function giftSetComponentOptions(
  template: GiftSetTemplate,
  role: GiftSetRole,
  catalogs: GiftSetCatalogs,
): UvStockItemJson[] {
  const comp = template.components.find((c) => c.role === role);
  if (!comp) return [];
  const method = methodFor(role);
  const items = method === "uv_print" ? catalogs.uv : catalogs.sublimation;
  return items.filter((i) => designerProductForCategory(method, i.categoryCode) === role && skuMatches(comp.skuMatch, i.sku));
}

/** Colour variants of a ready set's stock item (UV catalog, SKU = item SKU or `<item SKU>-…`). */
export function readyGiftSetVariants(template: GiftSetTemplate, uvItems: readonly UvStockItemJson[]): UvStockItemJson[] {
  const sku = template.readyItemSku;
  if (!sku) return [];
  const up = sku.toUpperCase();
  return uvItems.filter((i) => i.sku.toUpperCase() === up || i.sku.toUpperCase().startsWith(`${up}-`));
}

/** Default choice: the first in-stock variant of each component (else the first). */
export function defaultGiftSetChoice(template: GiftSetTemplate, catalogs: GiftSetCatalogs): GiftSetChoice {
  const pick = (items: UvStockItemJson[]): string | undefined => (items.find((i) => i.stockQuantity > 0) ?? items[0])?.id;
  const variants: Partial<Record<GiftSetRole, string>> = {};
  for (const c of template.components) {
    const id = pick(giftSetComponentOptions(template, c.role, catalogs));
    if (id) variants[c.role] = id;
  }
  return {
    templateId: template.id,
    quantity: 1,
    variants,
    readyVariantId: template.kind === "ready" ? (pick(readyGiftSetVariants(template, catalogs.uv)) ?? null) : null,
    manualUnitPriceMdl: null,
  };
}

/** Why the dialog cannot apply the choice yet, or null. */
export function giftSetChoiceProblem(
  template: GiftSetTemplate,
  choice: GiftSetChoice,
): "quantity" | "variant" | "ready_item_missing" | null {
  if (!Number.isInteger(choice.quantity) || choice.quantity < 1) return "quantity";
  if (template.kind === "ready") return choice.readyVariantId ? null : "ready_item_missing";
  return template.components.every((c) => choice.variants[c.role]) ? null : "variant";
}

/** One wizard row a set becomes. */
export interface GiftSetRowPlan {
  role: GiftSetLineRole;
  /** Component / zone label («Кружка», «Термос»). */
  label: string;
  /** Assembled: designer product + its print method + variant. */
  productType: GiftSetRole | "uv_print";
  method: DesignerPrintMethod;
  variantId: string;
  zoneId?: string;
  /** Ready: print size of the zone (cm), for the artwork check. */
  sizeCm?: { widthCm: number; heightCm: number };
}

/** Rows (in order) a set choice becomes. */
export function giftSetRowPlans(template: GiftSetTemplate, choice: GiftSetChoice): GiftSetRowPlan[] {
  if (template.kind === "ready") {
    const variantId = choice.readyVariantId ?? "";
    return template.zones.map((z) => ({
      role: "ready" as const,
      label: z.label,
      productType: "uv_print" as const,
      method: "uv_print" as const,
      variantId,
      zoneId: z.id,
      sizeCm: { widthCm: z.widthCm, heightCm: z.heightCm },
    }));
  }
  return template.components.map((c) => ({
    role: c.role,
    label: c.label,
    productType: c.role,
    method: methodFor(c.role),
    variantId: choice.variants[c.role] ?? "",
  }));
}

/** Line total of every set row as the server will bill it (ready set: on its first row, 0 on the others). */
export function giftSetRowTotals(
  rows: readonly { slotId: string; giftSet: GiftSetRowAssign | null | undefined }[],
  templates: readonly GiftSetTemplate[],
  customerType: GiftSetCustomerType,
  opts: { allowManualPrice: boolean },
): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, { slotId: string; giftSet: GiftSetRowAssign }[]>();
  for (const r of rows) {
    if (!r.giftSet) continue;
    const g = groups.get(r.giftSet.groupId) ?? [];
    g.push({ slotId: r.slotId, giftSet: r.giftSet });
    groups.set(r.giftSet.groupId, g);
  }
  for (const g of groups.values()) {
    const first = g[0]!.giftSet;
    const template = templates.find((t) => t.id === first.templateId);
    if (!template) {
      g.forEach((r) => out.set(r.slotId, 0));
      continue;
    }
    const price = giftSetUnitPrice(template, customerType, opts.allowManualPrice ? first.manualUnitPriceMdl : null);
    if (template.kind === "ready") {
      g.forEach((r, i) => out.set(r.slotId, i === 0 ? Math.round(price.unitPriceMdl * first.quantity * 100) / 100 : 0));
      continue;
    }
    const weights = g.map((r) => template.components.find((c) => c.role === r.giftSet.role)?.weight ?? 0);
    const shares = splitSetUnitPrice(price.unitPriceMdl, weights);
    g.forEach((r, i) => out.set(r.slotId, Math.round(shares[i]! * first.quantity * 100) / 100));
  }
  return out;
}

/** Wizard row data of a stored set line (edit): one row per file; ready-set rows by zone. */
export function giftSetRowFromLine(
  setGroupId: string,
  data: OrderLineSetData,
  extra: { zoneId?: string; readyVariantId?: string },
): GiftSetRowAssign {
  return {
    groupId: setGroupId,
    templateId: data.templateId,
    role: data.role,
    quantity: data.quantity,
    manualUnitPriceMdl: data.priceSource === "manual" ? data.unitPriceMdl : null,
    ...(extra.zoneId ? { zoneId: extra.zoneId } : {}),
    ...(extra.readyVariantId ? { readyVariantId: extra.readyVariantId } : {}),
  };
}

/** Slot ids of the set a slot belongs to (just the slot when it is not in a set). */
export function giftSetGroupSlotIds(
  slotId: string,
  rows: readonly { slotId: string; giftSet: GiftSetRowAssign | null | undefined }[],
): string[] {
  const gid = rows.find((r) => r.slotId === slotId)?.giftSet?.groupId;
  if (!gid) return [slotId];
  return rows.filter((r) => r.giftSet?.groupId === gid).map((r) => r.slotId);
}

/** The `set` field a set row sends with its order line. */
export function giftSetLineInput(gs: GiftSetRowAssign): {
  groupId: string;
  templateId: string;
  quantity: number;
  role: GiftSetLineRole;
  manualUnitPriceMdl: number | null;
} {
  return {
    groupId: gs.groupId,
    templateId: gs.templateId,
    quantity: gs.quantity,
    role: gs.role,
    manualUnitPriceMdl: gs.manualUnitPriceMdl,
  };
}
