import { afterEach, describe, expect, it, vi } from "vitest";
import { boardLineKey, groupLinesByOrder, isLegacyBoardLine, markLinesPrinting } from "./lineStatusClient";

describe("groupLinesByOrder", () => {
  it("groups by order in first-appearance order, without duplicate lines", () => {
    const res = groupLinesByOrder([
      { orderId: "o1", orderLineId: "a" },
      { orderId: "o2", orderLineId: "c" },
      { orderId: "o1", orderLineId: "b" },
      { orderId: "o1", orderLineId: "a" },
    ]);
    expect(res.items).toEqual([
      { orderId: "o1", lineIds: ["a", "b"] },
      { orderId: "o2", lineIds: ["c"] },
    ]);
    expect(res.legacyOrderIds).toEqual([]);
  });

  it("keeps legacy orders (no OrderLine rows) apart", () => {
    const res = groupLinesByOrder([
      { orderId: "o1", orderLineId: "legacy" },
      { orderId: "o1", orderLineId: "legacy" },
      { orderId: "o2", orderLineId: "x" },
    ]);
    expect(res).toEqual({ items: [{ orderId: "o2", lineIds: ["x"] }], legacyOrderIds: ["o1"] });
  });

  it("keys and legacy detection", () => {
    expect(boardLineKey("o", "l")).toBe("o::l");
    expect(isLegacyBoardLine("legacy")).toBe(true);
    expect(isLegacyBoardLine("uuid")).toBe(false);
  });
});

describe("markLinesPrinting (batch runners)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PATCHes only the batched lines, one call per order; legacy orders move as a whole", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response("{}", { status: url.includes("o-bad") ? 500 : 200 });
      }),
    );
    const progress: number[] = [];
    const res = await markLinesPrinting(
      [
        { orderId: "o1", orderLineId: "mug-1" },
        { orderId: "o1", orderLineId: "mug-1" },
        { orderId: "o1", orderLineId: "mug-2" },
        { orderId: "o-bad", orderLineId: "mug-3" },
        { orderId: "o-legacy", orderLineId: "legacy" },
      ],
      (done) => progress.push(done),
    );
    expect(res).toEqual({ updated: 2, failed: 1 });
    expect(calls).toEqual(
      expect.arrayContaining([
        { url: "/api/orders/o1/lines/status", body: { lineIds: ["mug-1", "mug-2"], status: "PRINTING" } },
        { url: "/api/orders/o-bad/lines/status", body: { lineIds: ["mug-3"], status: "PRINTING" } },
        { url: "/api/orders/o-legacy", body: { status: "WORKSHOP_PRINTING" } },
      ]),
    );
    expect(calls).toHaveLength(3);
    // Never the order-level status for orders with real lines.
    expect(calls.filter((c) => c.url === "/api/orders/o1")).toEqual([]);
    expect(progress.sort()).toEqual([1, 2, 3]);
  });
});
