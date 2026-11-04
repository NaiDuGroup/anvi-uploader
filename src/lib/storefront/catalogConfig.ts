import { parseGarmentPriceTiers } from "@/lib/dtf/garmentPriceTiers";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { printUnitPrice } from "./dtfPrint";
import { pickLocalized, type Localized, type ShopLang } from "./i18n";
import type {
  ShopCategory,
  ShopCategorySlug,
  ShopDtfColor,
  ShopPriceTier,
  ShopPrintDiscount,
  ShopPrintOption,
  ShopProduct,
  ShopSimpleKind,
  ShopVariant,
} from "./types";

/**
 * Pilot storefront catalog: which stock items (by SKU) each storefront
 * product sells, with the shop's own copy. Prices, photos and ids come live
 * from the database (see `catalog.ts`); this file is pure so the mapping is
 * unit-tested without Prisma.
 */

export interface ShopOptionConfig {
  sku: string;
  label: Localized;
  hex: string;
  /**
   * Photos of the item that show something we do not sell (the supplier's
   * gallery has every colour of the model): storage keys containing any of
   * these strings are left out of the product gallery.
   */
  hideImages?: string[];
  /**
   * Lifestyle photos that show the model in another colour: kept, but moved to
   * the end of the gallery and captioned «colour may differ». Storage keys
   * containing any of these strings.
   */
  lifestyleImages?: string[];
}

interface BaseProductConfig {
  slug: string;
  category: ShopCategorySlug;
  name: Localized;
  subtitle: Localized;
  description: Localized;
  badge?: Localized;
  options: ShopOptionConfig[];
}

export interface SimpleProductConfig extends BaseProductConfig {
  mode: "simple";
  kind: ShopSimpleKind;
  editorHref?: string;
  printAreaCm?: { widthCm: number; heightCm: number };
}

export interface DtfProductConfig extends BaseProductConfig {
  mode: "dtf";
  garment: "tshirt" | "cap";
}

export type ShopProductConfig = SimpleProductConfig | DtfProductConfig;

export const SHOP_CATEGORIES: { slug: ShopCategorySlug; name: Localized }[] = [
  { slug: "caiete", name: { ro: "Carnete", ru: "Блокноты", en: "Notebooks" } },
  { slug: "cani", name: { ro: "Căni", ru: "Кружки", en: "Mugs" } },
  { slug: "tricouri", name: { ro: "Tricouri și șepci", ru: "Футболки и кепки", en: "T-shirts and caps" } },
  { slug: "pixuri", name: { ro: "Pixuri", ru: "Ручки", en: "Pens" } },
];

const MUG_AREA = { widthCm: 20, heightCm: 9 };

export const SHOP_PRODUCTS: ShopProductConfig[] = [
  {
    slug: "carnet-a5",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 14.8, heightCm: 21 },
    name: { ro: "Carnet A5 cu imprimarea ta", ru: "Блокнот A5 с вашей печатью", en: "A5 notebook with your print" },
    subtitle: { ro: "4 culori de copertă", ru: "4 цвета обложки", en: "4 cover colours" },
    description: {
      ro: "Copertă tare din piele ecologică, imprimare UV direct pe copertă. Potrivit pentru cadou, școală și merch corporativ.",
      ru: "Твёрдая обложка из экокожи, УФ-печать прямо на обложке. Подходит для подарка, школы и корпоративного мерча.",
      en: "Hard faux-leather cover with UV printing straight on the cover. Great as a gift, for school or as corporate merch.",
    },
    badge: { ro: "Hit", ru: "Хит", en: "Bestseller" },
    options: [
      { sku: "S3-KBL-A5", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#b63935" },
      { sku: "S3-ZBL-A5", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#48844c" },
      { sku: "S3-SBL-A5", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#17579a" },
      { sku: "S3-CBL-A5", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#202020" },
    ],
  },
  {
    slug: "cana-interior-colorat",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană colorată în interior", ru: "Кружка цветная внутри", en: "Mug with coloured inside" },
    subtitle: { ro: "330 ml · 7 culori", ru: "330 мл · 7 цветов", en: "330 ml · 7 colours" },
    description: {
      ro: "Cană ceramică albă cu interior și mâner colorat. Imprimare prin sublimare, rezistă la mașina de spălat vase.",
      ru: "Белая керамическая кружка с цветными внутренней частью и ручкой. Сублимационная печать, выдерживает посудомойку.",
      en: "White ceramic mug with a coloured inside and handle. Sublimation print, dishwasher-safe.",
    },
    badge: { ro: "Editor 3D", ru: "3D-редактор", en: "3D editor" },
    options: [
      { sku: "S3-KSRS-320", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#2f6fd0" },
      { sku: "S3-KKRK-330", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#d0262d" },
      { sku: "S3-KZRZ-330", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#2f9a4a" },
      { sku: "S3-KJRJ-320", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#f2c230" },
      { sku: "S3-KORO-320", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f07a1f" },
      { sku: "S3-KRRR-320", label: { ro: "Roz", ru: "Розовый", en: "Pink" }, hex: "#f28bb5" },
      { sku: "S3-KCRC-330", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
    ],
  },
  {
    slug: "cana-alba",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană albă cu imprimare", ru: "Белая кружка с печатью", en: "White mug with your print" },
    subtitle: { ro: "320 ml sau 450 ml", ru: "320 мл или 450 мл", en: "320 ml or 450 ml" },
    description: {
      ro: "Clasica cană ceramică albă. Imprimare prin sublimare pe toată suprafața, culori vii.",
      ru: "Классическая белая керамическая кружка. Сублимационная печать по всей поверхности, яркие цвета.",
      en: "The classic white ceramic mug. Sublimation print all around, vivid colours.",
    },
    options: [
      { sku: "S1-KB-320", label: { ro: "320 ml", ru: "320 мл", en: "320 ml" }, hex: "#ffffff" },
      { sku: "S3-KB-450", label: { ro: "450 ml", ru: "450 мл", en: "450 ml" }, hex: "#ffffff" },
    ],
  },
  {
    slug: "cana-magica",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană magică", ru: "Кружка-хамелеон", en: "Magic mug" },
    subtitle: { ro: "Imaginea apare cu băutura caldă", ru: "Рисунок проявляется от горячего", en: "The picture appears with a hot drink" },
    description: {
      ro: "Cană neagră mată: când torni o băutură caldă, culoarea dispare și apare imaginea ta. Un cadou cu efect.",
      ru: "Чёрная матовая кружка: от горячего напитка цвет исчезает и появляется ваш рисунок. Подарок с эффектом.",
      en: "Matte black mug: pour in a hot drink and the black fades to reveal your picture. A gift with a wow effect.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [{ sku: "CTMM-320", label: { ro: "Neagră mată", ru: "Чёрная матовая", en: "Matte black" }, hex: "#1c1c1c" }],
  },
  {
    slug: "cana-aurie-argintie",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană aurie sau argintie", ru: "Кружка золотая или серебряная", en: "Gold or silver mug" },
    subtitle: { ro: "Acoperire tip oglindă", ru: "Зеркальное покрытие", en: "Mirror finish" },
    description: {
      ro: "Cană cu acoperire metalizată tip oglindă și imprimarea ta. Arată festiv — ideală pentru cadouri.",
      ru: "Кружка с зеркальным металлизированным покрытием и вашей печатью. Смотрится празднично — идеальна для подарка.",
      en: "Mug with a metallic mirror finish and your print. Looks festive — perfect as a gift.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [
      { sku: "CAU-320", label: { ro: "Aurie", ru: "Золотая", en: "Gold" }, hex: "#c9a33a" },
      { sku: "CAG-320", label: { ro: "Argintie", ru: "Серебряная", en: "Silver" }, hex: "#c4c6c8" },
    ],
  },
  {
    slug: "tricou-dogo",
    category: "tricouri",
    mode: "dtf",
    garment: "tshirt",
    name: { ro: "Tricou DOGO cu imprimare", ru: "Футболка DOGO с принтом", en: "DOGO T-shirt with your print" },
    subtitle: { ro: "S–3XL · imprimare DTF", ru: "S–3XL · печать DTF", en: "S–3XL · DTF print" },
    description: {
      ro: "DOGO Premium, bumbac. Imprimare DTF — nu crapă după spălări. Alege mărimea imprimării pe față și pe spate.",
      ru: "DOGO Premium, хлопок. Печать DTF — не трескается после стирок. Выберите размер принта спереди и сзади.",
      en: "DOGO Premium, cotton. DTF print that doesn't crack after washing. Choose the print size on the front and back.",
    },
    badge: { ro: "Logoul tău", ru: "Ваш логотип", en: "Your logo" },
    options: [
      // The ROLY gallery also holds green and cream shirts (lifestyle photos): shown last with a
      // «colour may differ» caption. Keys differ per database (the photos were imported separately),
      // so both the local and the production timestamps are listed. Production also has a
      // byte-identical copy of the main photo as the first gallery image (…3221 / …0942) — hidden.
      {
        sku: "CA6502-01",
        label: { ro: "Alb", ru: "Белая", en: "White" },
        hex: "#ffffff",
        hideImages: ["1793382803221-"],
        lifestyleImages: [
          // local
          "1793380437611-",
          "1793380437612-",
          // prod: cream man front ×2 / back, green kid
          "1793382803638-",
          "1793382803633-",
          "1793382803636-",
          "1793382803630-",
        ],
      },
      {
        sku: "CA6502-02",
        label: { ro: "Negru", ru: "Чёрная", en: "Black" },
        hex: "#1b1b1f",
        hideImages: ["1793382800942-"],
        lifestyleImages: [
          // local
          "1793380436411-",
          "1793380436412-",
          "1793380436414-",
          "1793380436417-",
          // prod: cream man front ×2 / back, green kid
          "1793382801267-",
          "1793382801264-",
          "1793382801269-",
          "1793382801261-",
        ],
      },
    ],
  },
  {
    slug: "sapca-eris",
    category: "tricouri",
    mode: "dtf",
    garment: "cap",
    name: { ro: "Șapcă ERIS cu logo", ru: "Кепка ERIS с логотипом", en: "ERIS cap with your logo" },
    subtitle: { ro: "3 culori · logo inclus", ru: "3 цвета · логотип включён", en: "3 colours · logo included" },
    description: {
      ro: "Șapcă din bumbac 100%, 5 panouri, închidere velcro. Prețul include logoul tău pe față (până la 9×5 cm).",
      ru: "Кепка из 100% хлопка, 5 панелей, застёжка на липучке. В цену входит ваш логотип спереди (до 9×5 см).",
      en: "100% cotton cap, 5 panels, velcro strap. The price includes your logo on the front (up to 9×5 cm).",
    },
    options: [
      { sku: "GO70199002", label: { ro: "Neagră", ru: "Чёрная", en: "Black" }, hex: "#1b1b1f" },
      { sku: "GO70199055", label: { ro: "Bleumarin", ru: "Тёмно-синяя", en: "Navy" }, hex: "#1f2a4d" },
      { sku: "GO70199060", label: { ro: "Roșie", ru: "Красная", en: "Red" }, hex: "#c0262d" },
    ],
  },
  {
    slug: "pix-ardenes",
    category: "pixuri",
    mode: "simple",
    kind: "pen",
    editorHref: "/pen",
    name: { ro: "Pix metalic cu logo", ru: "Металлическая ручка с логотипом", en: "Metal pen with your logo" },
    subtitle: { ro: "5 culori", ru: "5 цветов", en: "5 colours" },
    description: {
      ro: "Pix ARDENES cu corp din aluminiu și mecanism cu buton. Imprimare UV cu numele sau logoul tău. Cerneală albastră.",
      ru: "Ручка ARDENES с алюминиевым корпусом и кнопочным механизмом. УФ-печать имени или логотипа. Синие чернила.",
      en: "ARDENES pen with an aluminium body and push-button mechanism. UV print of your name or logo. Blue ink.",
    },
    options: [
      { sku: "ARDENES_BLUE", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#1e4f9c" },
      { sku: "ARDENES_BLACK", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "ARDENES_RED", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#c0262d" },
      { sku: "ARDENES_GREEN", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#2f7a4a" },
      { sku: "ARDENES_WHITE", label: { ro: "Alb", ru: "Белый", en: "White" }, hex: "#f4f4f4" },
    ],
  },
];

/** Products shown under «Cele mai comandate» on the home page, in order. */
export const SHOP_POPULAR_SLUGS: string[] = ["carnet-a5", "cana-interior-colorat", "tricou-dogo", "cana-aurie-argintie"];

/** Cap logo: at most 9×5 cm, included in the price (see `dtfIncludedPrintFor`). */
export const CAP_LOGO_ZONE = { widthCm: 9, heightCm: 5 };

export function allShopSkus(): string[] {
  return SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku));
}

export function isShopCategorySlug(value: string): value is ShopCategorySlug {
  return SHOP_CATEGORIES.some((c) => c.slug === value);
}

// ─── Mapping DB rows → storefront products ──────────────────────────────────

export interface CatalogVariantRow {
  id: string;
  isActive: boolean;
  options: unknown;
  sellPrice: number | null;
  priceTiers: unknown;
  sortOrder: number;
  /** Variant label: the DTF engine's size fallback when `options.size` is empty. */
  label?: string | null;
}

export interface CatalogItemRow {
  id: string;
  sku: string;
  isActive: boolean;
  imageUrl: string | null;
  galleryImages: string[];
  variants: CatalogVariantRow[];
}

export interface CatalogPresetRow {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  retailPrice: number;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "4XL", "5XL"];

function sizeRank(size: string): number {
  const i: number = SIZE_ORDER.indexOf(size.toUpperCase());
  return i < 0 ? 100 : i;
}

function optionString(options: unknown, key: string): string {
  if (options == null || typeof options !== "object" || Array.isArray(options)) return "";
  const v: unknown = (options as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** First run-size tier (1 piece), else the variant's sell price. */
export function firstTierPrice(v: Pick<CatalogVariantRow, "priceTiers" | "sellPrice">): number | null {
  if (Array.isArray(v.priceTiers)) {
    const tiers = v.priceTiers
      .map((t) => (t && typeof t === "object" ? (t as { minQty?: unknown; priceMdl?: unknown }) : null))
      .filter((t): t is { minQty: number; priceMdl: number } => typeof t?.minQty === "number" && typeof t?.priceMdl === "number")
      .sort((a, b) => a.minQty - b.minQty);
    if (tiers[0] && tiers[0].priceMdl > 0) return tiers[0].priceMdl;
  }
  return v.sellPrice != null && v.sellPrice > 0 ? v.sellPrice : null;
}

/** Run-size price table of a variant (consecutive ranges); empty with fewer than two priced tiers. */
export function priceTierTable(priceTiers: unknown): ShopPriceTier[] {
  const tiers = parseGarmentPriceTiers(priceTiers).filter((t) => t.priceMdl > 0);
  if (tiers.length < 2) return [];
  return tiers.map((t, i) => ({
    minQty: t.minQty,
    maxQty: tiers[i + 1] ? tiers[i + 1]!.minQty - 1 : null,
    price: t.priceMdl,
  }));
}

/** Main photo, then the gallery, as public URLs (duplicates and `hide` matches dropped). */
export function itemImages(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  hide: readonly string[] = [],
): string[] {
  return itemGallery(item, { hideImages: [...hide] }).images;
}

function matchesAny(key: string, parts: readonly string[] | undefined): boolean {
  return Boolean(parts?.some((h) => h && key.includes(h)));
}

/**
 * Gallery of an option: hidden photos dropped, duplicates removed, lifestyle
 * photos (another colour) moved to the end and listed in `lifestyle`.
 */
export function itemGallery(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  opt: Pick<ShopOptionConfig, "hideImages" | "lifestyleImages">,
): { images: string[]; lifestyle: string[] } {
  const keys: string[] = [item.imageUrl ?? "", ...item.galleryImages].filter(
    (k) => Boolean(k) && !matchesAny(k, opt.hideImages),
  );
  const own: string[] = [];
  const lifestyle: string[] = [];
  for (const k of keys) {
    const u: string | null = publicAssetUrlFromStorageKey(k);
    if (!u || own.includes(u) || lifestyle.includes(u)) continue;
    (matchesAny(k, opt.lifestyleImages) ? lifestyle : own).push(u);
  }
  return { images: [...own, ...lifestyle], lifestyle };
}

function galleryFields(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  opt: ShopOptionConfig,
): { images: string[]; lifestyleImages?: string[] } {
  const g = itemGallery(item, opt);
  return g.lifestyle.length ? { images: g.images, lifestyleImages: g.lifestyle } : { images: g.images };
}

function minPrice(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.min(...nums) : null;
}

/** DTF print pricing the product pages show (from `PrintMethod('dtf').settings`). */
export interface CatalogDtfPricing {
  printDiscount: ShopPrintDiscount | null;
  pressFeeMdl: number;
}

const NO_DTF_PRICING: CatalogDtfPricing = { printDiscount: null, pressFeeMdl: 0 };

/** Lowest price of a tier table (its last row), or null without tiers. */
function tableMin(tiers: readonly ShopPriceTier[] | undefined): number | null {
  return tiers && tiers.length ? Math.min(...tiers.map((t) => t.price)) : null;
}

/**
 * One storefront product from its config and the catalog rows; null when
 * none of its items is active (the product is then hidden).
 */
export function mapShopProduct(
  config: ShopProductConfig,
  itemsBySku: ReadonlyMap<string, CatalogItemRow>,
  presets: readonly CatalogPresetRow[],
  lang: ShopLang,
  dtfPricing: CatalogDtfPricing = NO_DTF_PRICING,
): ShopProduct | null {
  const base = {
    slug: config.slug,
    category: config.category,
    name: pickLocalized(config.name, lang),
    subtitle: pickLocalized(config.subtitle, lang),
    description: pickLocalized(config.description, lang),
    badge: config.badge ? pickLocalized(config.badge, lang) : null,
  };

  if (config.mode === "simple") {
    const variants: ShopVariant[] = [];
    for (const opt of config.options) {
      const item = itemsBySku.get(opt.sku);
      if (!item?.isActive) continue;
      const v = item.variants.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (!v) continue;
      variants.push({
        id: v.id,
        label: pickLocalized(opt.label, lang),
        hex: opt.hex,
        ...galleryFields(item, opt),
        price: firstTierPrice(v),
        ...(config.kind === "pen" ? { tiers: priceTierTable(v.priceTiers) } : {}),
      });
    }
    if (variants.length === 0) return null;
    return {
      ...base,
      fromPrice: minPrice(variants.map((v) => v.price)),
      unitFrom: minPrice(variants.map((v) => tableMin(v.tiers))),
      image: variants[0]!.images[0] ?? null,
      mode: "simple",
      simpleKind: config.kind,
      variants,
      dtf: null,
      editorHref: config.editorHref ?? null,
      printAreaCm: config.printAreaCm ?? null,
    };
  }

  const colors: ShopDtfColor[] = [];
  for (const opt of config.options) {
    const item = itemsBySku.get(opt.sku);
    if (!item?.isActive) continue;
    const active = item.variants.filter((x) => x.isActive);
    if (active.length === 0) continue;
    // One colour per item in the pilot: the first active variant's colour.
    const colorKey: string = optionString(active[0]!.options, "color").toLowerCase();
    const sameColor = active.filter((v) => optionString(v.options, "color").toLowerCase() === colorKey);
    const sizes: string[] = [...new Set(sameColor.map((v) => optionString(v.options, "size") || v.label?.trim() || "—"))].sort(
      (a, b) => sizeRank(a) - sizeRank(b),
    );
    const tiers: ShopPriceTier[] = priceTierTable(sameColor[0]?.priceTiers);
    colors.push({
      key: opt.sku,
      label: pickLocalized(opt.label, lang),
      hex: opt.hex,
      garmentId: `${item.id}:${colorKey}`,
      ...galleryFields(item, opt),
      sizes,
      itemPrice: minPrice(sameColor.map(firstTierPrice)),
      ...(tiers.length ? { tiers } : {}),
    });
  }
  if (colors.length === 0) return null;

  const prints: ShopPrintOption[] =
    config.garment === "tshirt"
      ? presets.map((p) => ({
          presetId: p.id,
          label: p.label,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          price: p.retailPrice,
        }))
      : [];
  const itemFrom: number | null = minPrice(colors.map((c) => c.itemPrice));
  const printFrom: number | null = minPrice(prints.map((p) => p.price));
  const fromPrice: number | null =
    itemFrom == null ? null : config.garment === "tshirt" ? (printFrom == null ? null : itemFrom + printFrom) : itemFrom;

  // Per piece at the biggest run: cheapest item tier (+ cheapest print at the deepest discount on a T-shirt).
  const itemTierMin: number | null = minPrice(colors.map((c) => tableMin(c.tiers)));
  const maxStep: number = Math.max(0, ...(dtfPricing.printDiscount?.steps ?? []).map((s) => s.minQty));
  const printTierMin: number | null =
    config.garment === "tshirt" && maxStep > 0
      ? minPrice(prints.map((p) => printUnitPrice(p, maxStep, dtfPricing.printDiscount, dtfPricing.pressFeeMdl)))
      : null;
  const tiered: boolean = itemTierMin != null || printTierMin != null;
  const unitFrom: number | null = !tiered
    ? null
    : config.garment === "tshirt"
      ? (itemTierMin ?? itemFrom) != null && (printTierMin ?? printFrom) != null
        ? (itemTierMin ?? itemFrom)! + (printTierMin ?? printFrom)!
        : null
      : itemTierMin;

  return {
    ...base,
    fromPrice,
    unitFrom,
    image: colors[0]!.images[0] ?? null,
    mode: "dtf",
    simpleKind: null,
    variants: [],
    dtf: {
      garment: config.garment,
      colors,
      prints,
      fixedZone: config.garment === "cap" ? CAP_LOGO_ZONE : null,
      printDiscount: config.garment === "tshirt" ? dtfPricing.printDiscount : null,
      pressFeeMdl: dtfPricing.pressFeeMdl,
    },
    editorHref: null,
    printAreaCm: null,
  };
}

export function mapShopCatalog(
  items: readonly CatalogItemRow[],
  presets: readonly CatalogPresetRow[],
  lang: ShopLang,
  dtfPricing: CatalogDtfPricing = NO_DTF_PRICING,
): { categories: ShopCategory[]; products: ShopProduct[] } {
  const bySku = new Map(items.map((i) => [i.sku, i]));
  const products: ShopProduct[] = SHOP_PRODUCTS.map((c) => mapShopProduct(c, bySku, presets, lang, dtfPricing)).filter(
    (p): p is ShopProduct => p != null,
  );
  const categories: ShopCategory[] = SHOP_CATEGORIES.map((c) => {
    const inCat = products.filter((p) => p.category === c.slug);
    return {
      slug: c.slug,
      name: pickLocalized(c.name, lang),
      image: inCat[0]?.image ?? null,
      productCount: inCat.length,
    };
  }).filter((c) => c.productCount > 0);
  return { categories, products };
}
