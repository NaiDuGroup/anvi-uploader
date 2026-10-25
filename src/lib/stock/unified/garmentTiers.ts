import type { GarmentKind } from "@/lib/dtf/dtfConstants";
import {
  defaultPriceTiers,
  garmentPriceTiersSchema,
  sortTiers,
  type GarmentPriceTier,
} from "@/lib/dtf/garmentPriceTiers";
import { variantGridKey, type VariantOptions } from "./variantGrid";

/**
 * Run-size prices («тиражные цены») of DTF-printable stock variants: editor
 * rows ↔ `StockVariant.priceTiers`, white detection for the price-list
 * defaults. Pure and client-safe.
 */

/** One editable row: «от N шт → цена». Strings as typed. */
export type TierDraft = { minQty: string; priceMdl: string };

export type TierParseError = "invalid" | "duplicate_qty" | "need_single_piece" | "too_many";

export type TierParseResult = { ok: true; tiers: GarmentPriceTier[] | null } | { ok: false; error: TierParseError };

/** «280» / «262.5» — no trailing zeros, so the compact inputs stay readable. */
export function formatTierPrice(price: number): string {
  return String(Math.round(price * 100) / 100);
}

export function tiersToDrafts(tiers: readonly GarmentPriceTier[] | null | undefined): TierDraft[] {
  return sortTiers(tiers ?? []).map((t) => ({ minQty: String(t.minQty), priceMdl: formatTierPrice(t.priceMdl) }));
}

/**
 * Editor rows → tiers. Fully empty rows are ignored; no rows left → `null`
 * (clears the prices). A half-filled row or a bad number is `invalid`.
 */
export function draftsToTiers(drafts: readonly TierDraft[]): TierParseResult {
  const tiers: GarmentPriceTier[] = [];
  for (const d of drafts) {
    const qtyRaw: string = d.minQty.trim();
    const priceRaw: string = d.priceMdl.trim().replace(",", ".");
    if (!qtyRaw && !priceRaw) continue;
    if (!/^\d+$/.test(qtyRaw) || !/^\d+(\.\d{1,2})?$/.test(priceRaw)) return { ok: false, error: "invalid" };
    const minQty: number = Number.parseInt(qtyRaw, 10);
    const priceMdl: number = Number.parseFloat(priceRaw);
    if (minQty < 1) return { ok: false, error: "invalid" };
    tiers.push({ minQty, priceMdl });
  }
  if (tiers.length === 0) return { ok: true, tiers: null };
  const parsed = garmentPriceTiersSchema.safeParse(tiers);
  if (!parsed.success) {
    const messages: string[] = parsed.error.issues.map((i) => i.message);
    if (messages.includes("dtf_tiers_duplicate_qty")) return { ok: false, error: "duplicate_qty" };
    if (messages.includes("dtf_tiers_need_single_piece")) return { ok: false, error: "need_single_piece" };
    if (parsed.error.issues.some((i) => i.code === "too_big" && i.path.length === 0)) {
      return { ok: false, error: "too_many" };
    }
    return { ok: false, error: "invalid" };
  }
  return { ok: true, tiers: sortTiers(parsed.data) };
}

/** Price per piece for a single printed piece (the «от 1» row). */
export function singlePiecePrice(tiers: readonly GarmentPriceTier[] | null | undefined): number | null {
  return tiers?.find((t) => t.minQty === 1)?.priceMdl ?? null;
}

export function sameTiers(
  a: readonly GarmentPriceTier[] | null | undefined,
  b: readonly GarmentPriceTier[] | null | undefined,
): boolean {
  const x: GarmentPriceTier[] = sortTiers(a ?? []);
  const y: GarmentPriceTier[] = sortTiers(b ?? []);
  return x.length === y.length && x.every((t, i) => t.minQty === y[i].minQty && t.priceMdl === y[i].priceMdl);
}

const WHITE_NAME = /(^|[^\p{L}])(white|alb|alba|albă|бел\p{L}*)($|[^\p{L}])/iu;

/**
 * White garments take the low end of the studio price list. True when the
 * colour name says white (en / ro / ru) or the swatch is near-white.
 */
export function isWhiteColor(name: string | null | undefined, hex: string | null | undefined): boolean {
  if (name && WHITE_NAME.test(name.trim())) return true;
  const m: RegExpMatchArray | null = (hex ?? "").trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  return m.slice(1, 4).every((part) => Number.parseInt(part, 16) >= 0xf0);
}

/** Price-list family for a DTF category, from its code (unknown codes → «other», t-shirt prices). */
export function garmentKindForCategoryCode(code: string): GarmentKind {
  const c: string = code.trim().toLowerCase();
  if (/^(tshirts?|t-shirts?|maiki|tricouri)$/.test(c)) return "tshirt";
  if (/^polos?$/.test(c)) return "polo";
  if (/^(bodysuits?|body)$/.test(c)) return "bodysuit";
  if (/^socks?$/.test(c)) return "socks";
  if (/^caps?$/.test(c)) return "cap";
  if (/^hoodies?$/.test(c)) return "hoodie";
  if (/^bags?$/.test(c)) return "bag";
  if (/^underwear$/.test(c)) return "underwear";
  return "other";
}

/** Studio price-list defaults for one colour of an item in a DTF category. */
export function defaultTierDrafts(categoryCode: string, color: { name?: string; hex?: string }): TierDraft[] {
  return tiersToDrafts(defaultPriceTiers(garmentKindForCategoryCode(categoryCode), isWhiteColor(color.name, color.hex)));
}

/** Tier groups are per colour: the colour part of the grid key («» when the item has no colours). */
export function tierColorKey(options: VariantOptions): string {
  return variantGridKey({ color: options.color }).split("|")[0];
}

/** First saved tiers per colour, for opening the editor on an existing item. */
export function tiersByColor(
  variants: readonly { options: VariantOptions; priceTiers: GarmentPriceTier[] | null }[],
): Map<string, GarmentPriceTier[]> {
  const out = new Map<string, GarmentPriceTier[]>();
  for (const v of variants) {
    const key: string = tierColorKey(v.options);
    if (!out.has(key) && v.priceTiers && v.priceTiers.length > 0) out.set(key, v.priceTiers);
  }
  return out;
}

export type TierGroup = { key: string; color: string | null; hex: string | undefined };

/** Colour groups of the editor's variant rows, in row order (one «» group for colourless rows). */
export function tierGroupsFromVariants(variants: readonly { options: VariantOptions }[]): TierGroup[] {
  const out: TierGroup[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const key: string = tierColorKey(v.options);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, color: v.options.color?.trim() || null, hex: v.options.colorHex });
  }
  return out;
}
