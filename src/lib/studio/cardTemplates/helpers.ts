import type { SmartTextKey } from "../document";
import type { StudioLocalized } from "../i18n";
import type { StudioColorFieldKey } from "../smartFields";
import type { CardIcon, TplStack, TplStackRow } from "./stack";
import type { CardStyle, StudioIndustry, StudioTemplate, StudioTemplateFont, TplLayer, TplPhoto, TplQr, TplShape, TplText } from "../templates";

/**
 * Shared pieces of the business-card templates (one file per family).
 * Coordinates are shares of the whole 94 × 54 mm file (bleed included); the
 * safe band is 6 mm from the file edge, i.e. x ∈ [0.064, 0.936] and
 * y ∈ [0.111, 0.889] — every text, logo and QR stays inside it (the
 * template test checks it). Backgrounds and bands start at 0 / end at 1 so
 * they run into the bleed. Text size is a share of the card's short side
 * (54 mm): 0.046 ≈ 7 pt is the smallest the quality check accepts.
 *
 * Type-only imports from `../templates` (which imports this folder): no
 * runtime cycle.
 */

export const L = (ro: string, ru: string, en: string): StudioLocalized => ({ ro, ru, en });

/** Left edge of the safe band (share of the width) plus a hair. */
export const SAFE_X = 0.07;
export const SAFE_X_END = 0.93;

export const NAVY = "#14213d";
export const GOLD = "#c9a227";
export const CREAM = "#f6eee3";
export const INK = "#1d1d1f";
export const GREY = "#5b6880";
export const WHITE = "#ffffff";

export const S_NAME = L("Numele Prenumele", "Имя Фамилия", "Full Name");
export const S_TITLE = L("Funcția", "Должность", "Job title");
export const S_COMPANY = L("Compania", "Компания", "Company");
export const S_PHONE = L("+373 60 000 000", "+373 60 000 000", "+373 60 000 000");
export const S_EMAIL = L("email@companie.md", "email@kompania.md", "email@company.md");
export const S_SITE = L("www.companie.md", "www.kompania.md", "www.company.md");
export const S_ADDRESS = L("Str. Exemplu 1, Chișinău", "ул. Примерная 1, Кишинёв", "1 Example St, Chișinău");

type TextOpts = Partial<Omit<TplText, "k" | "cx" | "cy" | "w" | "size" | "font" | "color" | "text">>;

/** A text centred at (cx, cy), `w` wide. */
export function text(cx: number, cy: number, w: number, size: number, font: StudioTemplateFont, color: string, value: StudioLocalized, opts: TextOpts = {}): TplText {
  return { k: "text", cx, cy, w, size, font, color, text: value, ...opts };
}

/** A left-aligned text starting at `x` (share of the width). */
export function leftText(x: number, cy: number, w: number, size: number, font: StudioTemplateFont, color: string, value: StudioLocalized, opts: TextOpts = {}): TplText {
  return text(x + w / 2, cy, w, size, font, color, value, { align: "left", ...opts });
}

/** A filled rectangle [x, y, w, h] (shares); `brand` binds it to brand colour 1. */
export function rect(box: readonly [number, number, number, number], fill: string | null, opts: Partial<Omit<TplShape, "k" | "shape" | "box" | "fill">> = {}): TplShape {
  return { k: "shape", shape: "rect", box, fill, ...opts };
}

/** The whole file in one colour (runs into the bleed), bound to brand colour 1. */
export function fullBleed(fill: string): TplShape {
  return rect([0, 0, 1, 1], fill, { bindColor: "brandColor1" });
}

/** The customer's logo spot (empty until «Datele mele» has a logo; an empty spot is not printed). */
export function logo(box: readonly [number, number, number, number]): TplPhoto {
  return { k: "photo", box, mask: "rect", logo: true };
}

/** A contact QR (vCard from «Datele mele»), square of side `side` × the card height. */
export function vcardQr(cx: number, cy: number, side: number, color = NAVY, background: string | null = WHITE): TplQr {
  return { k: "qr", sq: [cx, cy, side], color, background, vcard: true };
}

/** A business-card template (front by default). */
export function cardTemplate(id: string, name: StudioLocalized, background: string | null, layers: TplLayer[], side: "front" | "back" = "front"): StudioTemplate {
  return { id, occasion: "business", name, background, layouts: { card: layers }, side };
}

/** A business-card front: its style, trades and the back that goes with it. */
export function cardFront(
  id: string,
  name: StudioLocalized,
  meta: { style: CardStyle; industries: StudioIndustry[]; back: CardBackId },
  background: string | null,
  layers: TplLayer[],
): StudioTemplate {
  return { ...cardTemplate(id, name, background, layers), style: meta.style, industries: meta.industries, back: meta.back };
}

/** The 8 backs (cardTemplates/backs.ts). */
export const CARD_BACK_IDS = [
  "card-back-logo",
  "card-back-qr",
  "card-back-loyalty",
  "card-back-appointment",
  "card-back-services",
  "card-back-map",
  "card-back-slogan",
  "card-back-pattern",
] as const;
export type CardBackId = (typeof CARD_BACK_IDS)[number];

// ─── Card kit: columns of details, icons, monograms ─────────────────────

export type { TplStack, TplStackRow, CardIcon } from "./stack";


/** Safe band of the file (shares): x 0.064…0.936, y 0.111…0.889; templates keep a hair inside. */
export const SAFE_Y = 0.13;
export const SAFE_Y_END = 0.87;

/** Contact lines with their icon. */
export const CONTACT_ICON: Partial<Record<SmartTextKey, CardIcon>> = { phone: "iconPhone", email: "iconMail", site: "iconWeb", address: "iconPin" };

/** A column of lines laid out from the details (empty optional lines close up). */
export function stack(x: number, y: number, w: number, rows: TplStackRow[], opts: Partial<Omit<TplStack, "k" | "x" | "y" | "w" | "rows">> = {}): TplStack {
  return { k: "stack", x, y, w, rows, ...opts };
}

/** One line of a column. */
export function row(bind: SmartTextKey, size: number, font: StudioTemplateFont, color: string, opts: Partial<Omit<TplStackRow, "bind" | "size" | "font" | "color">> = {}): TplStackRow {
  return { bind, size, font, color, ...opts };
}

/**
 * The contact lines (phone, e-mail, site, address by default), optionally
 * with icons; `size` ≥ 0.046 (7 pt).
 */
export function contactRows(
  size: number,
  font: StudioTemplateFont,
  color: string,
  opts: { keys?: SmartTextKey[]; icons?: boolean; bindColor?: StudioColorFieldKey; gap?: number } = {},
): TplStackRow[] {
  const keys: SmartTextKey[] = opts.keys ?? ["phone", "email", "site", "address"];
  return keys.map((k) => ({
    bind: k,
    size,
    font,
    color,
    ...(opts.icons && CONTACT_ICON[k] ? { icon: CONTACT_ICON[k] } : {}),
    ...(opts.bindColor ? { bindColor: opts.bindColor } : {}),
    ...(opts.gap ? { gap: opts.gap } : {}),
  }));
}

/**
 * The logo spot; once the customer typed details without a logo, a monogram
 * (initials on a brand-colour disc / square) or nothing (`fallback: []`).
 */
export interface MonogramOpts {
  shape?: "ellipse" | "rect" | "rounded";
  fill?: string;
  /** Brand colour of the disc (null: keep `fill`); brand colour 1 by default. */
  bindColor?: StudioColorFieldKey | null;
  ink?: string;
  inkBindColor?: StudioColorFieldKey;
  font?: StudioTemplateFont;
  /** A thin ring in the ink instead of a filled disc (initials on a brand band). */
  ring?: boolean;
}

export function logoOr(box: readonly [number, number, number, number], fallback: TplLayer[] | "monogram" | "none" = "monogram", mono: MonogramOpts = {}): TplPhoto {
  const layers: TplLayer[] =
    fallback === "none"
      ? []
      : fallback === "monogram"
        ? monogram(box, mono)
        : fallback;
  return { ...logo(box), fallback: layers };
}

/** Initials on a brand disc filling the square in the middle of `box` (a logo stand-in). */
export function monogram(
  box: readonly [number, number, number, number],
  o: MonogramOpts = {},
): TplLayer[] {
  // Square in mm: the box is in shares of 94 × 54 mm.
  const wMm: number = box[2] * 94;
  const hMm: number = box[3] * 54;
  const side: number = Math.min(wMm, hMm);
  const cx: number = box[0] + box[2] / 2;
  const cy: number = box[1] + box[3] / 2;
  const sq: [number, number, number, number] = [cx - side / 94 / 2, cy - side / 54 / 2, side / 94, side / 54];
  const bind: StudioColorFieldKey | null = o.bindColor === undefined ? "brandColor1" : o.bindColor;
  const disc: TplShape = o.ring
    ? { k: "shape", shape: o.shape ?? "ellipse", box: sq, fill: null, stroke: o.ink ?? WHITE, strokeMm: 0.35 }
    : { k: "shape", shape: o.shape ?? "ellipse", box: sq, fill: o.fill ?? NAVY, ...(bind ? { bindColor: bind } : {}) };
  const ini: TplText = {
    k: "text",
    cx,
    cy,
    w: (side * 0.9) / 94,
    size: (side / 54) * 0.36,
    font: o.font ?? "Montserrat",
    color: o.ink ?? WHITE,
    text: L("", "", ""),
    initials: true,
    ls: 0.04,
    ...(o.inkBindColor ? { bindColor: o.inkBindColor } : {}),
  };
  return [disc, ini];
}

/** A small filled shape (dot, square) — decoration. */
export function dot(cx: number, cy: number, side: number, fill: string, opts: Partial<Omit<TplShape, "k" | "sq" | "fill">> = {}): TplShape {
  return { k: "shape", shape: "ellipse", sq: [cx, cy, side], fill, ...opts };
}

/**
 * A light version of a brand colour over a large area (the colour at low
 * opacity on the white card): large areas stay airy with any logo colour.
 */
export function tint(box: readonly [number, number, number, number], fill: string, opacity = 0.12, bind: StudioColorFieldKey = "brandColor1", opts: Partial<Omit<TplShape, "k" | "box" | "fill" | "opacity" | "bindColor">> = {}): TplShape {
  return { k: "shape", shape: "rect", box, fill, opacity, bindColor: bind, ...opts };
}

/**
 * «Photo here» hint centred at (cx, cy): a sun and two hills, `sideMm` wide,
 * in the brand colour, faint. Shown in the gallery and the editor, never
 * printed (`sample`); a photo covers it.
 */
export function photoGlyph(cx: number, cy: number, sideMm: number, fill: string, bind: StudioColorFieldKey = "brandColor1"): TplShape[] {
  const w: number = sideMm / 94;
  const h: number = (sideMm * 0.62) / 54;
  const x0: number = cx - w / 2;
  const y0: number = cy - h / 2;
  const o = { bindColor: bind, sample: true } as const;
  return [
    { k: "shape", shape: "ellipse", sq: [x0 + w * 0.74, y0 + h * 0.2, (sideMm * 0.2) / 54], fill, opacity: 0.4, ...o },
    { k: "shape", shape: "triangle", box: [x0, y0 + h * 0.25, w * 0.66, h * 0.75], fill, opacity: 0.4, ...o },
    { k: "shape", shape: "triangle", box: [x0 + w * 0.4, y0 + h * 0.48, w * 0.6, h * 0.52], fill, opacity: 0.55, ...o },
  ];
}
