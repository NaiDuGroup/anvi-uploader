/**
 * «Набор» (gift set) — pure logic shared by the server and the order wizard.
 *
 * Two kinds of set:
 *  - **assembled** (A «Ручка + блокнот + кружка», B «Ручка + блокнот»): put
 *    together in-house from stock. The order gets one normal line per
 *    component (pen / notebook / mug — each with its own file, layout check,
 *    stock write-off and workshop card), linked by `OrderLine.setGroupId`.
 *    The set's fixed price is split across the lines (`splitSetUnitPrice`) so
 *    the lines add up to price × N exactly; the box is written off once per
 *    set on the group's first line.
 *  - **ready** (C «Ручка + блокнот + термос», bought in as one product with
 *    colour variants): one order line per printed component (zone), like
 *    A/B — notebook → `notebook` line, pen → `pen` line (both «другой»
 *    item, not our stock), anything else (thermos) → `uv_print` client-item
 *    line with one zone. Each has its own file, layout check and workshop
 *    card in its normal section. The set price is split across the lines by
 *    zone weight; the set item (one colour variant) is written off once per
 *    set on the group's first line (`setItemSku`), like the box of A/B.
 *    Orders saved before 2026-11-08 kept C as ONE `uv_print` line on the set
 *    item (role «ready», no `zoneId`): read-only compat in display.
 *
 * Templates («Шаблоны наборов») live in `AccountingSettings.giftSetTemplates`;
 * null = {@link DEFAULT_GIFT_SET_TEMPLATES}.
 */

export const GIFT_SET_KINDS = ["assembled", "ready"] as const;
export type GiftSetKind = (typeof GIFT_SET_KINDS)[number];

export const GIFT_SET_ROLES = ["pen", "notebook", "mug"] as const;
export type GiftSetRole = (typeof GIFT_SET_ROLES)[number];

/** Role of one order line in a set: a component line, or the one line of a ready set. */
export type GiftSetLineRole = GiftSetRole | "ready";

export const GIFT_SET_MAX_QUANTITY = 9999;
export const GIFT_SET_MAX_TEMPLATES = 30;

/** One stock product of an assembled set (one order line per component). */
export interface GiftSetComponent {
  role: GiftSetRole;
  /** Shown in the wizard / board («Ручка»). */
  label: string;
  /** Stock variants offered for it: SKU glob, `*` = anything («ARDENES_*», «S3-*-A5»). Empty = every variant of the role. */
  skuMatch: string;
  /** Share of the set price this line carries (relative; the retail prices 100 / 189 / 160 by default). */
  weight: number;
}

/** One printed component of a ready set (one UV zone and one file each). */
export interface GiftSetZone {
  /** Zone id (`uv:<id>` on the file), letters / digits / `_`. */
  id: string;
  label: string;
  /** Print size, cm (the artwork is checked against it). */
  widthCm: number;
  heightCm: number;
  /** Share of the set price this line carries (relative). */
  weight: number;
}

/** Order line type of a ready set's zone: notebook / pen lines go to their own board sections, the rest is UV. */
export type GiftSetZoneLineType = "notebook" | "pen" | "uv_print";

export function readyZoneLineType(zoneId: string): GiftSetZoneLineType {
  return zoneId === "notebook" ? "notebook" : zoneId === "pen" ? "pen" : "uv_print";
}

/** Default price weight of a ready-set zone (thermos 311 + notebook 189 + pen 100 = 600). */
export function defaultZoneWeight(zoneId: string): number {
  return zoneId === "thermos" ? 311 : zoneId === "notebook" ? 189 : 100;
}

/** DPI the set's artwork is checked / printed at (the same as our notebooks and pens). */
export const GIFT_SET_PRINT_DPI = 300;

export interface GiftSetTemplate {
  /** Stable id, letters / digits / `_` / `-` (kept on order lines). */
  id: string;
  name: string;
  kind: GiftSetKind;
  active: boolean;
  /** Price of one set, MDL. */
  retailPriceMdl: number;
  /** Dealer price of one set; null → the retail price (settings warn). */
  dealerPriceMdl: number | null;
  /** Assembled: SKU of the box variant written off once per set (null = no box). */
  boxSku: string | null;
  /** Assembled: one line per component, each role at most once. */
  components: GiftSetComponent[];
  /** Ready: SKU of the set's stock item (its variants = colours). */
  readyItemSku: string | null;
  /** Ready: printed components (UV zones). */
  zones: GiftSetZone[];
}

/** SKU of the bought-in thermos set item (created from «Шаблоны наборов» or the script). */
export const READY_THERMOS_SET_ITEM_SKU = "GIFT-SET-THERMOS";

/** Colours of the thermos set (variant SKU suffix, label, hex). */
export const READY_THERMOS_SET_COLOURS: readonly { code: string; label: string; hex: string }[] = [
  { code: "BLACK", label: "чёрный", hex: "#1f2937" },
  { code: "BLUE", label: "синий", hex: "#1d4ed8" },
  { code: "GOLD", label: "золотой", hex: "#c9a227" },
  { code: "GREY", label: "серый", hex: "#9ca3af" },
  { code: "GREEN", label: "зелёный", hex: "#15803d" },
  { code: "RED", label: "красный", hex: "#b91c1c" },
];

export const DEFAULT_GIFT_SET_TEMPLATES: readonly GiftSetTemplate[] = [
  {
    id: "pen_notebook_mug",
    name: "Ручка + блокнот + кружка",
    kind: "assembled",
    active: true,
    retailPriceMdl: 449,
    dealerPriceMdl: null,
    boxSku: "EW-BOX-300X230X85",
    components: [
      { role: "mug", label: "Кружка", skuMatch: "S3-K*-3*", weight: 160 },
      { role: "notebook", label: "Блокнот", skuMatch: "S3-*-A5", weight: 189 },
      { role: "pen", label: "Ручка", skuMatch: "ARDENES_*", weight: 100 },
    ],
    readyItemSku: null,
    zones: [],
  },
  {
    id: "pen_notebook",
    name: "Ручка + блокнот",
    kind: "assembled",
    active: true,
    retailPriceMdl: 299,
    dealerPriceMdl: null,
    boxSku: "EW-BOX-215X200X30",
    components: [
      { role: "notebook", label: "Блокнот", skuMatch: "S3-*-A5", weight: 189 },
      { role: "pen", label: "Ручка", skuMatch: "ARDENES_*", weight: 100 },
    ],
    readyItemSku: null,
    zones: [],
  },
  {
    id: "pen_notebook_thermos",
    name: "Ручка + блокнот + термос",
    kind: "ready",
    active: true,
    retailPriceMdl: 600,
    dealerPriceMdl: null,
    boxSku: null,
    components: [],
    readyItemSku: READY_THERMOS_SET_ITEM_SKU,
    zones: [
      { id: "thermos", label: "Термос", widthCm: 17, heightCm: 2.5, weight: 311 },
      { id: "notebook", label: "Блокнот", widthCm: 14.5, heightCm: 21, weight: 189 },
      { id: "pen", label: "Ручка", widthCm: 5, heightCm: 0.6, weight: 100 },
    ],
  },
];

// ─── Parsing / validation ───────────────────────────────────────────────────────

const ID_RE = /^[a-z0-9_-]{1,60}$/i;
const ZONE_ID_RE = /^[a-z0-9_]{1,30}$/i;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type GiftSetTemplateIssue =
  | "id_invalid"
  | "id_duplicate"
  | "name_required"
  | "kind_invalid"
  | "retail_price_invalid"
  | "dealer_price_invalid"
  | "components_required"
  | "component_role_duplicate"
  | "component_weight_invalid"
  | "ready_item_required"
  | "zones_required"
  | "zone_invalid"
  | "zone_id_duplicate"
  | "too_many_templates";

export interface GiftSetTemplateError {
  index: number;
  issue: GiftSetTemplateIssue;
}

/**
 * Validates and normalises the templates an admin saves. Returns the cleaned
 * list, or the first problem per template.
 */
export function validateGiftSetTemplates(
  raw: unknown,
): { ok: true; templates: GiftSetTemplate[] } | { ok: false; errors: GiftSetTemplateError[] } {
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const errors: GiftSetTemplateError[] = [];
  if (list.length > GIFT_SET_MAX_TEMPLATES) return { ok: false, errors: [{ index: -1, issue: "too_many_templates" }] };
  const seen = new Set<string>();
  const out: GiftSetTemplate[] = [];
  list.forEach((item, index) => {
    const o = (item != null && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const fail = (issue: GiftSetTemplateIssue): void => {
      errors.push({ index, issue });
    };
    const id = str(o.id, 60);
    if (!ID_RE.test(id)) return fail("id_invalid");
    if (seen.has(id)) return fail("id_duplicate");
    seen.add(id);
    const name = str(o.name, 120);
    if (!name) return fail("name_required");
    const kind = o.kind;
    if (kind !== "assembled" && kind !== "ready") return fail("kind_invalid");
    const retail = num(o.retailPriceMdl);
    if (retail == null || !(retail > 0) || retail > 999_999) return fail("retail_price_invalid");
    const dealerRaw = o.dealerPriceMdl;
    const dealer = dealerRaw == null || dealerRaw === "" ? null : num(dealerRaw);
    if (dealerRaw != null && dealerRaw !== "" && (dealer == null || !(dealer > 0) || dealer > 999_999)) {
      return fail("dealer_price_invalid");
    }
    const t: GiftSetTemplate = {
      id,
      name,
      kind,
      active: o.active !== false,
      retailPriceMdl: round2(retail),
      dealerPriceMdl: dealer == null ? null : round2(dealer),
      boxSku: null,
      components: [],
      readyItemSku: null,
      zones: [],
    };
    if (kind === "assembled") {
      t.boxSku = str(o.boxSku, 80) || null;
      const comps: unknown[] = Array.isArray(o.components) ? o.components : [];
      const roles = new Set<string>();
      for (const c of comps) {
        const co = (c != null && typeof c === "object" ? c : {}) as Record<string, unknown>;
        const role = co.role;
        if (!GIFT_SET_ROLES.includes(role as GiftSetRole)) continue;
        if (roles.has(role as string)) return fail("component_role_duplicate");
        roles.add(role as string);
        const weight = num(co.weight);
        if (weight == null || !(weight > 0)) return fail("component_weight_invalid");
        t.components.push({
          role: role as GiftSetRole,
          label: str(co.label, 60) || defaultRoleLabel(role as GiftSetRole),
          skuMatch: str(co.skuMatch, 80),
          weight,
        });
      }
      if (t.components.length === 0) return fail("components_required");
    } else {
      t.readyItemSku = str(o.readyItemSku, 80) || null;
      if (!t.readyItemSku) return fail("ready_item_required");
      const zones: unknown[] = Array.isArray(o.zones) ? o.zones : [];
      const ids = new Set<string>();
      for (const z of zones) {
        const zo = (z != null && typeof z === "object" ? z : {}) as Record<string, unknown>;
        const zid = str(zo.id, 30);
        const w = num(zo.widthCm);
        const h = num(zo.heightCm);
        const label = str(zo.label, 60);
        if (!ZONE_ID_RE.test(zid) || !label || w == null || h == null || !(w > 0) || !(h > 0) || w > 200 || h > 200) {
          return fail("zone_invalid");
        }
        if (ids.has(zid)) return fail("zone_id_duplicate");
        ids.add(zid);
        const zw = num(zo.weight);
        if (zo.weight != null && zo.weight !== "" && (zw == null || !(zw > 0))) return fail("component_weight_invalid");
        t.zones.push({ id: zid, label, widthCm: w, heightCm: h, weight: zw != null && zw > 0 ? zw : defaultZoneWeight(zid) });
      }
      if (t.zones.length === 0) return fail("zones_required");
    }
    out.push(t);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, templates: out };
}

/** Stored templates (null / broken → the defaults; broken entries are dropped). */
export function parseGiftSetTemplates(raw: unknown): GiftSetTemplate[] {
  if (!Array.isArray(raw)) return DEFAULT_GIFT_SET_TEMPLATES.map((t) => structuredClone(t));
  const res = validateGiftSetTemplates(raw);
  if (res.ok) return res.templates;
  const bad = new Set(res.errors.map((e) => e.index));
  const kept = validateGiftSetTemplates(raw.filter((_, i) => !bad.has(i)));
  return kept.ok ? kept.templates : [];
}

export function defaultRoleLabel(role: GiftSetRole): string {
  return role === "pen" ? "Ручка" : role === "notebook" ? "Блокнот" : "Кружка";
}

/** Templates whose dealer price is not set (dealers pay retail): warned in settings. */
export function templatesWithoutDealerPrice(templates: readonly GiftSetTemplate[]): GiftSetTemplate[] {
  return templates.filter((t) => t.active && t.dealerPriceMdl == null);
}

/** SKU glob match, case-insensitive; `*` = any run of characters; empty pattern matches all. */
export function skuMatches(pattern: string, sku: string): boolean {
  const p = pattern.trim();
  if (!p) return true;
  const re = new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
  return re.test(sku);
}

// ─── Price ──────────────────────────────────────────────────────────────────────

export type GiftSetCustomerType = "retail" | "dealer";
export type GiftSetPriceSource = "retail" | "dealer" | "manual";

/** Price of one set: staff manual price, else the dealer price for dealers (retail when unset), else retail. */
export function giftSetUnitPrice(
  template: Pick<GiftSetTemplate, "retailPriceMdl" | "dealerPriceMdl">,
  customerType: GiftSetCustomerType,
  manualUnitPriceMdl?: number | null,
): { unitPriceMdl: number; source: GiftSetPriceSource } {
  if (manualUnitPriceMdl != null && Number.isFinite(manualUnitPriceMdl) && manualUnitPriceMdl > 0) {
    return { unitPriceMdl: round2(manualUnitPriceMdl), source: "manual" };
  }
  if (customerType === "dealer" && template.dealerPriceMdl != null) {
    return { unitPriceMdl: template.dealerPriceMdl, source: "dealer" };
  }
  return { unitPriceMdl: template.retailPriceMdl, source: "retail" };
}

/**
 * Splits the price of one set across its lines by weight so the shares add
 * up to the price exactly: whole lei when the price is whole (pens are billed
 * in whole lei), else bani. The rounding remainder goes to the heaviest line.
 */
export function splitSetUnitPrice(unitPriceMdl: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const step = Number.isInteger(unitPriceMdl) ? 1 : 0.01;
  const totalSteps = Math.round(unitPriceMdl / step);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumW = w.reduce((s, x) => s + x, 0);
  const norm = sumW > 0 ? w : w.map(() => 1);
  const normSum = sumW > 0 ? sumW : w.length;
  const steps = norm.map((x) => Math.floor((totalSteps * x) / normSum));
  let rest = totalSteps - steps.reduce((s, x) => s + x, 0);
  // Largest weight first, then the earlier line.
  const order = norm.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) steps[order[k]!.i]! += 1;
  return steps.map((s) => (step === 1 ? s : round2(s * step)));
}

// ─── Order lines ───────────────────────────────────────────────────────────────

/** What a request line says about its set (`AdminOrderLineInput.set`). */
export interface GiftSetLineInput {
  groupId: string;
  templateId: string;
  quantity: number;
  role: GiftSetLineRole;
  /** Staff only: price of one set instead of the template's (stripped / ignored for dealers). */
  manualUnitPriceMdl?: number | null;
  /** Ready set: the zone (component) this line prints. */
  zoneId?: string | null;
  /** Ready set: colour variant of the set item (`StockVariant.id`), the same on every line of the set. */
  readyVariantId?: string | null;
}

/** Persisted in `OrderLine.setData`. */
export interface OrderLineSetData {
  version: 1;
  templateId: string;
  /** Template name when the order was priced («Ручка + блокнот + кружка»). */
  name: string;
  kind: GiftSetKind;
  role: GiftSetLineRole;
  /** Component label («Ручка»); null on a ready-set line. */
  roleLabel: string | null;
  /** Number of sets. */
  quantity: number;
  customerType: GiftSetCustomerType;
  /** Price of one set. */
  unitPriceMdl: number;
  priceSource: GiftSetPriceSource;
  /** This line's share of one set's price. */
  lineUnitPriceMdl: number;
  /** This line's total (share × quantity). */
  lineTotalMdl: number;
  /** Box written off with this line (the group's first line of an assembled set), else null. */
  boxSku: string | null;
  /** Ready set: the set item's colour variant written off with this line (the group's first line), else null. */
  setItemSku?: string | null;
  /** Ready set: the zone this line prints («thermos» / «notebook» / «pen»). */
  zoneId?: string;
  /** Ready set: colour variant id + label of the set item (every line of the set). */
  readyVariantId?: string;
  readyColourLabel?: string;
  /** Legacy ready set (one UV line for the whole set, before 2026-11-08): zone ids in file order. */
  zoneIds?: string[];
}

/** One request line as the planner sees it. */
export interface GiftSetPlanLine {
  productType: string;
  set: GiftSetLineInput | null | undefined;
  /** Pieces the line bills (sum of file copies; UV: its quantity). */
  quantity: number;
  customerType: GiftSetCustomerType;
  /** Ready set: SKU of the stock item the set's colour variant belongs to. */
  readyItemSku?: string | null;
  /** Ready set: SKU + colour label of the set's colour variant. */
  readyVariantSku?: string | null;
  readyColourLabel?: string | null;
  /** Mug / notebook / pen picked as «другой …» (not a stock item). */
  otherItem?: boolean;
}

export type GiftSetPlanErrorCode =
  | "gift_set_template_unknown"
  | "gift_set_components_mismatch"
  | "gift_set_quantity_mismatch"
  | "gift_set_line_type_mismatch"
  | "gift_set_item_mismatch"
  | "gift_set_other_item";

export type GiftSetPlan =
  | { ok: true; byLine: Map<number, { groupId: string; data: OrderLineSetData }> }
  | { ok: false; code: GiftSetPlanErrorCode; groupId: string };

/**
 * Checks every set group of an order's lines against its template and prices
 * it: per line the set data (share of the set price, total, box). Lines with
 * no `set` are left out.
 */
export function planGiftSets(
  lines: readonly GiftSetPlanLine[],
  templates: readonly GiftSetTemplate[],
  opts: { allowManualPrice: boolean },
): GiftSetPlan {
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (!l.set) return;
    const g = groups.get(l.set.groupId);
    if (g) g.push(i);
    else groups.set(l.set.groupId, [i]);
  });
  const byLine = new Map<number, { groupId: string; data: OrderLineSetData }>();
  for (const [groupId, idx] of groups) {
    const first = lines[idx[0]!]!;
    const set = first.set!;
    const template = templates.find((t) => t.id === set.templateId);
    if (!template) return { ok: false, code: "gift_set_template_unknown", groupId };
    const quantity = set.quantity;
    if (idx.some((i) => lines[i]!.set!.templateId !== template.id)) {
      return { ok: false, code: "gift_set_components_mismatch", groupId };
    }
    if (idx.some((i) => lines[i]!.set!.quantity !== quantity || lines[i]!.quantity !== quantity)) {
      return { ok: false, code: "gift_set_quantity_mismatch", groupId };
    }
    const customerType = first.customerType;
    const manual = opts.allowManualPrice ? (idx.map((i) => lines[i]!.set!.manualUnitPriceMdl).find((m) => m != null) ?? null) : null;
    const price = giftSetUnitPrice(template, customerType, manual);
    const base = {
      version: 1 as const,
      templateId: template.id,
      name: template.name,
      kind: template.kind,
      quantity,
      customerType,
      unitPriceMdl: price.unitPriceMdl,
      priceSource: price.source,
    };

    if (template.kind === "ready") {
      // One line per zone, each of its zone's line type; one colour for the set.
      const zoneIds = idx.map((i) => lines[i]!.set!.zoneId ?? "");
      const wantedZones = template.zones.map((z) => z.id);
      if (
        zoneIds.length !== wantedZones.length ||
        wantedZones.some((z) => !zoneIds.includes(z)) ||
        new Set(zoneIds).size !== zoneIds.length ||
        idx.some((i) => lines[i]!.set!.role !== "ready")
      ) {
        return { ok: false, code: "gift_set_components_mismatch", groupId };
      }
      for (const i of idx) {
        const l = lines[i]!;
        if (l.productType !== readyZoneLineType(l.set!.zoneId!)) return { ok: false, code: "gift_set_line_type_mismatch", groupId };
        // The set's notebook / pen come with the set: never one of our stock items.
        if (l.productType !== "uv_print" && !l.otherItem) return { ok: false, code: "gift_set_item_mismatch", groupId };
      }
      const variantId = first.set!.readyVariantId ?? null;
      if (
        !variantId ||
        idx.some((i) => (lines[i]!.set!.readyVariantId ?? null) !== variantId) ||
        !first.readyItemSku ||
        first.readyItemSku.toUpperCase() !== (template.readyItemSku ?? "").toUpperCase()
      ) {
        return { ok: false, code: "gift_set_item_mismatch", groupId };
      }
      const zones = idx.map((i) => template.zones.find((z) => z.id === lines[i]!.set!.zoneId)!);
      const shares = splitSetUnitPrice(price.unitPriceMdl, zones.map((z) => z.weight));
      idx.forEach((lineIndex, k) => {
        byLine.set(lineIndex, {
          groupId,
          data: {
            ...base,
            role: "ready",
            roleLabel: zones[k]!.label,
            lineUnitPriceMdl: shares[k]!,
            lineTotalMdl: round2(shares[k]! * quantity),
            boxSku: k === 0 ? template.boxSku : null,
            // The set item (one colour variant) goes with the group's first line, once per set.
            setItemSku: k === 0 ? (first.readyVariantSku ?? null) : null,
            zoneId: zones[k]!.id,
            readyVariantId: variantId,
            ...(first.readyColourLabel ? { readyColourLabel: first.readyColourLabel } : {}),
          },
        });
      });
      continue;
    }

    // Assembled: one line per component, each line of its component's type.
    const roles = idx.map((i) => lines[i]!.set!.role);
    const wanted = template.components.map((c) => c.role);
    if (roles.length !== wanted.length || wanted.some((r) => !roles.includes(r)) || new Set(roles).size !== roles.length) {
      return { ok: false, code: "gift_set_components_mismatch", groupId };
    }
    for (const i of idx) {
      const l = lines[i]!;
      if (l.productType !== l.set!.role) return { ok: false, code: "gift_set_line_type_mismatch", groupId };
      if (l.otherItem) return { ok: false, code: "gift_set_other_item", groupId };
    }
    const comps = idx.map((i) => template.components.find((c) => c.role === lines[i]!.set!.role)!);
    const shares = splitSetUnitPrice(price.unitPriceMdl, comps.map((c) => c.weight));
    idx.forEach((lineIndex, k) => {
      byLine.set(lineIndex, {
        groupId,
        data: {
          ...base,
          role: comps[k]!.role,
          roleLabel: comps[k]!.label,
          lineUnitPriceMdl: shares[k]!,
          lineTotalMdl: round2(shares[k]! * quantity),
          // The box goes with the group's first line, once per set.
          boxSku: k === 0 ? template.boxSku : null,
        },
      });
    });
  }
  return { ok: true, byLine };
}

/** SKUs a set line takes from stock apart from its own item: the box (A/B) and / or the ready set item (C). */
export function giftSetExtraStockSkus(d: Pick<OrderLineSetData, "boxSku" | "setItemSku"> | null | undefined): string[] {
  if (!d) return [];
  return [d.boxSku, d.setItemSku ?? null].filter((s): s is string => Boolean(s));
}

/** Stock taken for the sets of an order apart from the lines' own items: boxes / ready set items by SKU, N per set. */
export function giftSetBoxWriteOffs(
  data: readonly (Pick<OrderLineSetData, "boxSku" | "setItemSku" | "quantity"> | null | undefined)[],
): { sku: string; quantity: number }[] {
  const by = new Map<string, number>();
  for (const d of data) {
    if (!d || !(d.quantity > 0)) continue;
    for (const sku of giftSetExtraStockSkus(d)) by.set(sku, (by.get(sku) ?? 0) + d.quantity);
  }
  return [...by.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

/** Legacy ready set: the whole set on one UV line (orders before 2026-11-08). */
export function isLegacyReadySetLine(d: Pick<OrderLineSetData, "role" | "zoneId"> | null | undefined): boolean {
  return d?.role === "ready" && !d.zoneId;
}

/** Stored `OrderLine.setData`, or null. */
export function parseOrderLineSetData(raw: unknown): OrderLineSetData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.templateId !== "string" || typeof o.name !== "string") return null;
  const quantity = num(o.quantity);
  if (quantity == null || quantity < 1) return null;
  const role = o.role;
  if (role !== "ready" && !GIFT_SET_ROLES.includes(role as GiftSetRole)) return null;
  return {
    version: 1,
    templateId: o.templateId,
    name: o.name,
    kind: o.kind === "ready" ? "ready" : "assembled",
    role: role as GiftSetLineRole,
    roleLabel: typeof o.roleLabel === "string" ? o.roleLabel : null,
    quantity,
    customerType: o.customerType === "dealer" ? "dealer" : "retail",
    unitPriceMdl: num(o.unitPriceMdl) ?? 0,
    priceSource: o.priceSource === "dealer" || o.priceSource === "manual" ? o.priceSource : "retail",
    lineUnitPriceMdl: num(o.lineUnitPriceMdl) ?? 0,
    lineTotalMdl: num(o.lineTotalMdl) ?? 0,
    boxSku: typeof o.boxSku === "string" && o.boxSku ? o.boxSku : null,
    ...(typeof o.setItemSku === "string" && o.setItemSku ? { setItemSku: o.setItemSku } : {}),
    ...(typeof o.zoneId === "string" && o.zoneId ? { zoneId: o.zoneId } : {}),
    ...(typeof o.readyVariantId === "string" && o.readyVariantId ? { readyVariantId: o.readyVariantId } : {}),
    ...(typeof o.readyColourLabel === "string" && o.readyColourLabel ? { readyColourLabel: o.readyColourLabel } : {}),
    ...(Array.isArray(o.zoneIds) ? { zoneIds: o.zoneIds.filter((z): z is string => typeof z === "string") } : {}),
  };
}

/** «Набор: Ручка + блокнот + кружка ×3». */
export function giftSetBadgeLabel(d: Pick<OrderLineSetData, "name" | "quantity">): string {
  return `Набор: ${d.name} ×${d.quantity}`;
}

/** «30×23×8,5» from a box SKU in millimetres («EW-BOX-300X230X85»); null when the SKU has no size. */
export function boxSizeFromSku(sku: string): string | null {
  const m = /(\d{2,4})X(\d{2,4})(?:X(\d{1,4}))?/i.exec(sku);
  if (!m) return null;
  const cm = (mm: string): string => String(Math.round(Number(mm)) / 10).replace(".", ",");
  return [m[1], m[2], m[3]].filter((x): x is string => Boolean(x)).map(cm).join("×");
}

/**
 * Packing note of a set on the workshop board: «+ коробка 30×23×8,5» (A/B,
 * the template's box), «в коробке набора» (C, the bought-in set comes in its
 * own box), null without a box.
 */
export function giftSetPackNote(kind: GiftSetKind, boxSku: string | null): string | null {
  if (kind === "ready") return "в коробке набора";
  if (!boxSku) return null;
  return `+ коробка ${boxSizeFromSku(boxSku) ?? boxSku}`;
}
