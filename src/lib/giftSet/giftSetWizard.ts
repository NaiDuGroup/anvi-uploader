/**
 * «Набор» in the order wizard — pure helpers (the wizard and its tests share them).
 *
 * A set is a group of wizard rows sharing `giftSet.groupId`:
 *  - assembled: one row per component, each a normal pen / notebook / mug
 *    row with its own file; quantity = N sets on every row; the box is a row
 *    of the set too, but derived (no file, no slot): shown under the set's
 *    rows ({@link giftSetBoxRows}) and sent as its own `set_box` line
 *    ({@link withGiftSetBoxLines});
 *  - ready: one row per printed component (thermos / notebook / pen file);
 *    on save each row becomes its own line (`readyZoneLineType`: notebook /
 *    pen / UV client item), the set item is written off once by the server.
 */
import {
  designerProductForCategory,
  printMethodForDesignerProduct,
  type DesignerPrintMethod,
} from "@/lib/printMethods/designerProducts";
import type { UvStockItemJson } from "@/lib/uv/dto";
import {
  GIFT_SET_BOX_LINE_TYPE,
  giftSetBoxName,
  giftSetUnitPrice,
  readyZoneLineType,
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
  /** Never «box»: the box row is derived from the set ({@link giftSetBoxRows}). */
  role: Exclude<GiftSetLineRole, "box">;
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
  role: Exclude<GiftSetLineRole, "box">;
  /** Component / zone label («Кружка», «Термос»). */
  label: string;
  /** Assembled: designer product + its print method + variant. */
  productType: GiftSetRole | "uv_print";
  method: DesignerPrintMethod;
  variantId: string;
  zoneId?: string;
  /** Ready: print size of the zone (cm), for the artwork check. */
  sizeCm?: { widthCm: number; heightCm: number };
  /** Ready: order line type the row becomes on save. */
  lineType?: "notebook" | "pen" | "uv_print";
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
      lineType: readyZoneLineType(z.id),
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

/** Line total of every set row as the server will bill it (the set price split by component / zone weight). */
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
    const weights = g.map((r) =>
      template.kind === "ready"
        ? (template.zones.find((z) => z.id === r.giftSet.zoneId)?.weight ?? 0)
        : (template.components.find((c) => c.role === r.giftSet.role)?.weight ?? 0),
    );
    const shares = splitSetUnitPrice(price.unitPriceMdl, weights);
    g.forEach((r, i) => out.set(r.slotId, Math.round(shares[i]! * first.quantity * 100) / 100));
  }
  return out;
}

/** Wizard row data of a stored set line (edit): one row per file; ready-set rows by zone. */
export function giftSetRowFromLine(
  setGroupId: string,
  data: OrderLineSetData,
  /** Legacy ready set (one UV line): zone from the file tag, variant from the UV item. */
  extra: { zoneId?: string; readyVariantId?: string },
): GiftSetRowAssign {
  const zoneId = data.zoneId ?? extra.zoneId;
  const readyVariantId = data.readyVariantId ?? extra.readyVariantId;
  return {
    groupId: setGroupId,
    templateId: data.templateId,
    // A box line has no file, so it never becomes a row (callers skip it).
    role: data.role === "box" ? "ready" : data.role,
    quantity: data.quantity,
    manualUnitPriceMdl: data.priceSource === "manual" ? data.unitPriceMdl : null,
    ...(zoneId ? { zoneId } : {}),
    ...(readyVariantId ? { readyVariantId } : {}),
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

// ─── The box row ────────────────────────────────────────────────────────────────

/** The box row of one assembled set, shown under the set's last row. */
export interface GiftSetBoxRow {
  groupId: string;
  /** Slot of the set's last row (the box row goes right after it). */
  afterSlotId: string;
  boxSku: string;
  /** «Коробка 30×23×8,5». */
  name: string;
  /** N sets = N boxes. */
  quantity: number;
}

/** Box rows of the wizard's sets (assembled sets whose template has a box), by the slot they follow. */
export function giftSetBoxRows(
  rows: readonly { slotId: string; giftSet: GiftSetRowAssign | null | undefined }[],
  templates: readonly GiftSetTemplate[],
): Map<string, GiftSetBoxRow> {
  const last = new Map<string, { slotId: string; gs: GiftSetRowAssign }>();
  for (const r of rows) if (r.giftSet) last.set(r.giftSet.groupId, { slotId: r.slotId, gs: r.giftSet });
  const out = new Map<string, GiftSetBoxRow>();
  for (const [groupId, { slotId, gs }] of last) {
    const template = templates.find((t) => t.id === gs.templateId);
    if (!template || template.kind !== "assembled" || !template.boxSku) continue;
    out.set(slotId, { groupId, afterSlotId: slotId, boxSku: template.boxSku, name: giftSetBoxName(template.boxSku), quantity: gs.quantity });
  }
  return out;
}

/** The box line of a set as the wizard sends it: no file, N boxes, `set.role` «box». */
export interface GiftSetBoxLineInput {
  productType: typeof GIFT_SET_BOX_LINE_TYPE;
  orderLineId?: string;
  quantity: number;
  customerType?: "retail" | "dealer";
  set: ReturnType<typeof giftSetLineInput>;
  files: never[];
}

/**
 * Lines with each assembled set's box line added right after the set's last
 * line (the set's lines stay together). The box line keeps its stored id
 * (`boxLineIdByGroup`, edit) so the edit does not recreate it.
 */
export function withGiftSetBoxLines<L extends { set?: { groupId: string; templateId: string; quantity: number; role: GiftSetLineRole; manualUnitPriceMdl?: number | null } | undefined; customerType?: "retail" | "dealer" }>(
  lines: readonly L[],
  templates: readonly GiftSetTemplate[],
  boxLineIdByGroup: ReadonlyMap<string, string> = new Map(),
): (L | GiftSetBoxLineInput)[] {
  const lastIndex = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.set && l.set.role !== "box") lastIndex.set(l.set.groupId, i);
  });
  const out: (L | GiftSetBoxLineInput)[] = [];
  lines.forEach((l, i) => {
    if (l.set?.role === "box") return; // rebuilt below
    out.push(l);
    const set = l.set;
    if (!set || lastIndex.get(set.groupId) !== i) return;
    const template = templates.find((t) => t.id === set.templateId);
    if (!template || template.kind !== "assembled" || !template.boxSku) return;
    const id = boxLineIdByGroup.get(set.groupId);
    out.push({
      productType: GIFT_SET_BOX_LINE_TYPE,
      ...(id ? { orderLineId: id } : {}),
      quantity: set.quantity,
      ...(l.customerType ? { customerType: l.customerType } : {}),
      set: {
        groupId: set.groupId,
        templateId: set.templateId,
        quantity: set.quantity,
        role: "box",
        manualUnitPriceMdl: set.manualUnitPriceMdl ?? null,
      },
      files: [],
    });
  });
  return out;
}

/** «Кружка — Кружка цветная внутри и ручка 330 мл», «Ручка — ARDENES»: the component and what its options have in common. */
export function giftSetComponentTitle(
  label: string,
  skuMatch: string,
  items: readonly Pick<UvStockItemJson, "variantLabel" | "itemNames" | "name">[],
): string {
  const names = items.map((i) => i.itemNames.ru?.trim() || i.name);
  const words = names.map((n) => n.split(/\s+/).filter((w) => w && !/^[—–-]$/.test(w)));
  const common =
    words.length > 0 ? words[0]!.filter((w) => words.every((ws) => ws.some((x) => x.toLowerCase() === w.toLowerCase()))).join(" ") : "";
  // The SKU family of the template («ARDENES_*» → «ARDENES»), when the names add nothing.
  const family = skuMatch.split("*")[0]!.replace(/[_\-\s]+$/, "");
  const detail =
    common && common.toLowerCase() !== label.toLowerCase() && items.length > 1
      ? common
      : family.length >= 3
        ? family
        : items.length === 1
          ? names[0]!
          : "";
  return detail ? `${label} — ${detail}` : label;
}

/** The `set` field a set row sends with its order line. */
export function giftSetLineInput(gs: GiftSetRowAssign): {
  groupId: string;
  templateId: string;
  quantity: number;
  role: GiftSetLineRole;
  manualUnitPriceMdl: number | null;
  zoneId?: string;
  readyVariantId?: string;
} {
  return {
    groupId: gs.groupId,
    templateId: gs.templateId,
    quantity: gs.quantity,
    role: gs.role,
    manualUnitPriceMdl: gs.manualUnitPriceMdl,
    ...(gs.role === "ready" && gs.zoneId ? { zoneId: gs.zoneId } : {}),
    ...(gs.role === "ready" && gs.readyVariantId ? { readyVariantId: gs.readyVariantId } : {}),
  };
}

// ─── Stock already in the unsaved order ─────────────────────────────────────────

/** One wizard row as the stock counter sees it. */
export interface GiftSetStockRow {
  slotId: string;
  giftSet: GiftSetRowAssign | null | undefined;
  /** Stock variant the row takes (designer / UV / sublimation stock item), else null. */
  variantId: string | null;
  /** Pieces the row takes. */
  quantity: number;
  /** Row of the saved order being edited: its stock is already off the counts. */
  saved: boolean;
}

/**
 * Units the unsaved order takes beyond the stock counts, per stock variant id
 * and per box SKU (`box:<SKU>`), apart from the set being edited
 * (`excludeGroupId`): the set dialog subtracts them from the stock it shows.
 * New rows count; rows of the saved order are already off the stock, except
 * the edited set's own saved rows, which come back (negative). A ready set
 * takes one set item per set, a set's box one per set (once per group).
 */
export function giftSetReservedStock(
  rows: readonly GiftSetStockRow[],
  templates: readonly GiftSetTemplate[],
  excludeGroupId: string | null,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (key: string, n: number): void => {
    if (n !== 0) out.set(key, (out.get(key) ?? 0) + n);
  };
  const seenGroups = new Set<string>();
  for (const r of rows) {
    const gs = r.giftSet;
    const edited = Boolean(gs && gs.groupId === excludeGroupId);
    // Saved rows: already off the stock; the edited set's own come back.
    const sign = edited ? (r.saved ? -1 : 0) : r.saved ? 0 : 1;
    if (sign === 0) continue;
    if (gs?.role !== "ready" && r.variantId) add(r.variantId, sign * r.quantity);
    if (gs && !seenGroups.has(gs.groupId)) {
      seenGroups.add(gs.groupId);
      if (gs.role === "ready" && gs.readyVariantId) add(gs.readyVariantId, sign * gs.quantity);
      const box = templates.find((t) => t.id === gs.templateId)?.boxSku;
      if (box) add(`box:${box}`, sign * gs.quantity);
    }
  }
  return out;
}

// ─── Swatches and short names ───────────────────────────────────────────────────

/** Colour words (Russian stems, then a few Romanian / English) → swatch colour. Order matters: «серебр» before «сер». */
const COLOUR_WORDS: readonly [RegExp, string][] = [
  [/(^|[^а-яё])(бел)/i, "#ffffff"],
  [/(^|[^а-яё])(ч[её]рн)/i, "#1f1f1f"],
  [/(^|[^а-яё])(серебр)/i, "#c0c0c0"],
  [/(^|[^а-яё])(сер[ыао])/i, "#9ca3af"],
  [/(^|[^а-яё])(голуб)/i, "#38bdf8"],
  [/(^|[^а-яё])(син)/i, "#1d4ed8"],
  [/(^|[^а-яё])(красн)/i, "#dc2626"],
  [/(^|[^а-яё])(бордо|бордов)/i, "#7f1d1d"],
  [/(^|[^а-яё])(зел[её]н)/i, "#16a34a"],
  [/(^|[^а-яё])(бирюз)/i, "#14b8a6"],
  [/(^|[^а-яё])(ж[её]лт)/i, "#facc15"],
  [/(^|[^а-яё])(оранж)/i, "#f97316"],
  [/(^|[^а-яё])(розов)/i, "#f472b6"],
  [/(^|[^а-яё])(золот)/i, "#c9a227"],
  [/(^|[^а-яё])(фиолет|сиренев)/i, "#7c3aed"],
  [/(^|[^а-яё])(коричн)/i, "#7c4a2d"],
  [/\b(white|alb)/i, "#ffffff"],
  [/\b(black|negru|neagr)/i, "#1f1f1f"],
  [/\b(blue|albastr)/i, "#1d4ed8"],
  [/\b(red|roșu|rosu)/i, "#dc2626"],
  [/\b(green|verde)/i, "#16a34a"],
  [/\b(yellow|galben)/i, "#facc15"],
  [/\b(gold|auriu)/i, "#c9a227"],
  [/\b(grey|gray|gri)\b/i, "#9ca3af"],
  [/\b(pink|roz)\b/i, "#f472b6"],
  [/\b(orange|portocaliu)/i, "#f97316"],
];

/** Swatch colour named in a text («Ручка синяя» → blue), or null. */
export function colourFromName(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, hex] of COLOUR_WORDS) if (re.test(text)) return hex;
  return null;
}

function hexSaturation(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Swatch of a stock variant in the set dialog. A real colour (a chromatic
 * `colorHex`, e.g. a notebook cover) wins; a neutral one (white mug body,
 * the default black pen body) gives way to the colour in the name («Кружка
 * … — красная», «Ручка белая»), else the hex, else light grey.
 */
export function giftSetSwatchHex(item: Pick<UvStockItemJson, "colorHex" | "variantLabel" | "itemNames" | "name">): string {
  const hex = item.colorHex && /^#[0-9a-f]{6}$/i.test(item.colorHex) ? item.colorHex : null;
  if (hex && (hexSaturation(hex) ?? 0) > 0.25) return hex;
  const named = colourFromName(item.variantLabel) ?? colourFromName(item.itemNames.ru) ?? colourFromName(item.name);
  return named ?? hex ?? "#e5e7eb";
}

/**
 * Short option names for one picker: the variant label, else the item name
 * without the words every option shares («Кружка цветная внутри и ручка
 * 330 мл — красная» → «красная», «Ручка синяя» → «синяя»).
 */
export function giftSetShortNames(
  items: readonly Pick<UvStockItemJson, "id" | "variantLabel" | "itemNames" | "name">[],
): Map<string, string> {
  const full = items.map((i) => i.variantLabel?.trim() || i.itemNames.ru?.trim() || i.name);
  const words = full.map((f) => f.split(/\s+/).filter(Boolean));
  const common =
    items.length > 1
      ? new Set(words[0]!.map((w) => w.toLowerCase()).filter((w) => words.every((ws) => ws.some((x) => x.toLowerCase() === w))))
      : new Set<string>();
  const out = new Map<string, string>();
  items.forEach((it, k) => {
    const rest = words[k]!.filter((w) => !common.has(w.toLowerCase()) && !/^[—–-]$/.test(w)).join(" ");
    out.set(it.id, rest || full[k]!);
  });
  return out;
}
