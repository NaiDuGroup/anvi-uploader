import type { SmartTextKey } from "../document";
import type { StudioLocalized } from "../i18n";
import type { StudioColorFieldKey } from "../smartFields";
import type { CardStyle, FlyerPurpose, StudioTemplate, StudioTemplateFont, TplLayer, TplShape } from "../templates";
import { contacts, flow, flyerBack, flyerFront, flyerLogo, item, photo, photoHint, rect, stack, tint, type FlyerBackId, type MonogramOpts, type TplFlowItem } from "./helpers";
import type { TplPhoto } from "../templates";

/**
 * Layout kit of the flyer families: every template is written ONCE as a
 * function of the file's proportions ({@link G}) and drawn twice — for the
 * ISO files (A6 / A5 / A4, height ≈ 1.41 × width) and for DL (≈ 2.08 ×).
 * Vertical sizes that must keep their look (a disc, a pill, a bar) are given
 * in WIDTH units and converted with `g.v()`; areas that may grow (a photo, a
 * text column) take shares of the height, picked per format with `g.pick()`.
 */
export interface G {
  /** Height / width of the file. */
  r: number;
  dl: boolean;
  /** Safe band top / bottom (shares of the height) on these formats. */
  y0: number;
  y1: number;
  /** The ISO or the DL value. */
  pick<T>(iso: T, dl: T): T;
  /** A length in width units as a share of the height. */
  v(u: number): number;
}

const mk = (r: number, dl: boolean): G => ({ r, dl, y0: dl ? 0.035 : 0.05, y1: dl ? 0.965 : 0.95, pick: (a, b) => (dl ? b : a), v: (u) => u / r });
export const G_ISO: G = mk(1.41, false);
export const G_DL: G = mk(2.08, true);

/** Left / right edge of the text column (the safe band). */
export const X0 = 0.07;
export const X1 = 0.93;
export const COL = X1 - X0;

type Box = readonly [number, number, number, number];

/** A flyer front written once for ISO and DL. */
export function front(
  id: string,
  name: StudioLocalized,
  meta: { style: CardStyle; purposes: FlyerPurpose[]; back: FlyerBackId },
  background: string | null,
  lay: (g: G) => TplLayer[],
): StudioTemplate {
  return flyerFront(id, name, meta, background, lay(G_ISO), lay(G_DL));
}

/** A flyer back written once for ISO and DL. */
export function back(id: FlyerBackId, name: StudioLocalized, background: string | null, lay: (g: G) => TplLayer[]): StudioTemplate {
  return flyerBack(id, name, background, lay(G_ISO), lay(G_DL));
}

/**
 * A photo spot that covers `box`, with a light brand tint and the «photo
 * here» hint under it (neither prints once a photo is in; without one the
 * tint keeps the area designed). `base` replaces the tint with a solid fill.
 */
export function photoSpot(
  g: G,
  box: Box,
  fill: string,
  opts: { bind?: StudioColorFieldKey; opacity?: number; base?: string; baseBind?: StudioColorFieldKey | null; mask?: TplPhoto["mask"]; rot?: number; hintFill?: string } = {},
): TplLayer[] {
  const bind: StudioColorFieldKey = opts.bind ?? "brandColor1";
  const under: TplShape = opts.base
    ? { k: "shape", shape: opts.mask === "rounded" ? "rounded" : "rect", box, fill: opts.base, ...(opts.baseBind ? { bindColor: opts.baseBind } : {}), ...(opts.rot ? { rot: opts.rot } : {}) }
    : { ...tint(box, fill, opts.opacity ?? 0.14, bind), ...(opts.mask === "rounded" ? { shape: "rounded" as const } : {}), ...(opts.rot ? { rot: opts.rot } : {}) };
  const w: number = Math.min(0.3, box[2] * 0.42);
  return [under, ...photoHint(box[0] + box[2] / 2, box[1] + box[3] / 2, w, opts.hintFill ?? fill, bind, g.r), photo(box, opts.mask ?? "rect", opts.rot ? { rot: opts.rot } : {})];
}

/** A round photo spot (centre, diameter in width units) with its tint and hint. */
export function roundSpot(g: G, cx: number, cy: number, side: number, fill: string, bind: StudioColorFieldKey = "brandColor1", opacity = 0.16, ring?: { color: string; mm: number; gap?: number; bind?: StudioColorFieldKey }): TplLayer[] {
  return [
    { k: "shape", shape: "ellipse", sq: [cx, cy, side], fill, opacity, bindColor: bind },
    ...photoHint(cx, cy, side * 0.5, fill, bind, g.r),
    { k: "photo", sq: [cx, cy, side], mask: "circle" },
    // A ring around the photo (a stroke: no filled disc behind it).
    ...(ring ? [{ k: "shape", shape: "ellipse", sq: [cx, cy, side + (ring.gap ?? 0)], fill: null, stroke: ring.color, strokeMm: ring.mm } as TplShape] : []),
  ];
}

/** The logo spot (fitted whole into the box), no stand-in by default. */
export function logo(g: G, box: Box, fallback: "monogram" | "none" = "none", mono: MonogramOpts = {}): TplPhoto {
  return flyerLogo(box, fallback, mono, g.r);
}

/**
 * The contact bar at the foot: a band into the bleed (`h` in width units)
 * with the phone (bold) on the left and the site on the right.
 */
export function contactBar(
  g: G,
  o: { fill: string; bind?: StudioColorFieldKey | null; ink: string; inkBind?: StudioColorFieldKey; font: StudioTemplateFont; size?: number; h?: number; left?: SmartTextKey[]; right?: SmartTextKey[]; icons?: boolean; iconColor?: string; iconBind?: StudioColorFieldKey },
): TplLayer[] {
  const h: number = g.v(o.h ?? 0.14);
  const ic = { ...(o.iconColor ? { iconColor: o.iconColor } : {}), ...(o.iconBind ? { iconBindColor: o.iconBind } : {}) };
  const size: number = o.size ?? 0.034;
  const cy: number = Math.min(1 - h / 2 - 0.004, g.y1 - g.v(size * 0.75));
  const bar = rect([0, 1 - h, 1, h], o.fill, o.bind === null ? {} : { bindColor: o.bind ?? "brandColor1" });
  const left = contacts(size, o.font, o.ink, { keys: o.left ?? ["phone"], icons: o.icons ?? true, ...(o.inkBind ? { bindColor: o.inkBind } : {}) }).map((r, i) => (i === 0 ? { ...r, bold: true } : r));
  const right = contacts(size, o.font, o.ink, { keys: o.right ?? ["site"], icons: o.icons ?? true, ...(o.inkBind ? { bindColor: o.inkBind } : {}) });
  return [
    bar,
    stack(X0, cy, COL * 0.48, left, { anchor: "middle", lh: 1.35, ...ic }),
    stack(X1, cy, COL * 0.5, right, { align: "right", anchor: "middle", lh: 1.35, ...ic }),
  ];
}

/** Contacts under a thin rule: two columns (left / right aligned, with icons), bottom-anchored at the safe line. */
export function contactColumns(
  g: G,
  o: { ink: string; font: StudioTemplateFont; size?: number; left?: SmartTextKey[]; right?: SmartTextKey[]; iconColor?: string; iconBind?: StudioColorFieldKey; bottom?: number },
): TplLayer[] {
  const size: number = o.size ?? 0.032;
  const y: number = o.bottom ?? g.y1;
  const ic = { ...(o.iconColor ? { iconColor: o.iconColor } : {}), ...(o.iconBind ? { iconBindColor: o.iconBind } : {}) };
  return [
    stack(X0, y, COL * 0.46, contacts(size, o.font, o.ink, { keys: o.left ?? ["phone", "email"], icons: true }).map((r, i) => (i === 0 ? { ...r, bold: true } : r)), { anchor: "bottom", lh: 1.45, ...ic }),
    stack(X1, y, COL * 0.52, contacts(size, o.font, o.ink, { keys: o.right ?? ["site", "address"], icons: true }), { align: "right", anchor: "bottom", lh: 1.45, ...ic }),
  ];
}

/** Centred contact lines (no icons: they only sit beside left / right aligned lines). */
export function contactsCentered(g: G, o: { ink: string; font: StudioTemplateFont; size?: number; keys?: SmartTextKey[]; bottom?: number; bindColor?: StudioColorFieldKey; boldFirst?: boolean }): TplLayer {
  const rows = contacts(o.size ?? 0.032, o.font, o.ink, { keys: o.keys ?? ["phone", "site", "address"], ...(o.bindColor ? { bindColor: o.bindColor } : {}) }).map((r, i) => (i === 0 && o.boldFirst !== false ? { ...r, bold: true } : r));
  return stack(0.5, o.bottom ?? g.y1, COL, rows, { align: "center", anchor: "bottom", lh: 1.45 });
}

/**
 * A badge for the offer («−20%», «de la 99 lei»): a disc (`side` in width
 * units) with the offer in it; both disappear without an offer.
 */
export function offerDisc(g: G, cx: number, cy: number, side: number, fill: string, ink: string, font: StudioTemplateFont, o: { bind?: StudioColorFieldKey; inkBind?: StudioColorFieldKey; size?: number; ring?: string } = {}): TplLayer[] {
  const hh: number = g.v(side);
  return [
    { k: "shape", shape: "ellipse", sq: [cx, cy, side], fill, bindColor: o.bind ?? "brandColor2", showIf: "offer", ...(o.ring ? { stroke: o.ring, strokeMm: 1.4 } : {}) },
    flow(cx, cy - hh * 0.36, side * 0.8, hh * 0.72, [item("offer", o.size ?? side * 0.26, font, ink, { bold: true, lh: 1, ...(o.inkBind ? { bindColor: o.inkBind } : {}) })], { align: "center", anchor: "middle", showIf: "offer" }),
  ];
}

/** A pill / box with one field in it (date, offer…), both gone when the field is empty. */
export function fieldPill(
  g: G,
  field: SmartTextKey,
  box: Box,
  fill: string,
  textItem: TplFlowItem,
  o: { bind?: StudioColorFieldKey | null; shape?: "rounded" | "rect"; align?: "left" | "center"; pad?: number } = {},
): TplLayer[] {
  const pad: number = o.pad ?? 0.03;
  const align = o.align ?? "center";
  return [
    { k: "shape", shape: o.shape ?? "rounded", box, fill, ...(o.bind === null ? {} : { bindColor: o.bind ?? "brandColor2" }), showIf: field },
    flow(align === "center" ? box[0] + box[2] / 2 : box[0] + pad, box[1] + g.v(0.008), box[2] - pad * 2, box[3] - g.v(0.016), [textItem], { align, anchor: "middle", showIf: field }),
  ];
}

/** A dashed rectangle (cut-out coupon): short bars along the four edges. */
export function dashedBox(g: G, box: Box, color: string, o: { dash?: number; thick?: number; bind?: StudioColorFieldKey } = {}): TplShape[] {
  // One dashed outline (dash and line width in mm on an A5-sized file: ~4 mm dashes, ~0.8 mm line).
  void g;
  const dashMm: number = (o.dash ?? 0.026) * 152;
  const strokeMm: number = (o.thick ?? 0.005) * 152;
  return [{ k: "shape", shape: "rect", box, fill: null, stroke: color, strokeMm, dashMm, ...(o.bind ? { bindColor: o.bind } : {}) }];
}

/** A thin horizontal rule (`t` in width units). */
export function rule(g: G, x: number, y: number, w: number, fill: string, o: { t?: number; bind?: StudioColorFieldKey; showIf?: SmartTextKey } = {}): TplShape {
  return rect([x, y, w, g.v(o.t ?? 0.004)], fill, { ...(o.bind ? { bindColor: o.bind } : {}), ...(o.showIf ? { showIf: o.showIf } : {}) });
}

/** A fake vertical gradient: `n` bands of `fill`, each more opaque, from y0 to y1 (each under 0.6 so texts are judged on what is below). */
export function fade(y0: number, y1: number, fill: string, o: { n?: number; max?: number; bind?: StudioColorFieldKey } = {}): TplShape[] {
  const n: number = o.n ?? 6;
  const max: number = o.max ?? 0.55;
  const step: number = (y1 - y0) / n;
  return Array.from({ length: n }, (_, i) => rect([0, y0 + i * step, 1, step + 0.001], fill, { opacity: (max * (i + 1)) / n, ...(o.bind ? { bindColor: o.bind } : {}) }));
}

export type { Box };
