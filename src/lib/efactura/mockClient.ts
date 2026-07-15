import { EFACTURA_STATUS, type EFacturaClient, type EFacturaInvoice } from "./types";

/**
 * Deterministic mock used for local dev and until real e-Factura API
 * credentials are provisioned. The sample invoices intentionally reuse fiscal
 * numbers and payer IDNOs that appear in the reference MAIB bank statement, so
 * the full pull -> match -> mark-paid pipeline can be exercised end to end.
 */
function mockInvoices(): EFacturaInvoice[] {
  return [
        {
          seria: "EBJ",
          number: "000662654",
          status: EFACTURA_STATUS.ACCEPTED_BUYER,
          issueDate: "2026-06-29T00:00:00.000Z",
          totalAmount: "584.00",
          vatAmount: "97.33",
          currency: "MDL",
          buyerName: "'KONSTAOIL' SRL",
          buyerIdno: "1002600012266",
          raw: { source: "mock" },
        },
        {
          seria: "EBJ",
          number: "000440592",
          status: EFACTURA_STATUS.ACCEPTED_BUYER,
          issueDate: "2026-06-23T00:00:00.000Z",
          totalAmount: "3896.00",
          vatAmount: "649.33",
          currency: "MDL",
          buyerName: "'CRIO-SG' S.R.L.",
          buyerIdno: "1022600017469",
          raw: { source: "mock" },
        },
        {
          seria: "RP",
          number: "000014415",
          status: EFACTURA_STATUS.ACCEPTED_BUYER,
          issueDate: "2026-07-02T00:00:00.000Z",
          totalAmount: "36664.00",
          vatAmount: "6110.67",
          currency: "MDL",
          buyerName: "CRAFTI BUSINESS S.R.L.",
          buyerIdno: "1004600069507",
          raw: { source: "mock" },
        },
        // Unpaid receivable (no matching bank payment in the statement) so the
        // debtor report and reconciliation act have something to show.
        {
          seria: "EBK",
          number: "000112233",
          status: EFACTURA_STATUS.ACCEPTED_BUYER,
          issueDate: "2026-05-20T00:00:00.000Z",
          totalAmount: "1440.00",
          vatAmount: "240.00",
          currency: "MDL",
          buyerName: "Salvadent Smile SRL",
          buyerIdno: "1013600040045",
          raw: { source: "mock" },
        },
  ];
}

export function createMockEFacturaClient(): EFacturaClient {
  return {
    async listSupplierInvoices(): Promise<EFacturaInvoice[]> {
      return mockInvoices();
    },
    async getInvoiceBySeriaNumber(seria, number) {
      const norm = (s: string) => s.replace(/^0+/, "");
      return (
        mockInvoices().find(
          (i) => i.seria === seria && norm(i.number) === norm(number),
        ) ?? null
      );
    },
    async listArchivedInvoices() {
      // In mock mode the "supplier" list already stands in for history.
      return [];
    },
    async searchInvoices(options) {
      return mockInvoices().filter((i) => i.status === options.invoiceStatus);
    },
  };
}
