/**
 * QA (stage 3): context building + engine together — stale allocations and
 * negative invoices. «fixed:» tests failed on 42bd8e6 and pin the fix.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/invoice/companyProfile", () => ({ getOrCreateCompanyProfile: vi.fn() }));
vi.mock("@/lib/reconciliation/credits", () => ({ loadRefunds: vi.fn() }));

import {
  buildLinkIndex,
  buildSupplierContexts,
  engineAllocations,
  staleReasonOf,
  toSupplierCard,
  type SupplierAllocationRow,
  type SupplierSources,
} from "./supplierMatchLoad";
import { invoicePaymentStatus, suggestSupplierMatches } from "./supplierMatch";
import { computeChecks } from "./checks";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function purchase(id: string, idno: string, total: number, date: string, number = id) {
  return {
    id,
    seria: "EAA",
    number,
    supplierIdno: idno,
    supplierName: `S${idno}`,
    totalAmount: total,
    issueDate: day(date),
    receiptSettledAt: null,
    receiptRef: null,
    receiptMethod: null,
  };
}
function debit(id: string, idno: string, amount: number, date: string, purpose: string | null = null) {
  return { id, amount, bookingDate: day(date), counterpartyIdno: idno, counterpartyName: `S${idno}`, txTypeCode: "1", documentNumber: id, purpose };
}
function card(debitId: string, idno: string | null, amount: number, date: string) {
  return { debitId, idno, amount, purchaseDate: day(date), bookingDate: day(date), purpose: "card", merchantRaw: "SHOP", source: "alias", ignored: false };
}
function alloc(id: string, paymentId: string, invoiceId: string, amount: number, status: SupplierAllocationRow["status"] = "confirmed"): SupplierAllocationRow {
  return { id, paymentId, invoiceId, amount, status, confidence: 100, reason: null, createdById: null, confirmedById: null, confirmedAt: null, createdAt: day("2026-10-01") };
}
function sources(extra: Partial<SupplierSources>): SupplierSources {
  return { purchases: [], debits: [], cards: [], refundedByTx: new Map(), categories: new Map(), ownIdno: null, ...extra } as unknown as SupplierSources;
}

/** What counts as confirmed on a payment after matchOne: live (non-stale) confirmed rows + new auto-confirmed ones. */
function confirmedOnPayment(src: SupplierSources, allocations: SupplierAllocationRow[], idno: string, paymentId: string): number {
  const ctx = buildSupplierContexts(src, allocations).get(idno)!;
  const auto = suggestSupplierMatches({ payments: ctx.payments, invoices: ctx.invoices, allocations: engineAllocations(ctx) }).filter((s) => s.autoConfirm);
  const existing = ctx.allocations
    .filter((a) => a.status === "confirmed" && !a.staleReason && a.paymentId === paymentId)
    .reduce((s, a) => s + a.amount, 0);
  return existing + auto.filter((s) => s.paymentId === paymentId).reduce((s, a) => s + a.amount, 0);
}

describe("QA stale allocations", () => {
  it("fixed: confirmed link to an invoice that left the live set is seen on the payment side as stale, never double-counted", () => {
    // P (1000) was confirmed onto OLD; OLD is now cancelled (not in loadLivePurchases), row stays (no cascade on status change).
    const src = sources({ purchases: [purchase("NEW", "100", 1000, "2026-10-01")] as never, debits: [debit("P", "100", 1000, "2026-10-05")] as never });
    const allocations = [{ ...alloc("a1", "P", "OLD", 1000), invoiceDocument: "EAAOLD", invoiceIdno: "100" }];
    const ctx = buildSupplierContexts(src, allocations).get("100")!;
    expect(ctx.allocations).toHaveLength(1);
    expect(ctx.allocations[0]!.staleReason).toBe("invoice_gone");
    // The stale link counts nowhere: P may move to NEW, and only once.
    expect(confirmedOnPayment(src, allocations, "100", "P")).toBe(1000);
    const card = toSupplierCard(ctx, "100");
    expect(card.stale.map((l) => [l.allocationId, l.invoiceDocument, l.staleReason])).toEqual([["a1", "EAAOLD", "invoice_gone"]]);
    expect(card.payments[0]!.allocated).toBe(0);
    // «Устаревшая привязка» signal, reported once.
    const sig = computeChecks({
      now: day("2026-11-10"), rows: [], suppliers: buildSupplierContexts(src, allocations), matchingRan: true,
      cards: { unattributedCount: 0, unattributedSum: 0 }, lowConfidenceSales: [], vatSales: [], vatPurchases: [],
    }).filter((x) => x.type === "stale_link");
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ idno: "100", amount: 1000, documents: ["EAAOLD"] });
  });

  it("fixed: card alias moved P from IDNO A to B → old link is stale on A, P counts once", () => {
    const purchases = [purchase("IA", "A1", 300, "2026-10-01"), purchase("IB", "B1", 300, "2026-10-02")];
    // After the alias change the card purchase is attributed to B1.
    const src = sources({ purchases: purchases as never, cards: [card("P", "B1", 300, "2026-10-03")] as never });
    const allocations = [alloc("a1", "P", "IA", 300)];
    expect(staleReasonOf(allocations[0]!, buildLinkIndex(src))).toBe("payment_moved");
    const ctxA = buildSupplierContexts(src, allocations).get("A1")!;
    // A: the invoice is open again and the link is listed as «Связь устарела» …
    const cardA = toSupplierCard(ctxA, "A1");
    expect(cardA.invoices[0]!.status).toBe("unpaid");
    expect(cardA.stale).toHaveLength(1);
    // … and B may auto-confirm P onto IB, so P is counted exactly once.
    expect(confirmedOnPayment(src, allocations, "B1", "P")).toBe(300);
    // Once the alias goes back to A1 the link holds again.
    const back = sources({ purchases: purchases as never, cards: [card("P", "A1", 300, "2026-10-03")] as never });
    expect(staleReasonOf(allocations[0]!, buildLinkIndex(back))).toBeNull();
  });

  it("unattributed / ignored card purchase makes its links stale too", () => {
    const src = sources({ purchases: [purchase("IA", "A1", 300, "2026-10-01")] as never, cards: [card("P", null, 300, "2026-10-03")] as never });
    expect(staleReasonOf(alloc("a1", "P", "IA", 300), buildLinkIndex(src))).toBe("payment_moved");
    expect(staleReasonOf(alloc("a2", "P", "IA", 300, "rejected"), buildLinkIndex(src))).toBeNull();
  });

  it("operational IDNOs («Не клиенты») are not matched unless a manual category says so", () => {
    const base = { purchases: [purchase("I", "100", 500, "2026-10-01")] as never, debits: [debit("P", "100", 500, "2026-10-05")] as never };
    expect(buildSupplierContexts(sources({ ...base, operationalIdnos: new Set(["100"]) }), []).has("100")).toBe(false);
    const manual = new Map([["100", { category: "supplier", name: null }]]);
    expect(
      buildSupplierContexts(sources({ ...base, operationalIdnos: new Set(["100"]), categories: manual as never }), []).has("100"),
    ).toBe(true);
  });

  it("fixed: invoice total lowered on refetch below confirmed links → paid capped, «Привязано больше суммы фактуры»", () => {
    const src = sources({ purchases: [purchase("I", "100", 800, "2026-10-01")] as never, debits: [debit("P", "100", 1000, "2026-10-05")] as never });
    const ctxs = buildSupplierContexts(src, [alloc("a1", "P", "I", 1000)]);
    const card = toSupplierCard(ctxs.get("100"), "100");
    expect(card.invoices[0]).toMatchObject({ paid: 800, total: 800, overAllocated: 200, status: "paid" });
    const sig = computeChecks({
      now: day("2026-11-10"), rows: [], suppliers: ctxs, matchingRan: true,
      cards: { unattributedCount: 0, unattributedSum: 0 }, lowConfidenceSales: [], vatSales: [], vatPurchases: [],
    }).find((x) => x.type === "over_allocated");
    expect(sig).toMatchObject({ key: "over_allocated:100:I", amount: 200, documents: ["EAAI"] });
  });
});

describe("QA negative invoices (credit notes / storno)", () => {
  it("never receive allocations (regression)", () => {
    const src = sources({
      purchases: [purchase("CN", "100", -855, "2026-10-01"), purchase("I", "100", 2000, "2026-09-01")] as never,
      debits: [debit("P", "100", 1145, "2026-10-05", "f-ra CN")] as never,
    });
    const ctx = buildSupplierContexts(src, []).get("100")!;
    const out = suggestSupplierMatches({ payments: ctx.payments, invoices: ctx.invoices, allocations: [] });
    expect(out.some((s) => s.invoiceId === "CN")).toBe(false);
  });

  it("fixed: credit note offsets — invoice 1000 − storno 200, payment 800 pays the invoice", () => {
    const out = suggestSupplierMatches({
      payments: [{ id: "P", amount: 800, date: day("2026-10-10"), purpose: null, kind: "bank", document: "1" }],
      invoices: [
        { id: "I", seria: "EAA", number: "1", total: 1000, issueDate: day("2026-10-01"), paidOnSpot: false },
        { id: "CN", seria: "EAA", number: "2", total: -200, issueDate: day("2026-10-03"), paidOnSpot: false },
      ],
      allocations: [],
    });
    // The storno nets I down to 800: a unique exact amount → auto-confirmed.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ invoiceId: "I", amount: 800, signal: "exact", autoConfirm: true });
    expect(invoicePaymentStatus(1000, 800, false, 200)).toBe("paid");
    expect(invoicePaymentStatus(1000, 800, false)).toBe("partial");
  });

  it("card: storno offset shown on the oldest open invoice, credit note is «Сторно»", () => {
    const src = sources({
      purchases: [purchase("I", "100", 1000, "2026-10-01"), purchase("CN", "100", -200, "2026-10-03"), purchase("J", "100", 500, "2026-10-04")] as never,
      debits: [debit("P", "100", 800, "2026-10-10")] as never,
    });
    const card = toSupplierCard(buildSupplierContexts(src, [alloc("a1", "P", "I", 800)]).get("100"), "100");
    const byId = new Map(card.invoices.map((i) => [i.id, i]));
    expect(byId.get("I")).toMatchObject({ paid: 800, creditOffset: 200, status: "paid" });
    expect(byId.get("J")).toMatchObject({ creditOffset: 0, status: "unpaid" });
    expect(byId.get("CN")!.status).toBe("credit");
    expect(card.counts).toMatchObject({ paid: 1, unpaid: 1, credit: 1 });
  });

  it("fixed: credit note has the neutral «Сторно» status (card counts + Закупки pill)", () => {
    expect(invoicePaymentStatus(-855, 0, false)).toBe("credit");
    expect(invoicePaymentStatus(-855, 0, true)).toBe("credit");
  });
});

describe("rejected suggestions on the card («Отклонённые»)", () => {
  it("are returned with ids and summary (newest first), never counted as links or suggestions", () => {
    const src = sources({
      purchases: [purchase("I", "100", 500, "2026-10-01"), purchase("J", "100", 300, "2026-10-02")] as never,
      debits: [debit("P", "100", 500, "2026-10-05")] as never,
    });
    const allocations = [
      { ...alloc("r1", "P", "I", 500, "rejected"), confidence: 60, reason: "сумма", confirmedById: "u1", confirmedAt: day("2026-10-06") },
      { ...alloc("r2", "P", "J", 300, "rejected"), confidence: 40, confirmedById: null, confirmedAt: day("2026-10-08") },
      alloc("s1", "P", "J", 300, "suggested"),
    ];
    const card = toSupplierCard(buildSupplierContexts(src, allocations).get("100"), "100");
    expect(card.rejected.map((l) => l.allocationId)).toEqual(["r2", "r1"]);
    expect(card.rejected[1]).toMatchObject({
      allocationId: "r1",
      paymentId: "P",
      invoiceId: "I",
      amount: 500,
      status: "rejected",
      confidence: 60,
      reason: "сумма",
      paymentDate: day("2026-10-05").toISOString(),
      paymentAmount: 500,
      paymentKind: "bank",
      paymentDocument: "P",
      invoiceDocument: "EAAI",
      invoiceDate: day("2026-10-01").toISOString(),
      invoiceTotal: 500,
      rejectedAt: day("2026-10-06").toISOString(),
      rejectedById: "u1",
    });
    expect(card.suggestions.map((s) => s.allocationId)).toEqual(["s1"]);
    expect(card.invoices.flatMap((i) => i.links).some((l) => l.status === "rejected")).toBe(false);
    expect(card.payments[0]!.links.some((l) => l.status === "rejected")).toBe(false);
    expect(card.stale).toHaveLength(0);
  });

  it("empty card has an empty rejected list", () => {
    expect(toSupplierCard(undefined, "100").rejected).toEqual([]);
  });
});
