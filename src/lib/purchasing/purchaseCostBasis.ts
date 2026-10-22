import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";

/**
 * Whether purchase costs (receipts, weighted averages) are kept VAT-inclusive.
 * Legacy data is VAT-inclusive; the ex-VAT cutover flips this to false.
 */
export async function purchaseCostsIncludeVat(): Promise<boolean> {
  const settings = await getOrCreateAccountingSettings();
  return settings.purchaseCostsIncludeVat;
}

/** Amount to book as receipt cost for an invoice line under the current basis. */
export function invoiceLineReceiptCost(
  line: { totalExVat: number; total: number },
  includeVat: boolean,
): number {
  return includeVat ? line.total : line.totalExVat;
}
