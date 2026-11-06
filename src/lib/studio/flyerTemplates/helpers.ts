import type { SmartTextKey } from "../document";
import type { TplFlow, TplFlowItem } from "../flow";
import type { StudioLocalized } from "../i18n";
import type { StudioColorFieldKey } from "../smartFields";
import type { CardStyle, FlyerPurpose, StudioTemplate, StudioTemplateFont, TplLayer, TplPhoto, TplShape } from "../templates";
import { CONTACT_ICON, L, logoOr, row, stack, type MonogramOpts } from "../cardTemplates/helpers";
import type { TplStack, TplStackRow } from "../cardTemplates/stack";

/**
 * Shared pieces of the flyer templates (one file per family).
 *
 * GEOMETRY. Coordinates are shares of the whole print FILE (trim + 2 mm bleed
 * on every side): A6 109 × 152, A5 152 × 214, A4 214 × 301 mm (all ≈ √2, one
 * `flyer` layout serves the three) and DL 103 × 214 (its own `flyerDl` layout,
 * else the `flyer` one stretched). The safe zone is 6 mm from the file edge —
 * on the smallest file (A6) that is x ∈ [0.055, 0.945], y ∈ [0.04, 0.96]; keep
 * every text, logo and QR inside {@link SAFE} (the template test checks it on
 * every format). Backgrounds / bands / photos that should print to the edge
 * start at 0 / end at 1 (into the bleed).
 *
 * TEXT SIZE is a share of the file WIDTH (the shorter side): 0.1 ≈ 43 pt on
 * A5, 31 pt on A6, 61 pt on A4. Nothing below 0.026 (≈ 8 pt on A6). Body
 * text 0.034–0.04, contacts 0.03–0.034, headline 0.09–0.15.
 *
 * TEXTS THAT WRAP go in a {@link flow}: a column box [x, y, w, h]; its items
 * (headline, subheadline, body, bullets, date…) wrap to the width, stack
 * top-down (or are anchored middle / bottom) and shrink together when a long
 * Romanian / Russian text would overflow the box. An empty optional field is
 * left out and the rest close up. Single-line details (phone, site, address)
 * go in a card-style {@link stack} with icons. Shapes that only make sense
 * with a field (the offer badge behind «−20%», the date ribbon) take
 * `showIf: "<field>"` so they disappear with it.
 *
 * Flyer fields («Datele tale»): headline, subheadline, body, bullets (one per
 * line → list marker), offer («−20%», «de la 99 lei»), date, plus the card
 * details company, phone, email, site, address, the logo and ONE photo (every
 * non-logo photo spot takes it). Untouched samples are never printed.
 */

export { L, logoOr, row, stack, CONTACT_ICON };
export type { TplStack, TplStackRow, MonogramOpts };

/** Safe band (shares of the file) valid on every format, with a hair to spare. */
export const SAFE = { x0: 0.07, x1: 0.93, y0: 0.05, y1: 0.95 } as const;

export const NAVY = "#14213d";
export const INK = "#1d1d1f";
export const GREY = "#5b6880";
export const WHITE = "#ffffff";
export const CREAM = "#f6eee3";

/** A filled rectangle [x, y, w, h] (shares). */
export function rect(box: readonly [number, number, number, number], fill: string | null, opts: Partial<Omit<TplShape, "k" | "shape" | "box" | "fill">> = {}): TplShape {
  return { k: "shape", shape: "rect", box, fill, ...opts };
}

/** A shape of any kind in a box. */
export function shape(kind: TplShape["shape"], box: readonly [number, number, number, number], fill: string | null, opts: Partial<Omit<TplShape, "k" | "shape" | "box" | "fill">> = {}): TplShape {
  return { k: "shape", shape: kind, box, fill, ...opts };
}

/** A circle centred at (cx, cy), `side` × the file width across (stays round on every format). */
export function disc(cx: number, cy: number, side: number, fill: string | null, opts: Partial<Omit<TplShape, "k" | "shape" | "sq" | "fill">> = {}): TplShape {
  return { k: "shape", shape: "ellipse", sq: [cx, cy, side], fill, ...opts };
}

/** The whole file in one colour (into the bleed), bound to brand colour 1 unless `bind` says otherwise. */
export function fullBleed(fill: string, bind: StudioColorFieldKey | null = "brandColor1"): TplShape {
  return rect([0, 0, 1, 1], fill, bind ? { bindColor: bind } : {});
}

/** A light tint of a brand colour over an area (airy with any logo colour). */
export function tint(box: readonly [number, number, number, number], fill: string, opacity = 0.12, bind: StudioColorFieldKey = "brandColor1"): TplShape {
  return { k: "shape", shape: "rect", box, fill, opacity, bindColor: bind };
}

/** The customer's photo spot (filled from «Fotografie»; an empty spot is not printed). Put a tint + {@link photoHint} under it. */
export function photo(box: readonly [number, number, number, number], mask: TplPhoto["mask"] = "rect", opts: Partial<Omit<TplPhoto, "k" | "box" | "mask">> = {}): TplPhoto {
  return { k: "photo", box, mask, ...opts };
}

/** A round photo spot centred at (cx, cy), `side` × the file width across. */
export function roundPhoto(cx: number, cy: number, side: number, opts: Partial<Omit<TplPhoto, "k" | "sq" | "mask">> = {}): TplPhoto {
  return { k: "photo", sq: [cx, cy, side], mask: "circle", ...opts };
}

/**
 * «Photo here» hint centred at (cx, cy), `w` × the file width wide: a sun and
 * two hills in the brand colour, faint, never printed (a photo covers it).
 */
export function photoHint(cx: number, cy: number, w: number, fill: string, bind: StudioColorFieldKey = "brandColor1", r = 1.41): TplShape[] {
  // Heights in shares of the HEIGHT: the file is `r` × taller than wide (√2, DL ≈ 2.08).
  const h: number = (w * 0.62) / r;
  const x0: number = cx - w / 2;
  const y0: number = cy - h / 2;
  const o = { bindColor: bind, sample: true } as const;
  return [
    { k: "shape", shape: "ellipse", sq: [x0 + w * 0.74, y0 + h * 0.2, w * 0.2], fill, opacity: 0.4, ...o },
    { k: "shape", shape: "triangle", box: [x0, y0 + h * 0.25, w * 0.66, h * 0.75], fill, opacity: 0.4, ...o },
    { k: "shape", shape: "triangle", box: [x0 + w * 0.4, y0 + h * 0.48, w * 0.6, h * 0.52], fill, opacity: 0.55, ...o },
  ];
}

/**
 * The logo spot; with no logo a monogram (company initials on a brand disc,
 * in the middle of the box) or nothing. The logo itself is fitted whole into
 * the box, kept to its left / right side when the box sits left / right.
 */
export function flyerLogo(box: readonly [number, number, number, number], fallback: "monogram" | "none" = "monogram", mono: MonogramOpts = {}, r = 1.41): TplPhoto {
  if (fallback === "none") return logoOr(box, "none");
  // Square in shares of the width (the file is `r` × taller than wide).
  const side: number = Math.min(box[2], box[3] * r);
  const cx: number = mono.ring || box[0] + box[2] / 2 > 0.6 ? box[0] + box[2] - side / 2 : box[0] + box[2] / 2 < 0.4 ? box[0] + side / 2 : box[0] + box[2] / 2;
  const cy: number = box[1] + box[3] / 2;
  const bind: StudioColorFieldKey | null = mono.bindColor === undefined ? "brandColor1" : mono.bindColor;
  const discLayer: TplShape = { k: "shape", shape: mono.shape ?? "ellipse", sq: [cx, cy, side], fill: mono.fill ?? NAVY, ...(bind ? { bindColor: bind } : {}) };
  return logoOr(box, [
    discLayer,
    {
      k: "text",
      cx,
      cy,
      w: side * 0.9,
      size: side * 0.36,
      font: mono.font ?? "Montserrat",
      color: mono.ink ?? WHITE,
      text: L("", "", ""),
      initials: true,
      ls: 0.04,
      ...(mono.inkBindColor ? { bindColor: mono.inkBindColor } : {}),
    },
  ]);
}

/** A column of wrapped texts in the box [x, y, w, h] (x is the left edge for left align, the middle for center, the right edge for right). */
export function flow(x: number, y: number, w: number, h: number, items: TplFlowItem[], opts: Partial<Omit<TplFlow, "k" | "x" | "y" | "w" | "h" | "items">> = {}): TplFlow {
  return { k: "flow", x, y, w, h, items, ...opts };
}

type ItemOpts = Partial<Omit<TplFlowItem, "size" | "font" | "color">>;

/** One text of a flow bound to a flyer field. */
export function item(bind: SmartTextKey, size: number, font: StudioTemplateFont, color: string, opts: ItemOpts = {}): TplFlowItem {
  return { bind, size, font, color, ...opts };
}

/** The headline (always kept: its sample shows until the customer types it). */
export function headline(size: number, font: StudioTemplateFont, color: string, opts: ItemOpts = {}): TplFlowItem {
  return { bind: "headline", size, font, color, bold: true, lh: 1.05, keep: true, ...opts };
}

/** The bullet list (one line of the field per item, with `marker`). */
export function bullets(size: number, font: StudioTemplateFont, color: string, marker = "•", opts: ItemOpts = {}): TplFlowItem {
  return { bind: "bullets", size, font, color, list: marker, lh: 1.4, ...opts };
}

/** A free text of the template the customer may rewrite in the short edit («Meniu», «Programează-te»…). */
export function slotText(slot: string, value: StudioLocalized, size: number, font: StudioTemplateFont, color: string, opts: ItemOpts = {}): TplFlowItem {
  return { slot, text: value, size, font, color, keep: true, ...opts };
}

/** Contact lines (single line each, icons optional), sizes ≥ 0.03. */
export function contacts(
  size: number,
  font: StudioTemplateFont,
  color: string,
  opts: { keys?: SmartTextKey[]; icons?: boolean; bindColor?: StudioColorFieldKey } = {},
): TplStackRow[] {
  const keys: SmartTextKey[] = opts.keys ?? ["phone", "site", "address"];
  return keys.map((k) => ({
    bind: k,
    size,
    font,
    color,
    ...(opts.icons && CONTACT_ICON[k] ? { icon: CONTACT_ICON[k] } : {}),
    ...(opts.bindColor ? { bindColor: opts.bindColor } : {}),
  }));
}

/** The 5 flyer backs (`flyerTemplates/backs.ts`). */
export const FLYER_BACK_IDS = ["flyer-back-logo", "flyer-back-prices", "flyer-back-contacts", "flyer-back-coupon", "flyer-back-steps"] as const;
export type FlyerBackId = (typeof FLYER_BACK_IDS)[number];

/** A flyer front: its style, purposes, the back that goes with it; `dl` = its own layout for the tall DL file. */
export function flyerFront(
  id: string,
  name: StudioLocalized,
  meta: { style: CardStyle; purposes: FlyerPurpose[]; back: FlyerBackId },
  background: string | null,
  layers: TplLayer[],
  dl?: TplLayer[],
): StudioTemplate {
  return { id, occasion: "business", name, background, layouts: { flyer: layers, ...(dl ? { flyerDl: dl } : {}) }, side: "front", style: meta.style, purposes: meta.purposes, back: meta.back };
}

/** A flyer back. */
export function flyerBack(id: FlyerBackId, name: StudioLocalized, background: string | null, layers: TplLayer[], dl?: TplLayer[]): StudioTemplate {
  return { id, occasion: "business", name, background, layouts: { flyer: layers, ...(dl ? { flyerDl: dl } : {}) }, side: "back" };
}

export type { TplFlowItem, TplFlow };
export { row as stackRow };
export type { TplLayer };
