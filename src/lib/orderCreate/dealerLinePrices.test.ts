import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { dealerFreeLines, dealerLineTotalsMdl, dealerOrderTotalMdl } from "./dealerLinePrices";

function line(productType: string, extras: Partial<ResolvedAdminOrderLine> = {}): ResolvedAdminOrderLine {
  return {
    input: { productType, files: [{ fileName: "a.pdf", fileUrl: "u", copies: 1 }] },
    ...extras,
  } as unknown as ResolvedAdminOrderLine;
}

const sheet = (pricePerSheetMdl: number, totalSellPriceMdl: number) =>
  line("business_card", {
    businessCardExtras: {
      businessCardLineData: { pricePerSheetMdl, totalSellPriceMdl },
    } as unknown as ResolvedAdminOrderLine["businessCardExtras"],
  });

const uv = (totalSellPriceMdl: number, priceNotSet?: boolean) =>
  line("uv_print", {
    uvExtras: {
      uvLineData: { pricing: { totalSellPriceMdl, ...(priceNotSet ? { priceNotSet } : {}) } },
    } as unknown as ResolvedAdminOrderLine["uvExtras"],
  });

const sublimation = (totalSellPriceMdl: number, priceNotSet?: boolean) =>
  line("sublimation_print", {
    sublimationExtras: {
      sublimationLineData: { pricing: { totalSellPriceMdl, ...(priceNotSet ? { priceNotSet } : {}) } },
    } as unknown as ResolvedAdminOrderLine["sublimationExtras"],
  });

describe("dealerLineTotalsMdl", () => {
  it("prices a sheet line from its paper rate", async () => {
    expect(await dealerLineTotalsMdl([sheet(5, 40)], new Map())).toEqual([40]);
  });

  it("sheet paper without a price is unpriced, never 0", async () => {
    expect(await dealerLineTotalsMdl([sheet(0, 0)], new Map())).toEqual([null]);
    // A line minimum alone does not price a paper without a rate.
    expect(await dealerLineTotalsMdl([sheet(0, 150)], new Map())).toEqual([null]);
  });

  it("paper print and unpriced UV / sublimation print are null", async () => {
    expect(
      await dealerLineTotalsMdl([line("paper_print"), uv(0, true), sublimation(0, true), sublimation(0)], new Map()),
    ).toEqual([null, null, null, null]);
    expect(await dealerLineTotalsMdl([uv(120), sublimation(90)], new Map())).toEqual([120, 90]);
  });

  it("large format: the group share, else null for a 0 total", async () => {
    expect(await dealerLineTotalsMdl([line("large_format_print")], new Map([[0, 300]]))).toEqual([300]);
    expect(await dealerLineTotalsMdl([line("large_format_print")], new Map([[0, 0]]))).toEqual([null]);
  });
});

describe("dealerOrderTotalMdl", () => {
  it("sums priced lines", () => {
    expect(dealerOrderTotalMdl([40, 120.5])).toBe(160.5);
  });

  it("null when any line has no price or a 0 price (never a free line)", () => {
    expect(dealerOrderTotalMdl([])).toBeNull();
    expect(dealerOrderTotalMdl([null])).toBeNull();
    expect(dealerOrderTotalMdl([200, null])).toBeNull();
    expect(dealerOrderTotalMdl([200, 0])).toBeNull();
    expect(dealerOrderTotalMdl([0])).toBeNull();
  });
});

describe("«Набор» box line (dealer)", () => {
  const setLine = (productType: string, role: string, lineTotalMdl: number) =>
    line(productType, { giftSetExtras: { setGroupId: "g", setData: { role, lineTotalMdl } } } as unknown as Partial<ResolvedAdminOrderLine>);
  it("the box line is 0 «входит в набор» and left out of the order total", async () => {
    const resolved = [setLine("notebook", "notebook", 392), setLine("pen", "pen", 206), setLine("set_box", "box", 0)];
    const totals = await dealerLineTotalsMdl(resolved, new Map());
    expect(totals).toEqual([392, 206, 0]);
    expect(dealerFreeLines(resolved)).toEqual([false, false, true]);
    expect(dealerOrderTotalMdl(totals, dealerFreeLines(resolved))).toBe(598);
    // Without the mask a 0 line is still never summed as free.
    expect(dealerOrderTotalMdl(totals)).toBeNull();
  });

  it("set C: thermos / notebook / pen carry the dealer set price, the set item's stock line is 0 and left out", async () => {
    // Dealer price 450 × 2 sets split 233 / 142 / 75 per set.
    const resolved = [
      setLine("uv_print", "ready", 466),
      setLine("notebook", "ready", 284),
      setLine("pen", "ready", 150),
      setLine("set_box", "box", 0),
    ];
    const totals = await dealerLineTotalsMdl(resolved, new Map());
    expect(totals).toEqual([466, 284, 150, 0]);
    expect(dealerFreeLines(resolved)).toEqual([false, false, false, true]);
    expect(dealerOrderTotalMdl(totals, dealerFreeLines(resolved))).toBe(900);
  });
});
