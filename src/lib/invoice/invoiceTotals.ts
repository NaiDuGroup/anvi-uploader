import { Prisma } from "@prisma/client";

const TWO_DP = (n: Prisma.Decimal): Prisma.Decimal =>
  n.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface InvoiceLineInput {
  quantity: number | string | Prisma.Decimal;
  unitPrice: number | string | Prisma.Decimal;
}

export interface InvoiceLineComputed {
  /** Quantity rounded to 3 decimals (matches column precision). */
  quantity: Prisma.Decimal;
  /** Unit price (VAT-inclusive in V1) rounded to 2 decimals. */
  unitPrice: Prisma.Decimal;
  /** quantity × unitPrice rounded to 2 decimals. */
  lineTotal: Prisma.Decimal;
  /** VAT portion of lineTotal at the given rate (inclusive math). */
  vatAmount: Prisma.Decimal;
}

export interface InvoiceTotals {
  subtotal: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  lines: InvoiceLineComputed[];
}

/**
 * Per-line VAT for VAT-inclusive prices: vat = lineTotal − lineTotal/(1+rate).
 * For 20% inclusive: 100 → 16.6667, matching the reference PDF that shows
 * 2900 → 483.33.
 */
export function computeInclusiveVat(
  lineTotal: Prisma.Decimal,
  ratePercent: Prisma.Decimal | number,
): Prisma.Decimal {
  const rate =
    ratePercent instanceof Prisma.Decimal
      ? ratePercent
      : new Prisma.Decimal(ratePercent);
  if (rate.lte(0)) return new Prisma.Decimal(0);
  const factor = rate.div(100).plus(1);
  // vat = lineTotal − lineTotal/factor
  const net = lineTotal.div(factor);
  return TWO_DP(lineTotal.minus(net));
}

/**
 * Computes line totals + invoice subtotal/VAT/total. V1 always uses
 * VAT-inclusive prices (i.e. line `unitPrice` already contains VAT and the
 * `subtotal` equals `totalAmount`). `vatAmount` is the VAT contained inside.
 */
export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  vatRate: Prisma.Decimal | number,
): InvoiceTotals {
  const computedLines: InvoiceLineComputed[] = lines.map((line) => {
    const quantity = new Prisma.Decimal(line.quantity).toDecimalPlaces(
      3,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    const unitPrice = TWO_DP(new Prisma.Decimal(line.unitPrice));
    const lineTotal = TWO_DP(quantity.mul(unitPrice));
    const vatAmount = computeInclusiveVat(lineTotal, vatRate);
    return { quantity, unitPrice, lineTotal, vatAmount };
  });
  const subtotal = computedLines.reduce(
    (acc, l) => acc.plus(l.lineTotal),
    new Prisma.Decimal(0),
  );
  const vatAmount = computedLines.reduce(
    (acc, l) => acc.plus(l.vatAmount),
    new Prisma.Decimal(0),
  );
  return {
    subtotal: TWO_DP(subtotal),
    vatAmount: TWO_DP(vatAmount),
    // For VAT-inclusive prices, the customer pays the subtotal directly.
    totalAmount: TWO_DP(subtotal),
    lines: computedLines,
  };
}
