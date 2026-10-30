/**
 * Photos and descriptions of Gor Factory goods (Stamina, ROLY).
 *
 * - Photos: the supplier's public catalog file lists every model's pictures
 *   per colour (main colour shot, views, worn / detail shots). Same host as the
 *   import photos (static.gorfactory.es); the supplier allows using them unchanged.
 * - Descriptions: the model page on stamina-shop.com carries a short text in the
 *   page's `description` meta for each language (ru, ro, en); ROLY models too.
 */
import { GOR_FACTORY_IMAGE_HOST } from "./gorFactory";
import type { StockItemDescription } from "@/lib/stock/unified/itemDescription";

export const GOR_FACTORY_CATALOG_URL = `https://${GOR_FACTORY_IMAGE_HOST}/s4hana-b2b/Catalog/catalog_info.json`;

/** Most photos kept per item (main colour shot first). */
export const SUPPLIER_GALLERY_MAX = 10;

type MediaLeaf = { IMG?: string; FALLBACK?: boolean };
/** MEDIA[type][colour][view][n] = { IMG }. */
type MediaTree = Record<string, Record<string, Record<string, Record<string, MediaLeaf>>>>;

export interface GorFactoryModel {
  MEDIA?: MediaTree;
  COLORS?: Record<string, { IMG?: string }>;
  PRODUCTS?: Record<string, { COLOR?: string }>;
}

export interface GorFactoryCatalog {
  MODELS: Record<string, GorFactoryModel>;
}

/** «TZ1615S102» → «TZ1615»; «CA65020201» → «CA6502». */
export function gorFactoryModelCode(supplierCode: string): string | null {
  const m = /^([A-Z]{2}\d{4})/.exec(supplierCode.trim().toUpperCase());
  return m ? m[1]! : null;
}

/** Colour code of a supplier article: from the catalog's product list, else the code's tail. */
export function gorFactoryColorCode(model: GorFactoryModel, supplierCode: string): string | null {
  const code = supplierCode.trim().toUpperCase();
  const fromCatalog = model.PRODUCTS?.[code]?.COLOR;
  if (fromCatalog) return fromCatalog;
  const colours = Object.keys(model.COLORS ?? {}).sort((a, b) => b.length - a.length);
  return colours.find((c) => code.endsWith(c)) ?? null;
}

const absolute = (path: string): string => `https://${GOR_FACTORY_IMAGE_HOST}${path.startsWith("/") ? "" : "/"}${path}`;

/** Leaves of one colour of a media type, in view / shot order, without fallback copies. */
function leaves(tree: MediaTree[string] | undefined, colour: string): string[] {
  const byView = tree?.[colour];
  if (!byView) return [];
  const out: string[] = [];
  for (const view of Object.keys(byView).sort((a, b) => Number(a) - Number(b))) {
    const shots = byView[view]!;
    for (const n of Object.keys(shots).sort((a, b) => Number(a) - Number(b))) {
      const leaf = shots[n]!;
      if (leaf.IMG && !leaf.FALLBACK) out.push(leaf.IMG);
    }
  }
  return out;
}

/**
 * Photo URLs for one supplier article: its colour shot, that colour's views,
 * then the model's worn / detail / other shots (own colour first). Print-area
 * diagrams and videos are left out. Empty when the model is not in the catalog.
 */
export function gorFactoryGalleryUrls(catalog: GorFactoryCatalog, supplierCode: string): string[] {
  const modelCode = gorFactoryModelCode(supplierCode);
  const model = modelCode ? catalog.MODELS[modelCode] : undefined;
  if (!model) return [];
  const colour = gorFactoryColorCode(model, supplierCode);
  const media = model.MEDIA ?? {};
  const paths: string[] = [];
  if (colour && model.COLORS?.[colour]?.IMG) paths.push(model.COLORS[colour]!.IMG!);
  if (colour) paths.push(...leaves(media.VIEWS, colour));
  for (const type of ["ADULT", "CHILD", "DETAIL", "OTHER"]) {
    const tree = media[type];
    if (!tree) continue;
    const colours = Object.keys(tree).sort((a, b) => (a === colour ? -1 : b === colour ? 1 : 0));
    for (const c of colours) paths.push(...leaves(tree, c));
  }
  return [...new Set(paths)].slice(0, SUPPLIER_GALLERY_MAX).map(absolute);
}

/** URL of the article's own colour shot (what the import uses as the main photo); null when none. */
export function gorFactoryColourShotUrl(catalog: GorFactoryCatalog, supplierCode: string): string | null {
  const modelCode = gorFactoryModelCode(supplierCode);
  const model = modelCode ? catalog.MODELS[modelCode] : undefined;
  if (!model) return null;
  const colour = gorFactoryColorCode(model, supplierCode);
  const img = colour ? model.COLORS?.[colour]?.IMG : undefined;
  return img ? absolute(img) : null;
}

let cached: { at: number; catalog: GorFactoryCatalog } | null = null;

/** Supplier catalog (~30 MB), kept in memory for 10 minutes. */
export async function loadGorFactoryCatalog(): Promise<GorFactoryCatalog> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.catalog;
  const res = await fetch(GOR_FACTORY_CATALOG_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`gorfactory_catalog_${res.status}`);
  const catalog = (await res.json()) as GorFactoryCatalog;
  if (!catalog?.MODELS) throw new Error("gorfactory_catalog_invalid");
  cached = { at: Date.now(), catalog };
  return catalog;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Text of the page's `<meta name="description">`, HTML entities decoded. */
export function metaDescription(html: string): string {
  const m = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
  if (!m) return "";
  return m[1]!
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops the shop's placeholders: «MODELS.X.DESCRIPTION» for unknown models, «undefined», the generic slogan. */
export function usableDescription(text: string): string {
  const t = text.trim();
  if (!t || t === "undefined" || /^MODELS\./.test(t) || /^Discover all the products/i.test(t)) return "";
  return t;
}

async function pageDescription(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) return "";
    return usableDescription(metaDescription(await res.text()));
  } catch {
    return "";
  }
}

/** Model description in ru / ro / en from stamina-shop.com (ROLY models too); null when none. */
export async function fetchGorFactoryDescription(modelCode: string): Promise<StockItemDescription | null> {
  const [ru, ro, en] = await Promise.all(
    (["ru", "ro", "en"] as const).map((lang) => pageDescription(`https://stamina-shop.com/${lang}/model_${modelCode}`)),
  );
  return ru || ro || en ? { ru, ro, en } : null;
}
