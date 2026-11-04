import type { ShopStringKey } from "./i18n";
import { SHOP_PRINT_MAX_PAGES } from "./printPrices";

/**
 * The print page's form rules (`PrintView`), pure for tests.
 */

/**
 * The page-count field while typing: digits only, capped at the server's
 * limit (`SHOP_PRINT_MAX_PAGES`, the quote schema's max) so the field shows
 * the same number the price uses. Empty / 0 → no count yet.
 */
export function clampPrintPagesInput(raw: string): { draft: string; pages: number | null } {
  const digits: string = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, String(SHOP_PRINT_MAX_PAGES).length + 1);
  if (!digits) return { draft: "", pages: null };
  const n: number = Math.min(Number(digits), SHOP_PRINT_MAX_PAGES);
  return n >= 1 ? { draft: String(n), pages: n } : { draft: digits, pages: null };
}

/** Why the set cannot go to the cart yet (the message key), or null. */
export function printProblem(s: {
  count: number;
  uploading: boolean;
  failed: boolean;
  noPages: boolean;
  priced: boolean;
}): ShopStringKey | null {
  if (s.count === 0) return "printFilesRequired";
  if (s.uploading) return "printWaitUpload";
  if (s.failed) return "printUploadErrors";
  if (s.noPages) return "printPagesRequired";
  if (!s.priced) return "printFilesRequired";
  return null;
}
