import type { ShopQuoteLine, ShopSimpleKind } from "./types";

/**
 * Which storefront lines need a design file. One rule for the product page,
 * the cart, the checkout page and `POST /api/shop/checkout` (the server
 * answers `lines.N.files: required` for these kinds without a file).
 *
 * Mug, notebook and pen: at least one file — the order pipeline reads the run
 * from the files. UV-printed stock item (quote kind `uv`): the print is
 * included in its price, so the order needs the artwork. DTF (T-shirts, caps):
 * the file may follow after the order.
 */
export const SHOP_FILE_REQUIRED_KINDS = ["mug", "notebook", "pen", "uv"] as const;

const REQUIRED: ReadonlySet<string> = new Set(SHOP_FILE_REQUIRED_KINDS);

/** `kind` is a quote line kind (`mug`, `uv`, `dtf`, …). */
export function kindNeedsFile(kind: string): boolean {
  return REQUIRED.has(kind);
}

/** Quote line kind of a simple product: a `uvItem` is quoted as a `uv` line. */
export function simpleQuoteKind(kind: ShopSimpleKind): Exclude<ShopQuoteLine["kind"], "dtf"> {
  return kind === "uvItem" ? "uv" : kind;
}

/** A cart line of a file-required kind with no file (e.g. from an older cart). */
export function lineMissingFile(line: { quote: { kind: string }; files: readonly unknown[] }): boolean {
  return kindNeedsFile(line.quote.kind) && line.files.length === 0;
}
