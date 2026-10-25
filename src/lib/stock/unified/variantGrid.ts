/**
 * Clothing-style variant grid: colour × size → one `StockVariant` per pair.
 * Pure helpers shared by the item editor and tests.
 */

export type VariantOptions = {
  color?: string;
  colorHex?: string;
  size?: string;
};

export type ColorChoice = { name: string; hex: string };

/** A variant row in the editor before it is saved (or a saved one being edited). */
export type VariantDraft = {
  /** Stable key for React and grid merging: `color|size` (lowercased) or a random id. */
  key: string;
  /** Saved variant id; absent for new rows. */
  id?: string;
  sku: string;
  label: string;
  options: VariantOptions;
  sellPrice: string;
  dealerPrice: string;
  purchaseCost: string;
  reorderLevel: string;
  isActive: boolean;
  sortOrder: number;
  /** The SKU was typed by hand — don't overwrite it when the item SKU changes. */
  skuEdited?: boolean;
};

export const COMMON_CLOTHING_SIZES: readonly string[] = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

/** «Чёрный» → `CHERNYY`, «roșu deschis» → `ROSUDESCHIS`, «0-3 m» → `0-3M`. */
export function skuSegment(value: string): string {
  const lower: string = value.trim().toLowerCase();
  let latin = "";
  for (const ch of lower) {
    latin += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return latin
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

/** `${itemSku}-${COLOR}-${SIZE}` uppercased; missing parts are skipped. */
export function buildVariantSku(itemSku: string, options: VariantOptions): string {
  const base: string = itemSku.trim().toUpperCase();
  const parts: string[] = [options.color, options.size]
    .map((p) => (p ? skuSegment(p) : ""))
    .filter((p) => p !== "");
  return [base, ...parts].filter((p) => p !== "").join("-");
}

/** «чёрный / M», «чёрный», «M», or "" for a plain single variant. */
export function variantLabel(options: VariantOptions): string {
  return [options.color?.trim(), options.size?.trim()].filter((p) => p).join(" / ");
}

export function variantGridKey(options: VariantOptions): string {
  return `${(options.color ?? "").trim().toLowerCase()}|${(options.size ?? "").trim().toLowerCase()}`;
}

function uniqueBy<T>(values: readonly T[], key: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of values) {
    const k: string = key(v);
    if (k === "" || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export type GridCell = { key: string; sku: string; label: string; options: VariantOptions };

/**
 * Every colour × size pair, colours outer. With only colours (or only sizes)
 * the grid is one-dimensional; with neither it is empty.
 */
export function generateVariantGrid(
  itemSku: string,
  colors: readonly ColorChoice[],
  sizes: readonly string[],
): GridCell[] {
  const cs: ColorChoice[] = uniqueBy(
    colors.map((c) => ({ name: c.name.trim(), hex: c.hex })),
    (c) => c.name.toLowerCase(),
  );
  const ss: string[] = uniqueBy(
    sizes.map((s) => s.trim()),
    (s) => s.toLowerCase(),
  );
  if (cs.length === 0 && ss.length === 0) return [];
  const colorAxis: (ColorChoice | null)[] = cs.length > 0 ? cs : [null];
  const sizeAxis: (string | null)[] = ss.length > 0 ? ss : [null];
  const cells: GridCell[] = [];
  for (const c of colorAxis) {
    for (const s of sizeAxis) {
      const options: VariantOptions = {};
      if (c) {
        options.color = c.name;
        options.colorHex = c.hex;
      }
      if (s) options.size = s;
      cells.push({
        key: variantGridKey(options),
        sku: buildVariantSku(itemSku, options),
        label: variantLabel(options),
        options,
      });
    }
  }
  return cells;
}

export function emptyVariantDraft(key: string, sortOrder: number): VariantDraft {
  return {
    key,
    sku: "",
    label: "",
    options: {},
    sellPrice: "",
    dealerPrice: "",
    purchaseCost: "",
    reorderLevel: "",
    isActive: true,
    sortOrder,
  };
}

/**
 * Rebuild the draft list from a new grid. Rows matching a cell keep what the
 * user typed (prices, edited SKU, id); new cells start from `defaults`.
 * Saved rows (with `id`) that left the grid are kept at the end so nothing
 * with history disappears silently; unsaved ones are dropped.
 */
export function mergeVariantDrafts(
  existing: readonly VariantDraft[],
  grid: readonly GridCell[],
  defaults: Pick<VariantDraft, "sellPrice" | "dealerPrice" | "purchaseCost" | "reorderLevel">,
): VariantDraft[] {
  const byKey = new Map<string, VariantDraft>();
  for (const d of existing) byKey.set(variantGridKey(d.options), d);
  const used = new Set<VariantDraft>();
  const out: VariantDraft[] = grid.map((cell, i) => {
    const prev: VariantDraft | undefined = byKey.get(cell.key);
    if (prev) {
      used.add(prev);
      return {
        ...prev,
        options: { ...prev.options, ...cell.options },
        label: cell.label,
        sku: prev.skuEdited ? prev.sku : cell.sku,
        sortOrder: i,
      };
    }
    return {
      ...emptyVariantDraft(cell.key, i),
      ...defaults,
      sku: cell.sku,
      label: cell.label,
      options: cell.options,
    };
  });
  for (const d of existing) {
    if (!used.has(d) && d.id) out.push({ ...d, sortOrder: out.length });
  }
  return out;
}

/** Refresh auto-generated SKUs after the item SKU changes (hand-edited ones stay). */
export function resyncVariantSkus(drafts: readonly VariantDraft[], itemSku: string): VariantDraft[] {
  return drafts.map((d) => (d.skuEdited || d.id ? d : { ...d, sku: buildVariantSku(itemSku, d.options) }));
}

/** Copy the bulk price fields onto every row (empty bulk fields are left alone). */
export function applyPricesToAll(
  drafts: readonly VariantDraft[],
  prices: Partial<Pick<VariantDraft, "sellPrice" | "dealerPrice" | "purchaseCost" | "reorderLevel">>,
): VariantDraft[] {
  const patch: Partial<VariantDraft> = {};
  for (const [k, v] of Object.entries(prices) as [keyof typeof prices, string | undefined][]) {
    if (v != null && v.trim() !== "") patch[k] = v;
  }
  return drafts.map((d) => ({ ...d, ...patch }));
}

/** Colours and sizes already present in a list of variants (to re-open the grid editor). */
export function gridAxesFromDrafts(drafts: readonly VariantDraft[]): {
  colors: ColorChoice[];
  sizes: string[];
} {
  const colors: ColorChoice[] = uniqueBy(
    drafts
      .filter((d) => d.options.color)
      .map((d) => ({ name: d.options.color!, hex: d.options.colorHex ?? "#9ca3af" })),
    (c) => c.name.trim().toLowerCase(),
  );
  const sizes: string[] = uniqueBy(
    drafts.map((d) => d.options.size ?? ""),
    (s) => s.trim().toLowerCase(),
  );
  return { colors, sizes };
}

/** Variant SKUs that appear more than once (case-insensitive). */
export function duplicateSkus(skus: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of skus) {
    const k: string = s.trim().toUpperCase();
    if (!k) continue;
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return [...dup];
}
