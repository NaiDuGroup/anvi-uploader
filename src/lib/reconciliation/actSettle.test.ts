import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { ACT_BALANCE_TOLERANCE } from "./actSettle";
import { shouldSkipFifoForPurpose } from "./match";

describe("shouldSkipFifoForPurpose", () => {
  it("skips FIFO when purpose cites a paper FF", () => {
    expect(
      shouldSkipFifoForPurpose(
        "Plata pu flaere conf orm factura AAQ45576 43 din 03.03.23",
      ),
    ).toBe(true);
  });

  it("skips FIFO when purpose cites an e-Factura number", () => {
    expect(
      shouldSkipFifoForPurpose(
        "Plata pu servicii im primare conformfactu ra EAN000367103 din 23.03.24",
      ),
    ).toBe(true);
  });

  it("allows FIFO when purpose has no document reference", () => {
    expect(shouldSkipFifoForPurpose("Transfer intern")).toBe(false);
    expect(shouldSkipFifoForPurpose(null)).toBe(false);
  });
});

describe("ACT_BALANCE_TOLERANCE", () => {
  it("treats near-zero balances as settled", () => {
    const balance = new Prisma.Decimal("0.004");
    expect(balance.abs().lessThanOrEqualTo(ACT_BALANCE_TOLERANCE)).toBe(true);
    expect(
      new Prisma.Decimal("0.01").abs().lessThanOrEqualTo(ACT_BALANCE_TOLERANCE),
    ).toBe(false);
  });
});
