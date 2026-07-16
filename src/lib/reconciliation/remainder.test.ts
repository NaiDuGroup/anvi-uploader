import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  leftoverBadgeKind,
  remainingAllocatableOnTx,
} from "./autoMatch";
import { getReconLabels } from "./labels";

const D = (n: string) => new Prisma.Decimal(n);

describe("leftoverBadgeKind", () => {
  it("returns none when leftover is negligible", () => {
    expect(leftoverBadgeKind(0, true)).toBe("none");
    expect(leftoverBadgeKind(0.001, false)).toBe("none");
  });

  it("labels leftover as remainder when buyer has open receivables", () => {
    expect(leftoverBadgeKind(4960, true)).toBe("remainder");
  });

  it("labels leftover as overpaid when no open fiscal invoices", () => {
    expect(leftoverBadgeKind(4960, false)).toBe("overpaid");
  });
});

describe("remainder badge labels", () => {
  it("RU distinguishes remainder vs overpay wording", () => {
    const L = getReconLabels("ru");
    expect(L.remainderToAllocate).toBe("Остаток к разносу");
    expect(L.allocateRemainder).toBe("Разнести остаток");
    expect(L.overpaid).toBe("Переплата");
  });

  it("RO/EN expose allocate-remainder strings", () => {
    expect(getReconLabels("ro").remainderToAllocate).toBeTruthy();
    expect(getReconLabels("en").allocateRemainder).toMatch(/remainder/i);
  });
});

/**
 * Pure Decimal scenario mirroring PERFECT LINE after a cited match:
 * payment 13910, cited allocation 8950 → room left 4960 for the next open FF.
 * (Full FIFO DB path is covered by allocateRemainderFifo at runtime.)
 */
describe("remainder room after cited match (PERFECT LINE shape)", () => {
  it("caps next allocation to unallocated remainder only", () => {
    const txAmount = D("13910.00");
    const afterCited = [
      { fiscalInvoiceId: "cited-ff", amount: D("8950.00") },
    ];
    expect(
      remainingAllocatableOnTx(txAmount, afterCited, "ear-open").toFixed(2),
    ).toBe("4960.00");
  });

  it("does not allow a second full-payment apply on top of cited", () => {
    const txAmount = D("13910.00");
    const afterCited = [
      { fiscalInvoiceId: "cited-ff", amount: D("8950.00") },
    ];
    // Bug we fixed: treating leftover as a fresh 13910 would over-allocate.
    expect(
      remainingAllocatableOnTx(txAmount, afterCited, "ear-open").lessThan(
        txAmount,
      ),
    ).toBe(true);
  });
});
