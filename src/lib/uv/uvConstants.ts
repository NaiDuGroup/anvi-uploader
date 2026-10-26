/** Who supplies the item for a UV line. */
export const UV_ITEM_SOURCES = ["stock", "client"] as const;
export type UvItemSource = (typeof UV_ITEM_SOURCES)[number];

/** Where a print sits on the item; «other» takes a free-text label. */
export const UV_PLACEMENTS = ["front", "back", "side", "top", "other"] as const;
export type UvPlacement = (typeof UV_PLACEMENTS)[number];

/** `StockCategory.printMethods` entry that makes a category printable with UV. */
export const UV_PRINT_METHOD = "uv";

/** `OrderLine.productType` of UV lines. */
export const UV_PRODUCT_TYPE = "uv_print";

export const UV_MAX_ZONES = 6;
export const UV_MAX_PIECES = 5000;
export const UV_MAX_WHITE_LAYERS = 3;
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
