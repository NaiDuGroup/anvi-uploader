import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { remainingAllocatableOnTx } from "./autoMatch";

const D = (n: string) => new Prisma.Decimal(n);

describe("remainingAllocatableOnTx", () => {
  it("returns full tx amount when nothing allocated yet", () => {
    expect(
      remainingAllocatableOnTx(D("16748.00"), [], "inv-a").toFixed(2),
    ).toBe("16748.00");
  });

  it("subtracts other invoices but not the same pair (upsert replace)", () => {
    const allocs = [
      { fiscalInvoiceId: "inv-a", amount: D("14605.00") },
      { fiscalInvoiceId: "inv-b", amount: D("1000.00") },
    ];
    // Updating inv-a: room = 16748 - 1000 = 15748
    expect(
      remainingAllocatableOnTx(D("16748.00"), allocs, "inv-a").toFixed(2),
    ).toBe("15748.00");
    // New inv-c: room = 16748 - 14605 - 1000 = 1143
    expect(
      remainingAllocatableOnTx(D("16748.00"), allocs, "inv-c").toFixed(2),
    ).toBe("1143.00");
  });

  it("returns zero when other allocations already fill the tx (PRUT bug)", () => {
    const allocs = [{ fiscalInvoiceId: "inv-a", amount: D("14605.00") }];
    // After cited match of 14605 on 16748, FIFO for inv-b may only take 2143
    expect(
      remainingAllocatableOnTx(D("16748.00"), allocs, "inv-b").toFixed(2),
    ).toBe("2143.00");
    const full = [
      { fiscalInvoiceId: "inv-a", amount: D("14605.00") },
      { fiscalInvoiceId: "inv-b", amount: D("2143.00") },
    ];
    expect(
      remainingAllocatableOnTx(D("16748.00"), full, "inv-c").toFixed(2),
    ).toBe("0.00");
  });
});
