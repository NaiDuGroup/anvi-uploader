import { parseMaibCsv } from "./parseMaibCsv";
import { parseMaibExtrasTxt } from "./parseMaibExtrasTxt";
import type { ParsedStatement, ParseOptions } from "./types";

export * from "./types";
export { parseMaibCsv } from "./parseMaibCsv";
export { parseMaibExtrasTxt } from "./parseMaibExtrasTxt";

/**
 * Supported statement formats.
 *  - `maib_csv`: MAIB current-account statement CSV.
 *  - `maib_card_csv`: MAIB card-account ("BATCH") statement CSV. Same column
 *    layout as the account export, but the opening-balance row may be `null`.
 *  - `maib_extras_txt`: MAIB "EXTRAS DIN CONT" plain-text long-period export
 *    (current or card account — same layout).
 */
export const STATEMENT_FORMATS = [
  "maib_csv",
  "maib_card_csv",
  "maib_extras_txt",
] as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

/**
 * Parses a bank statement by format id. Kept as a thin dispatcher so formats
 * can diverge later without touching callers.
 */
export function parseStatement(
  format: StatementFormat,
  content: string,
  options: ParseOptions = {},
): ParsedStatement {
  switch (format) {
    case "maib_csv":
    case "maib_card_csv":
      return parseMaibCsv(content, options);
    case "maib_extras_txt":
      return parseMaibExtrasTxt(content, options);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported statement format: ${String(exhaustive)}`);
    }
  }
}
