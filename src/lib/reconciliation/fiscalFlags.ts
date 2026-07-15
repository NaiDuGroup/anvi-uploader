import type { Prisma } from "@prisma/client";

/**
 * True when the fiscal invoice is a non-delivery document (SFS creation reason
 * "Non-livrare" / Neplatitor TVA). These must not enter receivables matching
 * or debtor balances — they are not ordinary delivery invoices.
 */
export function isNonDeliveryFiscal(
  redirections: string | null | undefined,
): boolean {
  return /non[\s-]?livrare/i.test(redirections ?? "");
}

/**
 * Prisma filter: keep invoices that are not Non-livrare (null/empty redirections
 * or any other creation reason).
 */
export function excludeNonDeliveryWhere(): Prisma.FiscalInvoiceWhereInput {
  return {
    OR: [
      { redirections: null },
      {
        NOT: {
          redirections: { contains: "livrare", mode: "insensitive" },
        },
      },
    ],
  };
}
