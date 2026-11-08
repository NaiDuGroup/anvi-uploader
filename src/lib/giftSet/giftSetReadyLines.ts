/**
 * Lines of a ready set (C «Ручка + блокнот + термос») — one per zone:
 * notebook → `notebook` line, pen → `pen` line (the set's own items, «другой»
 * — never our stock), anything else (thermos) → `uv_print` client-item line
 * with one zone. Pure: the wizard builds the inputs, the server the snapshots.
 */
import { cmToPx } from "@/lib/printDimensions";
import type { NotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import type { PenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import type { UvLineInput } from "@/lib/uv/uvLineInput";
import { GIFT_SET_PRINT_DPI, type GiftSetZone } from "./giftSet";

/** The set's colour variant as the server reads it. */
export interface ReadySetVariant {
  sku: string;
  /** «чёрный». */
  colourLabel: string | null;
  colorHex: string | null;
}

const FALLBACK_HEX = "#1f2937";

function nameRu(zone: Pick<GiftSetZone, "label">, colour: string | null): string {
  return `${zone.label} из набора${colour ? ` · ${colour}` : ""}`;
}

/** Description of a UV zone line («Термос из набора · чёрный»). */
export function readySetUvDescription(zone: Pick<GiftSetZone, "label">, colour: string | null): string {
  return nameRu(zone, colour);
}

/**
 * UV input of a zone printed directly on the set item (thermos): a client
 * item (the set item is written off by the set, not by the line), one zone
 * of the template's size with one white layer (coloured metal).
 */
export function readySetUvInput(zone: GiftSetZone, quantity: number, colour: string | null): UvLineInput {
  return {
    source: "client",
    technique: "direct",
    clientItem: { description: readySetUvDescription(zone, colour) },
    quantity,
    zones: [
      {
        id: zone.id,
        placement: "other",
        placementLabel: zone.label,
        widthCm: zone.widthCm,
        heightCm: zone.heightCm,
        whiteLayers: 1,
        varnish: false,
        primer: false,
      },
    ],
  };
}

/**
 * Notebook snapshot of the set's notebook: groups by the set variant SKU on
 * the board («Блокнот из набора · чёрный»), print size = the zone. «Другой»
 * (no catalog item, no purchase cost of its own: the set item carries it).
 */
export function readySetNotebookSnapshot(zone: GiftSetZone, v: ReadySetVariant, id: string): NotebookProductSnapshot {
  const hex = v.colorHex ?? FALLBACK_HEX;
  return {
    id,
    sku: v.sku,
    nameRu: nameRu(zone, v.colourLabel),
    nameRo: `Agendă din set${v.colourLabel ? ` · ${v.colourLabel}` : ""}`,
    nameEn: `Gift set notebook${v.colourLabel ? ` · ${v.colourLabel}` : ""}`,
    imageUrl: null,
    coverColorHex: hex,
    strapColorHex: hex,
    bookmarkColorHex: hex,
    paperKind: "ruled",
    printWidthCm: zone.widthCm,
    printHeightCm: zone.heightCm,
    printDpi: GIFT_SET_PRINT_DPI,
    has3dPreview: false,
    isOther: true,
    sellPrice: null,
    purchaseCost: 0,
  };
}

/** Pen snapshot of the set's pen («Ручка из набора · чёрный»), print size = the zone. */
export function readySetPenSnapshot(zone: GiftSetZone, v: ReadySetVariant): PenProductSnapshot {
  const hex = v.colorHex ?? FALLBACK_HEX;
  return {
    sku: v.sku,
    nameRu: nameRu(zone, v.colourLabel),
    nameRo: `Pix din set${v.colourLabel ? ` · ${v.colourLabel}` : ""}`,
    nameEn: `Gift set pen${v.colourLabel ? ` · ${v.colourLabel}` : ""}`,
    imageUrl: null,
    bodyColorHex: hex,
    clipColorHex: "#c0c0c0",
    printWidthCm: zone.widthCm,
    printHeightCm: zone.heightCm,
    printDpi: GIFT_SET_PRINT_DPI,
    has3dPreview: false,
    sellPrice: null,
    dealerPrice: null,
    purchaseCost: 0,
  };
}

/** Pixel size a zone's artwork must have (notebook / pen zones: exact, like our notebooks and pens). */
export function readyZoneExpectedPx(zone: Pick<GiftSetZone, "widthCm" | "heightCm">): { width: number; height: number } {
  return { width: cmToPx(zone.widthCm, GIFT_SET_PRINT_DPI), height: cmToPx(zone.heightCm, GIFT_SET_PRINT_DPI) };
}
