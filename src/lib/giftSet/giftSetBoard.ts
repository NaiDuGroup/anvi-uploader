/**
 * «Набор» on the workshop board — pure: what every set card says besides
 * the badge. A set is packed as one, so each card of the set shows how it
 * is packed («+ коробка 30×23×8,5» / «в коробке набора») and «Закупка» when
 * something the set takes (box, ready set item, a component) was short when
 * the order was saved (`Order.procurementMeta`).
 */
import { procurementMetaToList } from "@/lib/orderProcurement";
import { giftSetExtraStockSkus, giftSetPackNote, parseOrderLineSetData } from "./giftSet";

export interface GiftSetBoardLineIn {
  id: string;
  setGroupId: string | null;
  setData: unknown;
  stockVariantId: string | null;
}

export interface GiftSetBoardFlags {
  packNote: string | null;
  procurement: boolean;
}

/** SKUs whose variant ids {@link giftSetBoardFlags} needs (boxes / ready set items of the sets). */
export function giftSetBoardSkus(lines: readonly GiftSetBoardLineIn[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    if (!l.setGroupId) continue;
    for (const sku of giftSetExtraStockSkus(parseOrderLineSetData(l.setData))) out.add(sku);
  }
  return [...out];
}

/** Variant ids an order's procurement entries name (unified variants, mugs / notebooks / pens). */
export function procurementVariantIds(needsProcurement: boolean, meta: unknown): Set<string> {
  const out = new Set<string>();
  if (!needsProcurement) return out;
  for (const m of procurementMetaToList(meta)) {
    if (m.kind === "stock_variant") out.add(m.variantId);
    else if (m.kind === "mug" || m.kind === "notebook" || m.kind === "pen") out.add(m.productId);
  }
  return out;
}

/** Per set line of one order: pack note + «Закупка» (the whole set is flagged when anything it takes was short). */
export function giftSetBoardFlags(
  lines: readonly GiftSetBoardLineIn[],
  shortVariantIds: ReadonlySet<string>,
  variantIdBySku: ReadonlyMap<string, string>,
): Map<string, GiftSetBoardFlags> {
  const groups = new Map<string, GiftSetBoardLineIn[]>();
  for (const l of lines) {
    if (!l.setGroupId || !parseOrderLineSetData(l.setData)) continue;
    const g = groups.get(l.setGroupId) ?? [];
    g.push(l);
    groups.set(l.setGroupId, g);
  }
  const out = new Map<string, GiftSetBoardFlags>();
  for (const g of groups.values()) {
    const data = g.map((l) => parseOrderLineSetData(l.setData)!);
    const box = data.find((d) => d.boxSku)?.boxSku ?? null;
    const kind = data[0]!.kind;
    const packNote = giftSetPackNote(kind, box);
    const ids = new Set<string>();
    g.forEach((l, k) => {
      if (l.stockVariantId) ids.add(l.stockVariantId);
      for (const sku of giftSetExtraStockSkus(data[k])) {
        const id = variantIdBySku.get(sku);
        if (id) ids.add(id);
      }
    });
    const procurement = [...ids].some((id) => shortVariantIds.has(id));
    for (const l of g) out.set(l.id, { packNote, procurement });
  }
  return out;
}
