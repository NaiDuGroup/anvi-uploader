import type { StudioLocalized } from "../i18n";
import type { StudioTemplate, StudioTemplateFont, TplLayer, TplPhoto, TplQr, TplShape, TplText } from "../templates";

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
