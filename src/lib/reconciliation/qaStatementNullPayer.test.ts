/**
 * QA (prod lead AMBASADA UCRAINEI 320340): a CREDIT without a payer IDNO
 * (counterparty_idno NULL, e.g. a foreign account) allocated by hand to the
 * buyer's invoice. computeSalesBalances / «Должники» / «Взаиморасчёты» list
 * count it as paid (attributeCredits takes every CREDIT allocation), but
 * computeClientStatement (old act, PDF act, settlements ledger) drops it:
 * - `payments` query is `counterpartyIdno: buyerIdno` → NULL payer excluded;
 * - `foreignAllocations` is `counterpartyIdno: { not: buyerIdno }` → Prisma
 *   emits `counterparty_idno <> $1`, which is NULL-false in SQL, so NULL payers
 *   are excluded too.
 * The mock below applies SQL semantics for `not` (NULL never matches);
 * the fix adds an explicit `counterpartyIdno: null` OR-branch.
 */
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

const BUYER = "320340";
const D = (v: number) => new Prisma.Decimal(v);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const credit = {
  id: "cr1",
  direction: "CREDIT",
  bookingDate: day("2026-07-16"),
  amount: D(350),
  documentNumber: "77",
  purpose: "Plata EAX000497420",
  counterpartyIdno: null as string | null,
  counterpartyName: "EMBASSY OF UKRAINE",
};
const allocation = {
  amount: D(350),
  note: null,
  fiscalInvoice: { buyerIdno: BUYER },
  bankTransaction: credit,
};

const sqlNot = (val: unknown, not: unknown) => val != null && val !== not;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiscalInvoice: {
      findMany: vi.fn(async () => [
        {
          id: "f1",
          seria: "EAX",
          number: "000497420",
          issueDate: day("2026-07-10"),
          totalAmount: D(350),
          paidAt: day("2026-07-16"),
          buyerName: "AMBASADA UCRAINEI",
          receiptRef: null,
          receiptMethod: null,
          receiptSettledAt: null,
          receiptPhotoKey: null,
          redirections: null,
        },
      ]),
    },
    bankTransaction: {
      findMany: vi.fn(async (args: { where: { counterpartyIdno?: unknown } }) =>
        args.where.counterpartyIdno === credit.counterpartyIdno ? [{ ...credit, allocations: [allocation] }] : [],
      ),
    },
    paymentAllocation: {
      findMany: vi.fn(
        async (args: {
          where: {
            bankTransaction: {
              counterpartyIdno?: { not: string };
              OR?: Array<{ counterpartyIdno: null | { not: string } }>;
            };
          };
        }) => {
          const bt = args.where.bankTransaction;
          const conds = bt.OR ?? [{ counterpartyIdno: bt.counterpartyIdno ?? null }];
          const hit = conds.some((c) =>
            c.counterpartyIdno === null
              ? credit.counterpartyIdno == null
              : sqlNot(credit.counterpartyIdno, c.counterpartyIdno.not),
          );
          return hit ? [allocation] : [];
        },
      ),
    },
  },
}));
vi.mock("@/lib/invoice/companyProfile", () => ({
  getOrCreateCompanyProfile: vi.fn(async () => ({ fiscalCode: "1023600000396" })),
}));
vi.mock("./credits", async (orig) => ({
  ...(await orig<typeof import("./credits")>()),
  loadRefunds: vi.fn(async () => []),
}));

describe("computeClientStatement: allocation from a payer without IDNO", () => {
  it("credit side agrees with attributeCredits (sales balance)", async () => {
    const { attributeCredits } = await import("./credits");
    const { computeClientStatement } = await import("./report");
    const attribution = attributeCredits(
      [{ id: credit.id, amount: credit.amount, counterpartyIdno: null, matchStatus: "MATCHED" }],
      [{ bankTransactionId: credit.id, amount: D(350), bankTransaction: { direction: "CREDIT" }, fiscalInvoice: { buyerIdno: BUYER } }],
      [],
    );
    expect(Number(attribution.paidByIdno.get(BUYER))).toBe(350); // list / «Должники»: paid
    const st = await computeClientStatement(BUYER);
    expect(st?.totalPaid).toBe("350.00"); // act / ledger agree with the list
  });
});
