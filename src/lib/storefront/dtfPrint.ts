import type { ShopDtfPlacement, ShopDtfZoneLine, ShopPrintOption } from "./types";

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

export function capZones(zone: { widthCm: number; heightCm: number }): ShopDtfZoneLine[] {
  return [{ id: "front", placement: "front", presetId: null, widthCm: zone.widthCm, heightCm: zone.heightCm }];
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
