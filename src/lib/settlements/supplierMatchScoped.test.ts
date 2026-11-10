/**
 * Scoped sources (confirm / reject / manual link) must give the same
 * attribution as the full load for the ids in scope — or refuse (null) when
 * a card purchase is attributed by amount.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ISSUED_EFACTURA_STATUSES } from "@/lib/efactura/types";

type Row = Record<string, unknown>;

const { db, table } = vi.hoisted(() => {
  type R = Record<string, unknown>;
  const db: Record<string, R[]> = {};
  /** Tiny `where` evaluator: equality, null, { in }, { not: null }, OR. Enough for the queries under test. */
  function matches(row: R, where: R | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (k === "OR") return (cond as R[]).some((w) => matches(row, w));
      const v = row[k];
      if (cond === null) return v == null;
      if (typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as R;
        if ("in" in c) return (c.in as unknown[]).includes(v);
        if ("not" in c && c.not === null) return v != null;
        throw new Error(`unsupported where ${k}: ${JSON.stringify(c)}`);
      }
      return v === cond;
    });
  }
  const table = (name: string) => ({
    findMany: async (args: { where?: R } = {}) => (db[name] ?? []).filter((r) => matches(r, args.where)),
  });
  return { db, table };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseInvoice: table("purchaseInvoice"),
    bankTransaction: table("bankTransaction"),
    counterpartyCategory: table("counterpartyCategory"),
    cardMerchantAlias: table("cardMerchantAlias"),
    reconciliationExclusion: table("reconciliationExclusion"),
    // loadBankSettledInvoiceKeys: no confirmed bank links in these fixtures.
    supplierPaymentAllocation: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/invoice/companyProfile", () => ({
  getOrCreateCompanyProfile: vi.fn(async () => ({ fiscalCode: "1000000000000" })),
}));
vi.mock("@/lib/reconciliation/credits", () => ({ loadRefunds: vi.fn(async () => []) }));

import { buildLinkIndex, loadScopedSupplierSources, loadSupplierSources } from "./supplierMatchLoad";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const LIVE = ISSUED_EFACTURA_STATUSES[0];
const cardPurpose = (date: string, merchant: string) =>
  `Cumparaturi la Comercianti din ${date}/4356***5688 la ${merchant} CHISINAU MCC5200 493.MDL.LOCAL`;

function inv(id: string, supplierIdno: string, total: number, date: string, status = LIVE, supplierName = `S ${supplierIdno}`): Row {
  return {
    id, seria: "EAA", number: id, supplierIdno, supplierName, totalAmount: total, issueDate: day(date),
    receiptRef: null, receiptMethod: null, receiptSettledAt: null, totalExVat: null, vatAmount: null, eFacturaStatus: status,
  };
}
function tx(id: string, amount: number, date: string, counterpartyIdno: string | null, purpose: string | null, currency = "MDL"): Row {
  return {
    id, amount, bookingDate: day(date), counterpartyIdno, counterpartyName: counterpartyIdno ? `Payee ${counterpartyIdno}` : null,
    txTypeCode: "1", documentNumber: id, purpose, direction: "DEBIT", currency,
  };
}

beforeEach(() => {
  db.purchaseInvoice = [
    inv("I1", "200", 500, "2026-10-01"),
    inv("I2", "300", 777, "2026-10-02", LIVE, "VASCONI SRL"),
    inv("IGONE", "200", 100, "2026-10-03", -1),
    inv("I4", "400", 123.45, "2026-10-04"),
  ];
  db.bankTransaction = [
    tx("B1", 500, "2026-10-05", "200", "plata f-ra I1"),
    tx("B2", 50, "2026-10-05", "200", "plata", "EUR"),
    tx("C_ALIAS", 300, "2026-10-06", null, cardPurpose("05.10.2026", "VOLTA SHOP")),
    tx("C_IGN", 40, "2026-10-06", null, cardPurpose("05.10.2026", "IGNORED MARKET")),
    tx("C_NAME", 777, "2026-10-07", null, cardPurpose("06.10.2026", "VASCONI")),
    tx("C_AMOUNT", 123.45, "2026-10-08", null, cardPurpose("07.10.2026", "UNKNOWN PLACE")),
  ];
  db.counterpartyCategory = [];
  db.cardMerchantAlias = [
    { merchantKey: "VOLTASHOP", idno: "200" },
    { merchantKey: "IGNOREDMARKET", idno: null },
  ];
  db.reconciliationExclusion = [];
});

describe("loadScopedSupplierSources", () => {
  it("bank transfers, aliased / ignored / name-matched cards and invoices: same index as the full load", async () => {
    const full = buildLinkIndex(await loadSupplierSources());
    const payments = ["B1", "B2", "C_ALIAS", "C_IGN", "C_NAME", "MISSING"];
    const invoices = ["I1", "I2", "IGONE", "MISSING"];
    const scopedSrc = await loadScopedSupplierSources({ paymentIds: payments, invoiceIds: invoices });
    expect(scopedSrc).not.toBeNull();
    const scoped = buildLinkIndex(scopedSrc!);
    for (const id of payments) expect([id, scoped.paymentIdno.get(id) ?? null]).toEqual([id, full.paymentIdno.get(id) ?? null]);
    for (const id of invoices) expect([id, scoped.invoiceIdno.get(id)]).toEqual([id, full.invoiceIdno.get(id)]);
    // Sanity: the fixtures cover each branch.
    expect(full.paymentIdno.get("B1")).toBe("200");
    expect(full.paymentIdno.get("C_ALIAS")).toBe("200");
    expect(full.paymentIdno.get("C_IGN")).toBeNull();
    expect(full.paymentIdno.get("C_NAME")).toBe("300");
    expect(full.invoiceIdno.has("IGONE")).toBe(false);
  });

  it("a card purchase attributed by amount needs the full load → null", async () => {
    const full = buildLinkIndex(await loadSupplierSources());
    expect(full.paymentIdno.get("C_AMOUNT")).toBe("400");
    expect(await loadScopedSupplierSources({ paymentIds: ["B1", "C_AMOUNT"], invoiceIds: [] })).toBeNull();
  });

  it("loads only the rows in scope", async () => {
    const src = await loadScopedSupplierSources({ paymentIds: ["B1"], invoiceIds: ["I1"] });
    expect(src!.purchases.map((p) => p.id)).toEqual(["I1"]);
    expect(src!.debits.map((d) => d.id)).toEqual(["B1"]);
    expect(src!.cards).toEqual([]);
  });
});
