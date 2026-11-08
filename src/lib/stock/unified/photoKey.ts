/**
 * Storage key of a stock photo uploaded through the `stockCatalog` scope
 * (`catalog/stock/<ts>-<id>-<file name>`; names keep Unicode and spaces) or
 * copied from a supplier: one segment under the prefix — no URLs, no other
 * prefixes, no `/`, `\`, `?`, `#`, control characters or `..`.
 */
export const STOCK_PHOTO_KEY_RE = /^catalog\/stock\/[^/\\?#\u0000-\u001f\u007f]+$/;

export function isStockPhotoKey(key: string): boolean {
  if (!STOCK_PHOTO_KEY_RE.test(key)) return false;
  const name: string = key.slice("catalog/stock/".length);
  return name.trim() !== "" && name !== "." && name !== "..";
}
