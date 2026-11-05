import { z } from "zod";
import {
  computeLfFinishing,
  isEmptyLfFinishing,
  lfFinishingInputSchema,
  lfFinishingSummaryRu,
  type LfFinishingInput,
} from "@/lib/largeFormat/lfFinishing";
import { LF_KITS, LF_KIT_IDS, lfKitTitleRu, type LfKitId } from "@/lib/largeFormat/lfKits";
import { LF_CANVAS_GALLERY_WRAP_CM } from "@/lib/largeFormat/lfLayoutBorder";

/**
 * Storefront wide-format products («Print mare format»): which roll each
 * product prints on, how it is sized, the size limits and the file checks.
 * Pure and client-safe — the product pages, `POST /api/public/quote` and the
 * checkout all use it. Prices are never here: the quote runs the studio's
 * own large-format pipeline (`src/lib/shop/largeFormatShop.ts`).
 */

export const SHOP_LF_CATEGORY_SLUG = "print-mare-format";
export const SHOP_LF_CATEGORY_PATH = `/${SHOP_LF_CATEGORY_SLUG}`;

export const SHOP_LF_PRODUCTS = ["banner", "autocolant", "canvas", "poster", "rollup", "xbanner"] as const;
export type ShopLfProduct = (typeof SHOP_LF_PRODUCTS)[number];

/**
 * Shop material keys → the admin's «Широкоформатные материалы». A key names
 * a material family (the roll name without its size, `lfMaterialFamilyKey`):
 * several rolls of one family (Oracal mat 1,05 / 1,27 / 1,62) are priced on
 * the cheapest roll that fits, as the wizard's family option does.
 */
export const SHOP_LF_MATERIALS = ["banner", "oracal_matt", "oracal_gloss", "photo_200", "photo_230", "paper_100", "canvas"] as const;
export type ShopLfMaterial = (typeof SHOP_LF_MATERIALS)[number];

/** Family key (lower case) of each shop material, as `lfMaterialFamilyKey` derives it from the roll name. */
export const SHOP_LF_MATERIAL_FAMILY: Record<ShopLfMaterial, string> = {
  banner: "banner matt",
  oracal_matt: "oracal matt",
  oracal_gloss: "oracal gloss",
  photo_200: "photo paper 200g",
  photo_230: "photo paper 230g",
  paper_100: "paper 100g",
  canvas: "panza din bumbac",
};

/** Staff names of the shop materials (Russian, for the order notes). */
export const SHOP_LF_MATERIAL_RU: Record<ShopLfMaterial, string> = {
  banner: "баннер Frontlit 440 г",
  oracal_matt: "Oracal матовый",
  oracal_gloss: "Oracal глянцевый",
  photo_200: "фотобумага 200 г",
  photo_230: "фотобумага матовая 230 г",
  paper_100: "бумага 100 г",
  canvas: "холст",
};

export type ShopLfSizing = "custom" | "preset" | "both" | "kit";

export interface ShopLfProductRule {
  product: ShopLfProduct;
  slug: string;
  materials: readonly ShopLfMaterial[];
  sizing: ShopLfSizing;
  kits: readonly LfKitId[];
  finishing: boolean;
  /** Print-quality thresholds at the print size: good from `okDpi`, too low under `lowDpi`. */
  okDpi: number;
  lowDpi: number;
  /** Keep text and logos this far inside the edge, cm (eyelets / hem / the stand). */
  safeCm: number;
}

/**
 * Banners, roll-ups and X-banners are seen from a few metres: 72–100 dpi at
 * the print size is enough. Canvas and posters are seen close up: 100–150 dpi.
 */
export const SHOP_LF_RULES: Record<ShopLfProduct, ShopLfProductRule> = {
  banner: { product: "banner", slug: "banner", materials: ["banner"], sizing: "custom", kits: [], finishing: true, okDpi: 100, lowDpi: 60, safeCm: 4 },
  autocolant: {
    product: "autocolant",
    slug: "autocolant-oracal",
    materials: ["oracal_matt", "oracal_gloss"],
    sizing: "custom",
    kits: [],
    finishing: false,
    okDpi: 120,
    lowDpi: 72,
    safeCm: 1,
  },
  canvas: { product: "canvas", slug: "canvas-pe-sasiu", materials: ["canvas"], sizing: "preset", kits: [], finishing: false, okDpi: 150, lowDpi: 100, safeCm: 2 },
  poster: {
    product: "poster",
    slug: "poster-foto-mare",
    materials: ["photo_200", "photo_230", "paper_100"],
    sizing: "both",
    kits: [],
    finishing: false,
    okDpi: 150,
    lowDpi: 100,
    safeCm: 1,
  },
  rollup: {
    product: "rollup",
    slug: "roll-up",
    materials: [],
    sizing: "kit",
    kits: ["rollup_80x200", "rollup_100x200", "rollup_120x200"],
    finishing: false,
    okDpi: 100,
    lowDpi: 60,
    safeCm: 3,
  },
  xbanner: { product: "xbanner", slug: "x-banner", materials: [], sizing: "kit", kits: ["xbanner_80x180"], finishing: false, okDpi: 100, lowDpi: 60, safeCm: 4 },
};

/** Product illustrations (`public/lf-*.svg`): cards, the cart and «Repetă comanda». */
export const SHOP_LF_IMAGES: Record<ShopLfProduct, string> = {
  banner: "/lf-banner.svg",
  autocolant: "/lf-autocolant.svg",
  canvas: "/lf-canvas.svg",
  poster: "/lf-poster.svg",
  rollup: "/lf-rollup.svg",
  xbanner: "/lf-xbanner.svg",
};
export const SHOP_LF_CATEGORY_IMAGE = "/lf-category.svg";

export function shopLfImageBySlug(slug: string): string | null {
  const p = shopLfProductBySlug(slug);
  return p ? SHOP_LF_IMAGES[p] : null;
}

export const SHOP_LF_SLUGS: readonly string[] = SHOP_LF_PRODUCTS.map((p) => SHOP_LF_RULES[p].slug);

export function shopLfProductBySlug(slug: string): ShopLfProduct | null {
  return SHOP_LF_PRODUCTS.find((p) => SHOP_LF_RULES[p].slug === slug) ?? null;
}

/** The printer prints at most 1,60 m wide (the widest roll prints 1,57 m). */
export const SHOP_LF_MAX_WIDTH_CM = 160;
/** Longest side sold online, cm (longer → on request). */
export const SHOP_LF_MAX_LENGTH_CM = 500;
export const SHOP_LF_MIN_SIDE_CM = 10;
export const SHOP_LF_MAX_QTY = 100;

/** Canvas: the mirrored wrap folded around the frame on every side, cm (the workshop adds it). */
export const SHOP_LF_CANVAS_WRAP_CM = LF_CANVAS_GALLERY_WRAP_CM;

/** Exactly what `POST /api/public/quote` accepts for a wide-format line. */
export const shopLfQuoteSchema = z
  .object({
    kind: z.literal("largeFormat"),
    product: z.enum(SHOP_LF_PRODUCTS),
    /** Not for sets (roll-up / X-banner: the roll comes with the set). */
    material: z.enum(SHOP_LF_MATERIALS).optional(),
    /** Visible size, cm (canvas: the face; the wrap is added by the workshop). Not for sets. */
    widthCm: z.number().positive().max(SHOP_LF_MAX_LENGTH_CM).optional(),
    heightCm: z.number().positive().max(SHOP_LF_MAX_LENGTH_CM).optional(),
    quantity: z.number().int().min(1).max(SHOP_LF_MAX_QTY),
    /** A fixed size from the material's price list (canvas, photo paper) in either orientation. */
    preset: z.literal(true).optional(),
    finishing: lfFinishingInputSchema.optional(),
    kit: z.enum(LF_KIT_IDS).optional(),
  })
  .strict();

export type ShopLfQuote = z.infer<typeof shopLfQuoteSchema>;

/** Size rounded to 0,1 cm (what the customer types). */
function cm1(n: number): boolean {
  return Math.abs(Math.round(n * 10) - n * 10) < 1e-6;
}

/**
 * Why a wide-format quote line cannot be sold as configured (stable code), or
 * null. The roll width is checked on the server against the real rolls.
 */
export function shopLfLineProblem(line: ShopLfQuote): string | null {
  const rule = SHOP_LF_RULES[line.product];
  if (rule.sizing === "kit") {
    if (!line.kit || !rule.kits.includes(line.kit)) return "lf_kit_required";
    if (line.material || line.widthCm != null || line.heightCm != null || line.preset || line.finishing) return "lf_kit_options";
    return null;
  }
  if (line.kit) return "lf_kit_options";
  if (!line.material || !rule.materials.includes(line.material)) return "lf_material_invalid";
  if (line.widthCm == null || line.heightCm == null) return "lf_size_required";
  if (!cm1(line.widthCm) || !cm1(line.heightCm)) return "lf_size_invalid";
  if (rule.sizing === "preset" && !line.preset) return "lf_preset_required";
  if (rule.sizing === "custom" && line.preset) return "lf_preset_invalid";
  if (line.finishing && !rule.finishing && !isEmptyLfFinishing(line.finishing)) return "lf_finishing_invalid";
  const short: number = Math.min(line.widthCm, line.heightCm);
  const long: number = Math.max(line.widthCm, line.heightCm);
  if (short < SHOP_LF_MIN_SIDE_CM) return "lf_size_too_small";
  if (short > SHOP_LF_MAX_WIDTH_CM) return "lf_too_wide";
  if (long > SHOP_LF_MAX_LENGTH_CM) return "lf_too_long";
  return null;
}

export function isShopLfQuote(v: unknown): v is ShopLfQuote {
  const p = shopLfQuoteSchema.safeParse(v);
  return p.success && shopLfLineProblem(p.data) == null;
}

/** Printed (visible) size of a line, cm: the set's size for roll-ups / X-banners. */
export function shopLfLineSize(line: ShopLfQuote): { widthCm: number; heightCm: number } | null {
  if (line.kit) {
    const k = LF_KITS[line.kit];
    return { widthCm: k.printWidthCm, heightCm: k.printHeightCm };
  }
  return line.widthCm != null && line.heightCm != null ? { widthCm: line.widthCm, heightCm: line.heightCm } : null;
}

/** Number «200» / «42,5» (cm). */
export function shopLfCm(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/** «200×100 cm». */
export function shopLfSizeText(widthCm: number, heightCm: number): string {
  return `${shopLfCm(widthCm)}×${shopLfCm(heightCm)} cm`;
}

const PRODUCT_RU: Record<ShopLfProduct, string> = {
  banner: "Баннер",
  autocolant: "Самоклейка Oracal",
  canvas: "Холст на подрамнике",
  poster: "Постер / фото большого формата",
  rollup: "Roll-up",
  xbanner: "X-banner",
};

/**
 * The line in Russian for the order notes: «Баннер 200×100 см, баннер Frontlit
 * 440 г, люверсы шаг ≤50 см по периметру (12 шт.), проклейка по периметру (6 м) — 1 шт.».
 */
export function shopLfStaffSummaryRu(line: ShopLfQuote, opts: { short?: boolean } = {}): string {
  const qty = `${line.quantity} шт.`;
  if (line.kit) {
    const k = LF_KITS[line.kit];
    const title: string = lfKitTitleRu(k);
    if (opts.short) return `${title} — ${qty}`;
    const extra: string =
      k.kind === "rollup"
        ? `печать ${k.printWidthCm}×${k.printHeightCm} см (${k.hiddenBottomCm} см снизу в кассету)`
        : "люверсы по углам (4 шт.)";
    return `${title}, ${extra} — ${qty}`;
  }
  const size: string = line.widthCm != null && line.heightCm != null ? `${shopLfCm(line.widthCm)}×${shopLfCm(line.heightCm)} см` : "";
  const head: string = [PRODUCT_RU[line.product], size].filter(Boolean).join(" ");
  if (opts.short) return `${head} — ${qty}`;
  const parts: string[] = [head];
  if (line.material) parts.push(SHOP_LF_MATERIAL_RU[line.material]);
  if (line.product === "canvas") parts.push(`загиб ${SHOP_LF_CANVAS_WRAP_CM} см зеркально`);
  if (line.preset) parts.push("размер из прайса");
  const finishing: string =
    line.finishing && line.widthCm != null && line.heightCm != null
      ? lfFinishingSummaryRu(computeLfFinishing(line.finishing, line.widthCm, line.heightCm, line.quantity))
      : "";
  if (finishing) parts.push(finishing);
  return `${parts.join(", ")} — ${qty}`;
}

/** Finishing of a line, for its description. */
export function shopLfFinishingOf(line: ShopLfQuote): LfFinishingInput | null {
  return line.finishing && !isEmptyLfFinishing(line.finishing) ? line.finishing : null;
}
