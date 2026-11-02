/**
 * Who supplies the item for a UV line: a stock item, the client's own item,
 * or none — UV-DTF stickers the client takes away.
 */
export const UV_ITEM_SOURCES = ["stock", "client", "stickers"] as const;
export type UvItemSource = (typeof UV_ITEM_SOURCES)[number];

/**
 * How the print reaches the item: straight from the UV printer, or UV-DTF —
 * printed on film A (two white layers, colour, varnish), laminated with film B
 * and stuck on as a sticker. UV-DTF is sold by the linear metre of film.
 */
export const UV_TECHNIQUES = ["direct", "transfer"] as const;
export type UvTechnique = (typeof UV_TECHNIQUES)[number];

/** UV-DTF prints two white layers (the operator may change it per zone). */
export const UV_DTF_WHITE_LAYERS = 2;

/** `StockItem.attributes` keys of a UV item's print included in its price («Параметры печати»). */
export const UV_PRINT_WIDTH_KEY = "printWidthCm";
export const UV_PRINT_HEIGHT_KEY = "printHeightCm";

/** Stock variants of the UV-DTF films, taken per linear metre (not loaded in a printer slot). */
export const UV_DTF_FILM_A_SKU = "UV-DTF-FILM-A";
export const UV_DTF_FILM_B_SKU = "UV-DTF-FILM-B";

/** Where a print sits on the item; «other» takes a free-text label. */
export const UV_PLACEMENTS = ["front", "back", "side", "top", "other"] as const;
export type UvPlacement = (typeof UV_PLACEMENTS)[number];

/** `StockCategory.printMethods` entry that makes a category printable with UV. */
export const UV_PRINT_METHOD = "uv";

/** `OrderLine.productType` of UV lines. */
export const UV_PRODUCT_TYPE = "uv_print";

export const UV_MAX_ZONES = 6;
export const UV_MAX_PIECES = 5000;
export const UV_MAX_WHITE_LAYERS = 5;
/** White underbase is the norm on UV: a new zone starts with one layer. */
export const UV_DEFAULT_WHITE_LAYERS = 1;

/**
 * Stock variant of the UV primer. It is wiped on by hand (not loaded in a
 * printer slot), so lines with primer take it from stock by this SKU.
 */
export const UV_PRIMER_SKU = "INK-UV-PRIMER";
export const UV_MAX_DESCRIPTION = 200;
export const UV_MAX_NOTES = 500;
export const UV_MAX_PLACEMENT_LABEL = 60;

/**
 * UV printer ink slots (`PrinterSlot.label`, case-insensitive) per head: CMYK
 * is spread over the four colour slots by their shares, white and varnish come
 * from their own slot.
 */
export const UV_INK_SLOT_LABELS = {
  cmyk: ["Cyan", "Magenta", "Yellow", "Black"],
  white: ["White"],
  varnish: ["Varnish"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Files of a UV line carry their print zone in `File.paperType` as
 * `uv:<zoneId>` so the workshop can match artwork to zones.
 */
const UV_ZONE_FILE_PREFIX = "uv:";

export function uvZoneFilePaperType(zoneId: string): string {
  return `${UV_ZONE_FILE_PREFIX}${zoneId}`;
}

export function uvZoneIdFromPaperType(paperType: string | null | undefined): string | null {
  if (!paperType || !paperType.startsWith(UV_ZONE_FILE_PREFIX)) return null;
  const id = paperType.slice(UV_ZONE_FILE_PREFIX.length);
  return id.length > 0 ? id : null;
}
