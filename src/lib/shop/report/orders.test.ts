import { describe, expect, it } from "vitest";
import { SHOP_TEST_ORDER_NOTE_PREFIX } from "@/lib/shop/orderFlags";
import { aggregateShopOrders, isReportableShopOrder, shopOrdersCsv, type ShopReportOrderRow } from "./orders";
import { dayStart, parseShopReportPeriod, periodBuckets, toCsv, weekKeyOf } from "./period";

let n = 0;
function order(p: Partial<ShopReportOrderRow> = {}): ShopReportOrderRow {
  n += 1;
  return {
    id: `o${n}`,
    orderNumber: 1000 + n,
    createdAt: new Date("2026-11-03T10:00:00Z"),
    source: "shop",
    price: 100,
    isPaid: true,
    paymentStatus: "paid",
    paymentProvider: "paynet",
    notes: "Сайт · Самовывоз",
    deletedAt: null,
    deliveryMethod: "pickup",
    deliveryPriceMdl: 0,
    shopCustomerId: null,
    customerEmail: null,
    promoCode: null,
    promoDiscountMdl: null,
    orderLines: [],
    ...p,
  };
}

const PERIOD = { from: "2026-11-01", to: "2026-11-07" };

describe("shop orders report — exclusions", () => {
  const rows = [
    order({ price: 200 }),
    order({ price: 50, paymentProvider: "test" }),
    order({ price: 70, notes: `${SHOP_TEST_ORDER_NOTE_PREFIX} Сайт · Самовывоз`, paymentProvider: "paynet" }),
    order({ price: 999, deletedAt: new Date() }),
    order({ price: 500, source: "studio" }),
  ];

  it("leaves out test, deleted and studio orders by default", () => {
    const r = aggregateShopOrders(rows, PERIOD);
    expect(r.summary.orders).toBe(1);
    expect(r.summary.revenue).toBe(200);
    expect(r.summary.testOrders).toBe(2);
  });

  it("includes test orders when toggled, never deleted or studio ones", () => {
    const r = aggregateShopOrders(rows, { ...PERIOD, includeTest: true });
    expect(r.summary.orders).toBe(3);
    expect(r.summary.revenue).toBe(320);
    expect(r.includeTest).toBe(true);
  });

  it("isReportableShopOrder matches the same rule", () => {
    expect(isReportableShopOrder(order({ paymentProvider: "test" }), false)).toBe(false);
    expect(isReportableShopOrder(order({ paymentProvider: "test" }), true)).toBe(true);
    expect(isReportableShopOrder(order({ deletedAt: new Date() }), true)).toBe(false);
  });
});

describe("shop orders report — money", () => {
  it("counts revenue from paid orders only; AOV over paid; unpaid apart", () => {
    const r = aggregateShopOrders(
      [
        order({ price: 100 }),
        order({ price: "250.50" as unknown as number }),
        order({ price: 80, isPaid: false, paymentStatus: "pending" }),
        order({ price: 40, isPaid: false, paymentStatus: "failed" }),
        // Marked paid by staff (cash on pickup): paid.
        order({ price: 60, isPaid: true, paymentStatus: "pending" }),
      ],
      PERIOD,
    );
    expect(r.summary).toMatchObject({ orders: 5, paid: 3, unpaid: 2, revenue: 410.5, unpaidAmount: 120 });
    expect(r.summary.aov).toBe(136.83);
  });

  it("revenue is the discounted price; discounts are summed separately", () => {
    const r = aggregateShopOrders(
      [order({ price: 90, promoCode: "LANSARE10", promoDiscountMdl: 10 }), order({ price: 100, promoCode: "X", promoDiscountMdl: 5, isPaid: false, paymentStatus: "pending" })],
      PERIOD,
    );
    expect(r.summary.revenue).toBe(90);
    expect(r.summary.discount).toBe(10);
    expect(r.summary.promoOrders).toBe(1);
  });

  it("buckets by Chișinău day, ISO week and month, empty buckets included", () => {
    const r = aggregateShopOrders(
      [
        // 23:30 UTC on Nov 2 = 01:30 on Nov 3 in Chișinău (UTC+2).
        order({ createdAt: new Date("2026-11-02T23:30:00Z"), price: 10 }),
        order({ createdAt: new Date("2026-11-03T08:00:00Z"), price: 20, isPaid: false, paymentStatus: "pending" }),
      ],
      PERIOD,
    );
    expect(r.series.day).toHaveLength(7);
    const nov3 = r.series.day.find((b) => b.key === "2026-11-03")!;
    expect(nov3).toMatchObject({ orders: 2, paid: 1, unpaid: 1, revenue: 10, aov: 10 });
    expect(r.series.day.find((b) => b.key === "2026-11-02")!.orders).toBe(0);
    expect(r.series.week.map((b) => b.key)).toEqual(["2026-10-26", "2026-11-02"]);
    expect(r.series.month.map((b) => b.key)).toEqual(["2026-11"]);
  });

  it("splits delivery methods, unknown ones as «other»", () => {
    const r = aggregateShopOrders(
      [
        order({ deliveryMethod: "courier_moldova", price: 150 }),
        order({ deliveryMethod: "pickup", price: 100 }),
        order({ deliveryMethod: "pickup", price: 30, isPaid: false, paymentStatus: "pending" }),
        order({ deliveryMethod: null, price: 5 }),
      ],
      PERIOD,
    );
    expect(r.delivery).toEqual([
      { method: "pickup", orders: 2, paid: 1, revenue: 100 },
      { method: "courier_moldova", orders: 1, paid: 1, revenue: 150 },
      { method: "other", orders: 1, paid: 1, revenue: 5 },
    ]);
  });
});

describe("shop orders report — customers and products", () => {
  it("new vs returning by account id or e-mail (prior paid order before the period)", () => {
    const r = aggregateShopOrders(
      [
        order({ shopCustomerId: "c1", customerEmail: "a@x.md", price: 100 }),
        order({ shopCustomerId: "c1", customerEmail: "a@x.md", price: 50 }),
        order({ customerEmail: "B@X.md", price: 70 }),
        order({ shopCustomerId: "c3", customerEmail: "c@x.md", price: 30 }),
        order({ price: 10 }),
        order({ shopCustomerId: "c9", price: 10, isPaid: false, paymentStatus: "pending" }),
      ],
      { ...PERIOD, priorPaidKeys: new Set(["email:b@x.md", "id:c3"]) },
    );
    expect(r.customers).toEqual({ new: 1, returning: 2, newRevenue: 150, returningRevenue: 100, unknown: 1 });
  });

  it("top products and categories from paid lines, via the server-side line resolver", () => {
    const line = (slug: string, qty: number, total: number) => ({
      shopLineData: { title: `T ${slug}`, quantity: qty, total, quote: { slug } },
    });
    const r = aggregateShopOrders(
      [
        order({ orderLines: [line("cana-alba", 2, 300), line("tricou", 1, 200)] }),
        order({ orderLines: [line("cana-alba", 1, 150)] }),
        order({ isPaid: false, paymentStatus: "pending", orderLines: [line("tricou", 50, 9999)] }),
        order({ orderLines: [{ shopLineData: { title: "Old", quantity: 1, total: 5, quote: null } }] }),
      ],
      {
        ...PERIOD,
        resolveLine: (q) => {
          const slug = (q as { slug?: string } | null)?.slug;
          return slug ? { slug, category: slug === "tricou" ? "tricouri" : "cani" } : null;
        },
        productNames: { "cana-alba": "Кружка белая" },
      },
    );
    expect(r.topProducts[0]).toEqual({ slug: "cana-alba", name: "Кружка белая", category: "cani", qty: 3, lines: 2, amount: 450 });
    expect(r.topProducts[1]).toMatchObject({ slug: "tricou", name: "T tricou", qty: 1, amount: 200 });
    expect(r.topProducts[2]).toMatchObject({ slug: "", name: "Old", category: null });
    expect(r.topCategories.map((c) => [c.category, c.amount])).toEqual([
      ["cani", 450],
      ["tricouri", 200],
      [null, 5],
    ]);
  });
});

describe("shop orders CSV", () => {
  it("one row per reportable order, no personal data, test orders only when asked", () => {
    const rows = [
      order({ orderNumber: 7, customerEmail: "secret@x.md", promoCode: "SALE", promoDiscountMdl: 12.5, price: 87.5 }),
      order({ orderNumber: 8, paymentProvider: "test" }),
    ];
    const csv = shopOrdersCsv(rows, {});
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("7;");
    expect(lines[1]).toContain(";87.5;");
    expect(lines[1]).toContain(";12.5;SALE;");
    expect(csv).not.toContain("secret@x.md");
    expect(shopOrdersCsv(rows, { includeTest: true }).trim().split("\r\n")).toHaveLength(3);
  });

  it("escapes separators and formula-like text", () => {
    expect(toCsv([["a;b", '=1+1', 'q"x', 5]])).toBe('﻿"a;b";\'=1+1;"q""x";5\r\n');
  });
});

describe("report period", () => {
  it("parses Chișinău days, swaps reversed ranges, refuses junk and too long periods", () => {
    const p = parseShopReportPeriod("2026-11-07", "2026-11-01");
    expect("error" in p).toBe(false);
    if ("error" in p) return;
    expect([p.from, p.to]).toEqual(["2026-11-01", "2026-11-07"]);
    // EET (UTC+2) in November.
    expect(p.start.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-07T22:00:00.000Z");
    expect(parseShopReportPeriod("2026-13-01", "2026-11-01")).toEqual({ error: "invalid_period" });
    expect(parseShopReportPeriod("2024-01-01", "2026-11-01")).toEqual({ error: "period_too_long" });
  });

  it("defaults to the last 30 days and handles summer time", () => {
    const p = parseShopReportPeriod(null, null, new Date("2026-11-05T12:00:00Z"));
    expect("error" in p ? null : [p.from, p.to]).toEqual(["2026-10-07", "2026-11-05"]);
    // EEST (UTC+3) in July.
    expect(dayStart("2026-07-01").toISOString()).toBe("2026-06-30T21:00:00.000Z");
    // The night the clocks go back (25 Oct 2026): the day still starts at local midnight (UTC+3).
    expect(dayStart("2026-10-25").toISOString()).toBe("2026-10-24T21:00:00.000Z");
  });

  it("weeks start on Monday", () => {
    expect(weekKeyOf("2026-11-08")).toBe("2026-11-02");
    expect(weekKeyOf("2026-11-02")).toBe("2026-11-02");
    expect(periodBuckets("2026-10-30", "2026-11-03", "month")).toEqual(["2026-10", "2026-11"]);
  });
});
