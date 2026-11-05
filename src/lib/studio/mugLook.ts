import { MUG_SHAPE_DEFAULTS, parseMugShape, type MugShape } from "@/lib/mug/mugShape";
import { parseMugSurface, type MugFinish } from "@/lib/mug/mugSurface";
import { isMagicMugText } from "./magicMug";

/**
 * How a mug looks, from its catalog item (variant / stock item attributes):
 * the part colours, finish, colour band, shape and print size — the same
 * fields the 3D model reads (`colorsFromProduct`). Shared by the 2D product
 * thumbnails, the «Personalizează» preview and the cold / hot toggle. Pure.
 *
 * Magic (chameleon) mugs: the coating is dark when cold and clears when hot,
 * showing the design. `state: "hot"` (default) is the design view: the body
 * shows white so the design reads; `"cold"` is the coating colour.
 */

export interface StudioMugLook {
  bodyHex: string;
  handleHex: string;
  innerHex: string;
  rimHex: string;
  finish: MugFinish;
  gradientHex: string | null;
  /** How far up the colour band fades, % of the body height. */
  gradientPct: number;
  shape: MugShape;
  /** Print area on the body (cm), when known. */
  print: { widthCm: number; heightCm: number } | null;
  /** Thermo / magic / chameleon mug. */
  magic: boolean;
  /** The body colour of a magic mug while cold (the coating). */
  coldBodyHex: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE = "#ffffff";
const DEFAULT_BODY = "#f5f5f0";
const DEFAULT_HANDLE = "#a8a29e";

function hex(v: unknown): string | null {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** A magic / chameleon mug, by an explicit flag or its names / SKU. */
export function isMagicMug(item: Record<string, unknown> | null | undefined): boolean {
  if (!item) return false;
  if (item.magic === true || item.thermo === true) return true;
  return isMagicMugText(...[item.nameRo, item.nameRu, item.nameEn, item.name, item.slug, item.sku, item.finishName].map(str));
}

function num(v: unknown): number | null {
  const n: number = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The look of a mug variant. `variantHex` (the colour the customer picked)
 * only fills in when the catalog item is not known yet.
 */
export function studioMugLook(
  item: Record<string, unknown> | null | undefined,
  opts: { variantHex?: string | null; state?: "hot" | "cold" } = {},
): StudioMugLook {
  const state: "hot" | "cold" = opts.state ?? "hot";
  const body: string = hex(item?.bodyColorHex) ?? hex(opts.variantHex) ?? DEFAULT_BODY;
  const handle: string = hex(item?.handleColorHex) ?? (item ? body : DEFAULT_HANDLE);
  const surface = parseMugSurface(item ?? {});
  const magic: boolean = isMagicMug(item);
  const w: number | null = num(item?.printWidthCm);
  const h: number | null = num(item?.printHeightCm);
  return {
    // Hot: the coating clears where the design is; the design view shows it on white.
    bodyHex: magic && state === "hot" ? WHITE : body,
    handleHex: handle,
    innerHex: hex(item?.innerColorHex) ?? body,
    rimHex: hex(item?.rimColorHex) ?? body,
    finish: surface.finish,
    gradientHex: magic ? null : surface.gradientColorHex,
    gradientPct: surface.gradientHeightPct,
    shape: item ? parseMugShape(item) : MUG_SHAPE_DEFAULTS,
    print: w && h ? { widthCm: w, heightCm: h } : null,
    magic,
    coldBodyHex: magic ? body : null,
  };
}

/** Short stable key of a look (thumbnail cache). */
export function mugLookKey(l: StudioMugLook): string {
  const s = l.shape;
  return [
    l.bodyHex,
    l.handleHex,
    l.innerHex,
    l.rimHex,
    l.finish,
    l.gradientHex ?? "-",
    l.gradientPct,
    s.bodyHeightCm,
    s.topDiameterCm,
    s.bottomDiameterCm,
    s.handleStyle,
    l.print?.widthCm ?? "-",
    l.print?.heightCm ?? "-",
  ].join(",");
}
