/**
 * QA edge cases for «Взаиморасчёты» (stage 1 + card payments + B/f receipts).
 * Written by QA on 42bd8e6; the defects they found are fixed and these stay
 * as regression tests.
 */
import { describe, it, expect } from "vitest";
import {
  attributeCardPurchases,
  matchByAmount,
  matchByName,
  normalizeMerchantName,
  parseCardPurchase,
  receiptsNotCoveredByCard,
} from "./cardPurchases";
import { computeSettlements, type SettlementInput } from "./balance";
import { summarizeCardPurchases } from "./load";
import { parseInvoiceXml } from "@/lib/efactura/parseInvoiceXml";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MAIB = "1002600003778";
const SUP = "1004600016671";
const SUP2 = "1004600016672";

const purpose = (date: string, merchant: string) =>
  `Cumparaturi la Comercianti din ${date}/4356***5688 la ${merchant} MCC5200 493.MDL.LOCAL`;

function base(over: Partial<SettlementInput> = {}): SettlementInput {
  return {
    ownIdno: "1023600000396",
    operationalIdnos: new Set(),
    sales: new Map(),
    salesInvoices: [],
    credits: [],
    purchases: [],
    debits: [],
    cardPayments: [],
    refundedByTx: new Map(),
    categories: new Map(),
    ...over,
  };
}

describe("card parser edge cases", () => {
  it("foreign-currency row: merchant stops at /suma, MDL debit amount is what counts", () => {
    const r = attributeCardPurchases({
      debits: [
        {
          id: "x",
          amount: 8612.4,
          bookingDate: day("2026-03-28"),
          purpose:
            "Cumparaturi la Comercianti din 27.03.2026/4356***5688 la Alibaba.com Singapore E-C 408-7855580/suma 477.88/USD",
        },
      ],
      aliases: [{ merchantKey: "ALIBABACOMSINGAPOREEC", idno: SUP }],
      names: [],
      invoices: [],
    });
    expect(r[0]).toMatchObject({ amount: 8612.4, idno: SUP, source: "alias" });
  });

  it("cash withdrawal / card fees are not purchases", () => {
    expect(parseCardPurchase("Retragere numerar din 01.03.2026/4356***5688 la ATM MAIB CHISINAU")).toBeNull();
    expect(parseCardPurchase("Retinerea comisionului-operatiunile acceptare card Visa.")).toBeNull();
  });

  it("caret export row without «la MERCHANT» is skipped, not mis-parsed", () => {
    expect(parseCardPurchase("Cumparaturi la Comercianti din 12.01.2026/4356*** 5688 493.MDL")).toBeNull();
  });

  it("rejects impossible dates", () => {
    expect(parseCardPurchase(purpose("32.01.2026", "LINELLA"))).toBeNull();
    expect(parseCardPurchase(purpose("01.13.2026", "LINELLA"))).toBeNull();
  });

  // The purpose must START with «Cumparaturi la Comercianti din …», so a
  // reversal/fee row quoting the original purchase is not one more payment.
  it("reversal or fee rows quoting a purchase are not purchases", () => {
    expect(
      parseCardPurchase(`Anulare ${purpose("01.03.2026", "LINELLA")}`),
    ).toBeNull();
    expect(
      parseCardPurchase(`Comision pentru ${purpose("01.03.2026", "ALIEXPRESS")}`),
    ).toBeNull();
  });
});

describe("merchant name matching", () => {
  it("short keys (<5) never match: MART, SA-only names", () => {
    expect(matchByName("MART", [{ idno: "1", key: "MARTMARKET" }])).toBeNull();
    expect(normalizeMerchantName("S.A.")).toBe("");
  });

  it("same key, two IDNOs → ambiguous, no name attribution", () => {
    expect(
      matchByName("LINELLA", [
        { idno: "1", key: "LINELLA" },
        { idno: "2", key: "LINELLA" },
      ]),
    ).toBeNull();
  });

  // Store numbers are stripped, so every «MAGAZIN <n>» collapses to «MAGAZIN»;
  // substring matches need ≥ 8 chars or ≥ 60 % of the longer key.
  it("generic merchant key does not attribute to an unrelated supplier", () => {
    const key = parseCardPurchase(purpose("01.03.2026", "MAGAZIN 21 CHISINAU"))!.merchantKey;
    expect(key).toBe("MAGAZIN");
    expect(matchByName(key, [{ idno: SUP, key: normalizeMerchantName("MAGAZINUL UNIVERSAL SRL") }])).toBeNull();
  });

  it("short supplier key inside a long merchant is not a match", () => {
    // Supplier «PRINT SRL» (key PRINT) vs a card at «PRINTERRA SHOP».
    expect(matchByName("PRINTERRASHOP", [{ idno: SUP, key: "PRINT" }])).toBeNull();
  });
});

describe("amount matching", () => {
  const inv = (idno: string, total: number, date: string) => ({
    supplierIdno: idno,
    totalAmount: total,
    issueDate: day(date),
  });

  it("window is inclusive −5..+30 days (UTC midnight on both sides)", () => {
    expect(matchByAmount(100, day("2026-03-10"), [inv(SUP, 100, "2026-03-05")])).toBe(SUP);
    expect(matchByAmount(100, day("2026-03-10"), [inv(SUP, 100, "2026-04-09")])).toBe(SUP);
    expect(matchByAmount(100, day("2026-03-10"), [inv(SUP, 100, "2026-03-04")])).toBeNull();
    expect(matchByAmount(100, day("2026-03-10"), [inv(SUP, 100, "2026-04-10")])).toBeNull();
  });

  it("issueDate stored with a Chișinău offset (22:00Z the day before) still falls inside", () => {
    // 2026-03-05 00:00 Chișinău = 2026-03-04T22:00Z → 5 days 2 h before the card date.
    expect(
      matchByAmount(100, day("2026-03-10"), [
        { supplierIdno: SUP, totalAmount: 100, issueDate: new Date("2026-03-04T22:00:00.000Z") },
      ]),
    ).toBeNull(); // documents current behaviour: −5 days boundary is UTC-exact
  });

  it("two invoices of the same supplier with the same amount → still that supplier", () => {
    expect(
      matchByAmount(100, day("2026-03-10"), [inv(SUP, 100, "2026-03-11"), inv(SUP, 100, "2026-03-20")]),
    ).toBe(SUP);
  });

  it("one invoice cannot absorb two card purchases", () => {
    const r = attributeCardPurchases({
      debits: [
        { id: "a", amount: 500, bookingDate: day("2026-03-02"), purpose: purpose("01.03.2026", "SHOP ONE") },
        { id: "b", amount: 500, bookingDate: day("2026-03-06"), purpose: purpose("05.03.2026", "SHOP TWO") },
      ],
      aliases: [],
      names: [],
      invoices: [inv(SUP, 500, "2026-03-03")],
    });
    // The earlier card claims the single 500 invoice; the later one stays unattributed.
    expect(r.filter((c) => c.idno === SUP).map((c) => c.debitId)).toEqual(["a"]);
    expect(r.find((c) => c.debitId === "b")).toMatchObject({ idno: null, source: null });
  });
});

describe("B/f vs card de-duplication", () => {
  const rc = (document: string, amount: number, date: string) => ({ document, supplierIdno: SUP, amount, date: day(date) });

  it("±15 days inclusive, ±1 cent", () => {
    expect(
      receiptsNotCoveredByCard([rc("A", 100, "2026-03-16")], [{ debitId: "c", idno: SUP, amount: 100.01, date: day("2026-03-01") }]),
    ).toHaveLength(0);
    expect(
      receiptsNotCoveredByCard([rc("A", 100, "2026-03-17")], [{ debitId: "c", idno: SUP, amount: 100, date: day("2026-03-01") }]),
    ).toHaveLength(1);
    expect(
      receiptsNotCoveredByCard([rc("A", 100, "2026-03-02")], [{ debitId: "c", idno: SUP, amount: 100.02, date: day("2026-03-01") }]),
    ).toHaveLength(1);
  });

  it("RISK: one card payment for two B/f invoices (split invoice) is counted twice", () => {
    const res = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 100, issueDate: day("2026-03-01"), document: "A1", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-01") } },
          { supplierIdno: SUP, supplierName: "S", totalAmount: 200, issueDate: day("2026-03-01"), document: "A2", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-01") } },
        ],
        cardPayments: [{ debitId: "c", idno: SUP, amount: 300, date: day("2026-03-01"), merchant: "S" }],
      }),
    );
    const row = res.rows.find((r) => r.idno === SUP)!;
    expect(row.paidToThem).toBe(600); // documents current behaviour: paid twice
  });

  it("card + B/f + bank transfer: transfer is NOT de-duplicated against B/f (documents behaviour)", () => {
    const res = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 100, issueDate: day("2026-03-01"), document: "A1", receipt: { ref: "bon de comanda 5", method: null, date: day("2026-03-01") } },
        ],
        debits: [{ id: "t", amount: 100, bookingDate: day("2026-03-05"), counterpartyIdno: SUP, counterpartyName: "S", txTypeCode: "1", documentNumber: "1" }],
      }),
    );
    expect(res.rows.find((r) => r.idno === SUP)!.balance).toBe(100); // we_overpaid 100
  });
});

describe("computeSettlements consistency", () => {
  it("card debit moves from the bank row to the supplier, not counted twice", () => {
    const res = computeSettlements(
      base({
        purchases: [{ supplierIdno: SUP, supplierName: "S", totalAmount: 250.5, issueDate: day("2026-03-01"), document: "A1" }],
        debits: [
          { id: "c", amount: 250.5, bookingDate: day("2026-03-02"), counterpartyIdno: MAIB, counterpartyName: "MAIB", txTypeCode: "1", documentNumber: null },
          { id: "f", amount: 12.4, bookingDate: day("2026-03-02"), counterpartyIdno: MAIB, counterpartyName: "MAIB", txTypeCode: "1", documentNumber: null },
        ],
        cardPayments: [{ debitId: "c", idno: SUP, amount: 250.5, date: day("2026-03-01"), merchant: "S" }],
      }),
    );
    const sup = res.rows.find((r) => r.idno === SUP)!;
    const bank = res.rows.find((r) => r.idno === MAIB)!;
    expect(sup).toMatchObject({ paidToThem: 250.5, paidByCard: 250.5, balance: 0, state: "settled" });
    expect(bank).toMatchObject({ paidToThem: 12.4, state: "service" });
  });

  it("cents: 0.1 + 0.2 style sums stay exact", () => {
    const res = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 0.1, issueDate: day("2026-03-01"), document: "A1" },
          { supplierIdno: SUP, supplierName: "S", totalAmount: 0.2, issueDate: day("2026-03-01"), document: "A2" },
        ],
        debits: [{ id: "t", amount: 0.3, bookingDate: day("2026-03-05"), counterpartyIdno: SUP, counterpartyName: "S", txTypeCode: "1", documentNumber: "1" }],
      }),
    );
    expect(res.rows[0]).toMatchObject({ balance: 0, state: "settled" });
  });

  it("summary totals equal the sum of row balances per state", () => {
    const res = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 1000, issueDate: day("2026-03-01"), document: "A1" },
          { supplierIdno: SUP2, supplierName: "S2", totalAmount: 10, issueDate: day("2026-03-01"), document: "B1" },
        ],
        debits: [{ id: "t", amount: 50.55, bookingDate: day("2026-03-05"), counterpartyIdno: SUP2, counterpartyName: "S2", txTypeCode: "1", documentNumber: "1" }],
      }),
    );
    const sum = (s: string) => res.rows.filter((r) => r.state === s).reduce((a, r) => a + Math.round(r.balance * 100), 0) / 100;
    expect(res.summary.weOwe).toBe(-sum("we_owe"));
    expect(res.summary.weOverpaid).toBe(sum("we_overpaid"));
  });

  // A supplier return / storno with a B/f reference (negative total): the
  // ledger nets it (purchase +x, receipt_out −x → 0) and so does the list
  // (a party whose movements all net to zero has no row).
  it("B/f invoice + its B/f storno net to zero (list = ledger)", () => {
    const res = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 100, issueDate: day("2026-03-01"), document: "A1", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-01") } },
          { supplierIdno: SUP, supplierName: "S", totalAmount: -100, issueDate: day("2026-03-02"), document: "A2", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-02") } },
        ],
      }),
    );
    expect(res.rows.find((r) => r.idno === SUP)?.balance ?? 0).toBe(0);
    // With a real payment on top, the storno still nets out.
    const res2 = computeSettlements(
      base({
        purchases: [
          { supplierIdno: SUP, supplierName: "S", totalAmount: 100, issueDate: day("2026-03-01"), document: "A1", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-01") } },
          { supplierIdno: SUP, supplierName: "S", totalAmount: -100, issueDate: day("2026-03-02"), document: "A2", receipt: { ref: "b/f 1", method: "card", date: day("2026-03-02") } },
          { supplierIdno: SUP, supplierName: "S", totalAmount: 40, issueDate: day("2026-03-03"), document: "A3" },
        ],
        debits: [{ id: "t", amount: 40, bookingDate: day("2026-03-05"), counterpartyIdno: SUP, counterpartyName: "S", txTypeCode: "1", documentNumber: "1" }],
      }),
    );
    expect(res2.rows.find((r) => r.idno === SUP)).toMatchObject({ balance: 0, paidByReceipt: 0 });
  });

  it("summarizeCardPurchases: counts split into attributed / ignored / unattributed", () => {
    const cards = attributeCardPurchases({
      debits: [
        { id: "a", amount: 10, bookingDate: day("2026-03-02"), purpose: purpose("01.03.2026", "SOLING") },
        { id: "b", amount: 20, bookingDate: day("2026-03-02"), purpose: purpose("01.03.2026", "COFFEE") },
        { id: "c", amount: 30, bookingDate: day("2026-03-02"), purpose: purpose("01.03.2026", "UNKNOWN") },
      ],
      aliases: [{ merchantKey: "COFFEE", idno: null }],
      names: [{ idno: SUP, name: "SOLING SRL" }],
      invoices: [],
    });
    const s = summarizeCardPurchases(cards, () => null);
    expect(s).toMatchObject({ attributedSum: 10, ignoredSum: 20, unattributedSum: 30 });
  });
});

describe("B/f detection in supplier XML", () => {
  const xml = (notes: string) =>
    `<Invoice><Supplier IDNO="${SUP}" Title="S"/><Total>100</Total><TotalTVA>16.67</TotalTVA><Notes>${notes}</Notes></Invoice>`;

  it("real B/f texts are detected with their date", () => {
    const p = parseInvoiceXml(xml("b/f 0013 din 09.07.2026 (card)"));
    expect(p).toMatchObject({ settledByReceipt: true, receiptMethod: "card", receiptDate: "2026-07-09T00:00:00.000Z" });
  });

  it("«bon de comandă» / «bon de livrare» are not fiscal receipts", () => {
    expect(parseInvoiceXml(xml("Conform bon de comanda nr 15")).settledByReceipt).toBe(false);
    expect(parseInvoiceXml(xml("Bon de comandă nr 15 din 01.03.2026")).settledByReceipt).toBe(false);
    expect(parseInvoiceXml(xml("bon de livrare 7, bon de predare 8")).settledByReceipt).toBe(false);
    expect(parseInvoiceXml(xml("Bonul fiscal nr 12 din 03.03.2026")).receiptDate).toBe("2026-03-03T00:00:00.000Z");
    expect(parseInvoiceXml(xml("cek fiscal 5 din 04.03.2026"))).toMatchObject({ settledByReceipt: true, receiptDate: "2026-03-04T00:00:00.000Z" });
    expect(parseInvoiceXml(xml("bon de comanda 3 achitat numerar"))).toMatchObject({ settledByReceipt: true, receiptMethod: "cash" });
  });

  it("receipt date is the B/f date, not an earlier contract date in the same note", () => {
    const p = parseInvoiceXml(xml("Contract nr 7 din 01.02.2024, b/f 0013 din 09.07.2026"));
    expect(p.receiptDate).toBe("2026-07-09T00:00:00.000Z");
  });
});

describe("amount matching: settled invoices", () => {
  const purpose = (date: string, merchant: string) =>
    `Cumparaturi la Comercianti din ${date}/4356***5688 la ${merchant} MCC5200 493.MDL.LOCAL`;
  it("an open invoice wins over an already settled one of the same amount", () => {
    const r = attributeCardPurchases({
      debits: [{ id: "a", amount: 500, bookingDate: day("2026-03-02"), purpose: purpose("01.03.2026", "SHOP ONE") }],
      aliases: [],
      names: [],
      invoices: [
        { supplierIdno: SUP, totalAmount: 500, issueDate: day("2026-03-01"), settled: true },
        { supplierIdno: SUP2, totalAmount: 500, issueDate: day("2026-03-03") },
      ],
    });
    expect(r[0]).toMatchObject({ idno: SUP2, source: "amount" });
  });
  it("a settled invoice is still used when nothing open fits", () => {
    expect(
      matchByAmount(500, day("2026-03-01"), [{ supplierIdno: SUP, totalAmount: 500, issueDate: day("2026-03-01"), settled: true }]),
    ).toBe(SUP);
  });
  it("two suppliers with the same amount stay ambiguous", () => {
    expect(
      matchByAmount(500, day("2026-03-01"), [
        { supplierIdno: SUP, totalAmount: 500, issueDate: day("2026-03-01") },
        { supplierIdno: SUP2, totalAmount: 500, issueDate: day("2026-03-02") },
      ]),
    ).toBeNull();
  });
});
