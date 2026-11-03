/** Garment families sold with DTF transfers (derived from the stock category code). */
export const GARMENT_KINDS = [
  "tshirt",
  "polo",
  "bodysuit",
  "socks",
  "cap",
  "hoodie",
  "bag",
  "underwear",
  "other",
] as const;
export type GarmentKind = (typeof GARMENT_KINDS)[number];

/**
 * Where a transfer is pressed on the garment (picker order). Left / right are
 * the wearer's. `front` / `back` are the full (A3) prints; older lines used
 * them for any front / back print.
 */
export const DTF_PLACEMENTS = [
  "front",
  "front_mid",
  "chest_center",
  "chest_across",
  "chest_left",
  "chest_right",
  "sleeve_left",
  "sleeve_right",
  "back",
  "back_mid",
  "nape",
  "other",
] as const;
export type DtfPlacement = (typeof DTF_PLACEMENTS)[number];

/** Who supplies the garment for a DTF line. */
export const DTF_GARMENT_SOURCES = ["stock", "client"] as const;
export type DtfGarmentSource = (typeof DTF_GARMENT_SOURCES)[number];

/**
 * Files of a DTF line carry their print zone in `File.paperType` as
 * `dtf:<zoneId>` so the workshop can match artwork to transfers.
 */
const DTF_ZONE_FILE_PREFIX = "dtf:";

export function dtfZoneFilePaperType(zoneId: string): string {
  return `${DTF_ZONE_FILE_PREFIX}${zoneId}`;
}

export function dtfZoneIdFromPaperType(paperType: string | null | undefined): string | null {
  if (!paperType || !paperType.startsWith(DTF_ZONE_FILE_PREFIX)) return null;
  const id = paperType.slice(DTF_ZONE_FILE_PREFIX.length);
  return id.length > 0 ? id : null;
}

export const DTF_MAX_ZONES = 6;
/** Free-text place of an «other» zone («левая штанина», «центр шторы»). */
export const DTF_MAX_PLACEMENT_NOTE = 80;
export const DTF_MAX_SIZES = 20;
export const DTF_MAX_PIECES = 5000;
/** Larger runs are packed per zone and scaled, keeping the packer fast. */
export const DTF_PACK_TILE_LIMIT = 240;
