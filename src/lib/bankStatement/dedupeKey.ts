import { createHash } from "node:crypto";

/**
 * Stable fingerprint for idempotent re-import across MAIB CSV and EXTRAS TXT.
 *
 * Purpose text is intentionally excluded: TXT wrap inserts mid-word spaces
 * (`FELICIT ARI` vs `FELICITARI`), which previously produced different hashes
 * for the same bank operation and double-counted payments on acts.
 *
 * When `documentNumber` is missing we fall back to a whitespace-normalized
 * purpose snippet so fee/POS rows without NDOC still dedupe.
 */
export function buildBankTxDedupeKey(input: {
  accountIban: string | null;
  bookingDate: Date;
  direction: "CREDIT" | "DEBIT";
  amount: string;
  documentNumber: string | null;
  counterpartyIban: string | null;
  counterpartyIdno: string | null;
  purpose: string | null;
}): string {
  const doc = (input.documentNumber ?? "").trim();
  // Counterparty IBAN / purpose wrap differ between CSV and EXTRAS TXT; when
  // NDOC is present the bank document number is enough to identify the row.
  const purposeFallback = doc
    ? ""
    : (input.purpose ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 80);

  return createHash("sha1")
    .update(
      [
        (input.accountIban ?? "").trim().toUpperCase(),
        input.bookingDate.toISOString().slice(0, 10),
        input.direction,
        input.amount,
        doc,
        (input.counterpartyIdno ?? "").trim(),
        purposeFallback,
      ].join("|"),
    )
    .digest("hex");
}
