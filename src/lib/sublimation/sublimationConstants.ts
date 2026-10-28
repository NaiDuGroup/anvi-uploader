/** `StockCategory.printMethods` entry that makes a category printable with sublimation. */
export const SUBLIMATION_PRINT_METHOD = "sublimation";

/** `OrderLine.productType` of sublimation lines. */
export const SUBLIMATION_PRODUCT_TYPE = "sublimation_print";

/** Category of the mug blanks; the «Кружка» product writes off Epson consumables by its norm. */
export const MUGS_CATEGORY_CODE = "mugs";

export const SUBLIMATION_MAX_PIECES = 5000;

/**
 * Artwork files of a sublimation line carry this `File.paperType` (no print
 * zones: the whole transfer goes on the blank).
 */
export const SUBLIMATION_FILE_PAPER_TYPE = "sublimation";

export function isSublimationFilePaperType(paperType: string | null | undefined): boolean {
  return paperType === SUBLIMATION_FILE_PAPER_TYPE;
}

/** Who supplies the item for a sublimation line: a stock blank or the client's own item. */
export const SUBLIMATION_ITEM_SOURCES = ["stock", "client"] as const;
export type SublimationItemSource = (typeof SUBLIMATION_ITEM_SOURCES)[number];

export const SUBLIMATION_MAX_DESCRIPTION = 200;
export const SUBLIMATION_MAX_NOTES = 500;
/** Largest print side on a client's item (cm). */
export const SUBLIMATION_MAX_SIZE_CM = 200;
