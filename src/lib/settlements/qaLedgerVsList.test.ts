/**
 * QA: list row (computeSettlementsReport) vs ledger closing (loadSettlementLedger)
 * for the bank IDNO when card purchases are attributed to suppliers.
 * Prod lead: BC MAIB list −2 418 983.31 vs ledger −2 407 000.31.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const MAIB = "1002600003778";
const SUP = "1004600016671";
const OWN = "1023600000396";
const D = (v: number) => new Prisma.Decimal(v);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const debits = [
  // Card purchase at SOLING, attributed by name to SUP.
  {
    id: "card1",
    direction: "DEBIT",
    currency: "MDL",
    amount: D(250),
    bookingDate: day("2026-03-02"),
    counterpartyIdno: MAIB,
    counterpartyName: "BC MAIB SA",
    txTypeCode: "1",
    documentNumber: "1",
    purpose: "Cumparaturi la Comercianti din 01.03.2026/4356***5688 la SOLING MCC5200 493.MDL.LOCAL",
  },
  // Plain bank fee.
  {
    id: "fee1",
    direction: "DEBIT",
    currency: "MDL",
    amount: D(12.4),
    bookingDate: day("2026-03-02"),
    counterpartyIdno: MAIB,
    counterpartyName: "BC MAIB SA",
    txTypeCode: "1",
    documentNumber: "2",
    purpose: "Comision",
  },
];
const purchases = [
  {
    id: "p1",
    seria: "EA",
    number: "1",
    supplierIdno: SUP,
    supplierName: "SOLING SRL",
    totalAmount: D(250),
    issueDate: day("2026-03-01"),
    receiptRef: null,
    receiptMethod: null,
    receiptSettledAt: null,
    totalExVat: D(208.33),
    vatAmount: D(41.67),
  },
];

function matches(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR") {
      if (!(v as Array<Record<string, unknown>>).some((w) => matches(row, w))) return false;
      continue;
    }
    const val = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; not?: unknown };
      if (o.in && !o.in.includes(val)) return false;
      if ("not" in o && (val === o.not || val == null)) return false;
    } else if (v === null) {
      if (val != null) return false;
    } else if (val !== v) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankTransaction: {
      findMany: vi.fn(async (args: { where?: Record<string, unknown> }) =>
        debits.filter((d) => matches(d, args.where)),
      ),
    },
    purchaseInvoice: {
      findMany: vi.fn(async (args: { distinct?: string[] }) =>
        args.distinct ? [{ supplierIdno: SUP, supplierName: "SOLING SRL" }] : purchases,
      ),
      count: vi.fn(async () => 0),
    },
    fiscalInvoice: { findMany: vi.fn(async () => []) },
    cardMerchantAlias: { findMany: vi.fn(async () => []) },
    counterpartyCategory: { findMany: vi.fn(async () => []) },
    counterpartyOpeningBalance: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
  },
}));
vi.mock("@/lib/invoice/companyProfile", () => ({
  getOrCreateCompanyProfile: vi.fn(async () => ({ fiscalCode: OWN })),
}));
vi.mock("@/lib/reconciliation/operational", () => ({
  loadOperationalIdnos: vi.fn(async () => new Set<string>()),
}));
vi.mock("@/lib/reconciliation/credits", () => ({
  loadRefunds: vi.fn(async () => []),
}));
vi.mock("@/lib/reconciliation/report", () => ({
  computeClientStatement: vi.fn(async () => null),
  loadSalesBalanceData: vi.fn(async () => ({
    balances: new Map(),
    attribution: { refunds: [] },
    ownIdno: OWN,
    operationalSet: new Set<string>(),
    dbExclusions: [],
    nameByIdno: new Map(),
  })),
}));

describe("list vs ledger with attributed card purchases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("supplier: list = ledger", async () => {
    const { computeSettlementsReport, loadSettlementLedger } = await import("./load");
    const report = await computeSettlementsReport();
    const ledger = await loadSettlementLedger(SUP);
    const row = report.rows.find((r) => r.idno === SUP)!;
    expect(row.balance).toBe(0);
    expect(ledger.balance).toBe(row.balance);
  });

  it("bank (MAIB): ledger skips the card debit the list moved to the supplier", async () => {
    const { computeSettlementsReport, loadSettlementLedger } = await import("./load");
    const report = await computeSettlementsReport();
    const ledger = await loadSettlementLedger(MAIB);
    const row = report.rows.find((r) => r.idno === MAIB)!;
    expect(row.paidToThem).toBe(12.4); // list: fee only
    expect(ledger.balance).toBe(row.balance); // ledger: fee only too (was 262.40)
  });
});
