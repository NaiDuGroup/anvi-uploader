import { shopNumText } from "./sizes";
import { discountedPrice } from "@/lib/dtf/dtfSettings";
import type { ShopDtfItemZone, ShopDtfPlacement, ShopDtfZoneLine, ShopPrintDiscount, ShopPrintOption } from "./types";

/**
 * T-shirt print picker → DTF zones of a quote line. The visitor picks a
 * price-list format for the front and/or the back; the placement follows the
 * size (a logo sits on the left chest, an A6/A5 in the chest centre, A4/A3
 * across the front), so the workshop knows where to press it.
 */

export type ShirtSide = "front" | "back";

export interface ShirtPrintSelection {
  front: string | null;
  back: string | null;
}

/** Largest side ≤ 10 cm = logo, ≤ 21 cm = chest print, else the full front. */
export function frontPlacementFor(print: Pick<ShopPrintOption, "widthCm" | "heightCm">): ShopDtfPlacement {
  const longest: number = Math.max(print.widthCm, print.heightCm);
  if (longest <= 10) return "chest_left";
  if (longest <= 21) return "chest_center";
  return "front";
}

export function shirtZones(selection: ShirtPrintSelection, prints: readonly ShopPrintOption[]): ShopDtfZoneLine[] {
  const zones: ShopDtfZoneLine[] = [];
  const front = prints.find((p) => p.presetId === selection.front);
  if (front) zones.push({ id: "front", placement: frontPlacementFor(front), presetId: front.presetId });
  const back = prints.find((p) => p.presetId === selection.back);
  if (back) zones.push({ id: "back", placement: "back", presetId: back.presetId });
  return zones;
}

/**
 * Bag / toy print picker → DTF zones: each picked zone is an «other» place
 * with its note («Сумка: лицевая сторона»), as the studio wizard saves zones
 * of items that are not tops.
 */
export function itemZones(
  selection: ShirtPrintSelection,
  zones: readonly ShopDtfItemZone[],
  prints: readonly ShopPrintOption[],
): ShopDtfZoneLine[] {
  const out: ShopDtfZoneLine[] = [];
  for (const z of zones) {
    const print = prints.find((p) => p.presetId === selection[z.side]);
    if (print) out.push({ id: z.side, placement: "other", placementNote: z.note, presetId: print.presetId });
  }
  return out;
}

/** Staff note of the cap logo zone (as the studio wizard saves caps: an «other» place with a note). */
export const CAP_ZONE_NOTE = "Кепка: спереди";

/**
 * Cap logo → DTF zone: the exact logo size (9×5, priced as the logo format)
 * on the cap front. Caps have no T-shirt places, so the zone is «other» with
 * a note, as the studio wizard saves it — never «Полный перед».
 */
export function capZones(zone: { widthCm: number; heightCm: number }): ShopDtfZoneLine[] {
  return [
    {
      id: "front",
      placement: "other",
      placementNote: CAP_ZONE_NOTE,
      presetId: null,
      widthCm: zone.widthCm,
      heightCm: zone.heightCm,
    },
  ];
}

/**
 * Frame of a print on the product photo (percent of the photo width, top
 * offset): a T-shirt chest is ~46 % of a square photo wide for A3 (30 cm).
 */
export function printFrame(print: Pick<ShopPrintOption, "widthCm" | "heightCm">, side: ShirtSide) {
  const cmToPct = 46 / 30;
  const placement: ShopDtfPlacement = side === "back" ? "back" : frontPlacementFor(print);
  return {
    widthPct: Math.round(print.widthCm * cmToPct * 10) / 10,
    aspect: `${print.widthCm} / ${print.heightCm}`,
    leftPct: placement === "chest_left" ? 58 : 50,
    topPct: placement === "chest_left" || placement === "chest_center" ? 30 : 28,
  };
}

/** Rough print resolution of an image at a size: pixels per inch on its best-fitting orientation. */
export function effectiveDpi(px: { width: number; height: number }, cm: { widthCm: number; heightCm: number }): number {
  const inchW: number = cm.widthCm / 2.54;
  const inchH: number = cm.heightCm / 2.54;
  const a: number = Math.min(px.width / inchW, px.height / inchH);
  const b: number = Math.min(px.height / inchW, px.width / inchH);
  return Math.round(Math.max(a, b));
}

export const SHOP_LOW_DPI = 150;

/**
 * Run discount (%) for `quantity` pieces: the step with the largest minimum
 * the run reaches (as `dtfRunDiscountPct` on the server).
 */
export function printDiscountPct(discount: ShopPrintDiscount | null | undefined, quantity: number): number {
  let pct = 0;
  let bestMin = 0;
  for (const s of discount?.steps ?? []) {
    if (s.minQty > 0 && quantity >= s.minQty && s.minQty >= bestMin) {
      bestMin = s.minQty;
      pct = s.pct;
    }
  }
  return pct;
}

/**
 * What one print of a format adds per piece at `quantity` pieces: the list
 * price less the run discount (rounded like the server) plus the press fee.
 * Matches the quote's «Imprimare» + «Presare» rows divided by the pieces.
 */
export function printUnitPrice(
  print: Pick<ShopPrintOption, "price">,
  quantity: number,
  discount: ShopPrintDiscount | null | undefined,
  pressFeeMdl = 0,
): number {
  const pct: number = printDiscountPct(discount, Math.max(1, quantity));
  return discountedPrice(print.price, pct, discount?.roundTo ?? 0) + pressFeeMdl;
}

/** Smallest run that gets any print discount (null = none). */
export function firstDiscountQty(discount: ShopPrintDiscount | null | undefined): number | null {
  const mins = (discount?.steps ?? []).filter((s) => s.minQty > 0 && s.pct > 0).map((s) => s.minQty);
  return mins.length ? Math.min(...mins) : null;
}

const LOGO_WORD: Record<"ro" | "ru" | "en", string> = { ro: "Logo", ru: "Лого", en: "Logo" };

export function cmText(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/**
 * Price-list label (from the DB, written by staff: «Logo 10×10», «A4 21×30»)
 * in the shop language: a logo format is named in that language with its
 * size from `widthCm`/`heightCm` («Лого 10×10»); A-formats read the same in
 * every language; any other label is kept.
 */
export function shopPresetLabel(
  preset: { label: string; widthCm: number; heightCm: number },
  lang: "ro" | "ru" | "en",
): string {
  const label: string = preset.label.trim();
  if (/^(logo|лого|логотип)\b/i.test(label)) {
    return `${LOGO_WORD[lang]} ${shopNumText(preset.widthCm, lang)}×${shopNumText(preset.heightCm, lang)}`;
  }
  return label;
}

