/**
 * Provenance shared by every stock receipt table (mug, notebook, pen, roll media,
 * sheet paper, ink). Optional so manual receipts keep working unchanged.
 */
export type ReceiptSourceMeta = {
  /** Incoming e-Factura line this receipt was posted from. */
  purchaseInvoiceLineId?: string | null;
  /** Priced at the last known unit cost until the supplier invoice arrives. */
  isProvisional?: boolean;
  /** Whether `totalCostMdl` includes VAT (legacy basis) or not. */
  amountsIncludeVat?: boolean;
};

export function receiptSourceData(meta: ReceiptSourceMeta): {
  purchaseInvoiceLineId: string | null;
  isProvisional: boolean;
  amountsIncludeVat?: boolean;
} {
  return {
    purchaseInvoiceLineId: meta.purchaseInvoiceLineId ?? null,
    isProvisional: meta.isProvisional ?? false,
    ...(meta.amountsIncludeVat !== undefined
      ? { amountsIncludeVat: meta.amountsIncludeVat }
      : {}),
  };
}
