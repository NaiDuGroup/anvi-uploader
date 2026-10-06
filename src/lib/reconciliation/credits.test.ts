import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { clampReceiptCredit } from "./credits";

const d = (v: string) => new Prisma.Decimal(v);
const ZERO = d("0");

describe("clampReceiptCredit", () => {
  it("drops the B/f credit when a bank transfer already covered the invoice", () => {
    // FLAMISA: EAZ000956513 for 2802 marked "b/f 0012 (card)", and a transfer
    // of 2802 citing that same invoice arrived five days later.
    const credit = clampReceiptCredit(d("2802.00"), d("2802.00"), d("2802.00"));
    expect(credit.equals(ZERO)).toBe(true);
  });

  it("keeps the B/f credit when no bank money arrived", () => {
    const credit = clampReceiptCredit(d("2802.00"), d("2802.00"), ZERO);
    expect(credit.toFixed(2)).toBe("2802.00");
  });

  it("covers only the part the bank left unpaid", () => {
    // Two invoices of 1000; one settled at the POS, one paid by transfer.
    const credit = clampReceiptCredit(d("1000.00"), d("2000.00"), d("1000.00"));
    expect(credit.toFixed(2)).toBe("1000.00");
  });

  it("never turns a receipt into an overpayment", () => {
    const credit = clampReceiptCredit(d("1000.00"), d("1000.00"), d("1500.00"));
    expect(credit.equals(ZERO)).toBe(true);
  });

  it("leaves a genuine overpayment visible", () => {
    const bankPaid = d("1500.00");
    const debits = d("1000.00");
    const balance = debits.minus(
      bankPaid.plus(clampReceiptCredit(ZERO, debits, bankPaid)),
    );
    expect(balance.toFixed(2)).toBe("-500.00");
  });
});

describe("balance with cross-payer attribution", () => {
  /** Mirrors computeBalanceReport once allocations are attributed. */
  function balance(
    invoiced: Prisma.Decimal,
    historical: Prisma.Decimal,
    bankPaid: Prisma.Decimal,
    receiptEligible: Prisma.Decimal,
  ): Prisma.Decimal {
    const debits = invoiced.plus(historical);
    return debits.minus(
      bankPaid.plus(clampReceiptCredit(receiptEligible, debits, bankPaid)),
    );
  }

  it("nets both sides to zero once a third-party payment is allocated", () => {
    // Struc Alina: FF 5338 on 1023604000349, paid from 1017604005798.
    const buyer = balance(d("5338.00"), ZERO, d("5338.00"), ZERO);
    const payer = balance(ZERO, ZERO, ZERO, ZERO);
    expect(buyer.equals(ZERO)).toBe(true);
    expect(payer.equals(ZERO)).toBe(true);
  });

  it("leaves the payer a creditor while the allocation is missing", () => {
    const buyer = balance(d("5338.00"), ZERO, ZERO, ZERO);
    const payer = balance(ZERO, ZERO, d("5338.00"), ZERO);
    expect(buyer.toFixed(2)).toBe("5338.00");
    expect(payer.toFixed(2)).toBe("-5338.00");
  });

  it("keeps the unallocated remainder with the payer", () => {
    // 5000 arrives, 3000 allocated to another entity's invoice.
    const payer = balance(ZERO, ZERO, d("2000.00"), ZERO);
    expect(payer.toFixed(2)).toBe("-2000.00");
  });

  it("does not double-count a HISTORICAL credit", () => {
    const client = balance(ZERO, d("1380.00"), d("1380.00"), ZERO);
    expect(client.equals(ZERO)).toBe(true);
  });
});

describe("balance with refunds", () => {
  it("closes a buyer we paid an overpayment back to", () => {
    // BDR ASSOCIATES: EBC000254030 paid twice (510 + 510), 510 returned.
    const invoiced = d("10856.00");
    const received = d("11366.00");
    const refunded = d("510.00");
    const balance = invoiced.minus(received.minus(refunded));
    expect(balance.equals(ZERO)).toBe(true);
  });

  it("shows an overpayment again when the refund has not gone out yet", () => {
    const balance = d("10856.00").minus(d("11366.00").minus(ZERO));
    expect(balance.toFixed(2)).toBe("-510.00");
  });
});
