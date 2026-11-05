import { describe, expect, it } from "vitest";
import { mergeClientOrderAggregates } from "@/lib/clientDebt";
import { renderShopEmail } from "@/lib/email/templates";
import { computeInvoiceTotals } from "@/lib/invoice/invoiceTotals";
import { buildShopOrderView, type ShopOrderViewInput } from "../orderView";
import { countsTowardClientDebt } from "../orderFlags";
import { promoAdminState, promoDatesToDb, promoInputSchema } from "./promoAdmin";
import { evaluatePromo, promoSnapshot, type PromoApplied } from "./promoCore";

/**
 * A storefront order with a promo: lines 300 + delivery 45 − discount 30 =
 * `Order.price` 315. Every money figure downstream (order page, debt,
 * invoice from the order, e-mails) must use 315.
 */
function order(over: Partial<ShopOrderViewInput> = {}): ShopOrderViewInput {
  return {
    orderNumber: 77,
    createdAt: new Date("2026-11-10T10:00:00Z"),
    status: "NEW",
    paymentStatus: "paid",
    isPaid: true,
    shippedAt: null,
    price: 315,
    deliveryPriceMdl: 45,
    promoDiscountMdl: 30,
    promoCode: "LANSARE10",
    promoData: { type: "percent", value: 10, discount: 30 },
    deliveryMethod: "courier_chisinau",
    deliveryCity: "Chișinău",
    trackingNumber: null,
    customerName: "Ion",
    clientName: null,
    orderLines: [{ shopLineData: { kind: "mug", title: "Cană", quantity: 3, total: 300 } }],
    ...over,
  };
}

describe("order page totals with a discount", () => {
  it("subtotal = total − delivery + discount; the paid total is the discounted price", () => {
    const v = buildShopOrderView(order());
    expect(v).toMatchObject({ total: 315, subtotal: 300, deliveryPrice: 45, discount: 30, promoCode: "LANSARE10" });
    expect(v.lines[0]!.total).toBe(300);
    expect(v.subtotal + v.deliveryPrice - v.discount).toBe(v.total);
  });

  it("free delivery is flagged; an order without a promo is unchanged", () => {
    const fd = buildShopOrderView(order({ price: 300, promoDiscountMdl: 45, promoData: { type: "free_delivery" }, promoCode: "SHIP" }));
    expect(fd).toMatchObject({ total: 300, subtotal: 300, discount: 45, promoFreeDelivery: true });
    const plain = buildShopOrderView(order({ price: 345, promoDiscountMdl: null, promoCode: null, promoData: null }));
    expect(plain).toMatchObject({ total: 345, subtotal: 300, discount: 0 });
    expect(plain).not.toHaveProperty("promoCode");
  });
});

describe("client debt uses the discounted price", () => {
  it("a paid shop order is no debt; an unpaid-by-staff studio-linked one counts its discounted price", () => {
    expect(countsTowardClientDebt({ isPaid: true, source: "shop", paymentStatus: "paid" })).toBe(false);
    expect(countsTowardClientDebt({ isPaid: false, source: "shop", paymentStatus: "pending" })).toBe(false);
    // Debt = SUM(Order.price) over counted orders: the discounted 315, not 345.
    const m = mergeClientOrderAggregates([{ clientId: "c1", count: 2 }], [{ clientId: "c1", count: 1, sumMdl: 315 }]);
    expect(m.get("c1")).toEqual({ ordersCount: 2, unpaidCount: 1, unpaidTotalMdl: 315 });
  });
});

describe("invoice from the order", () => {
  it("one line at Order.price (the invoice picker uses it) totals the discounted amount", () => {
    // `NewInvoicePageClient.handlePickOrder`: quantity 1 × Order.price.
    const price = buildShopOrderView(order()).total;
    const t = computeInvoiceTotals([{ quantity: 1, unitPrice: price }], 20);
    expect(t.totalAmount.toString()).toBe("315");
    expect(t.vatAmount.toString()).toBe("52.5");
  });
});

describe("customer e-mails show the discount", () => {
  it("order_received / order_paid get a «Reducere» line in ro / ru / en", () => {
    const d = { origin: "https://anvi.md", orderNumber: 77, total: "315 lei", discount: "30 lei", promoCode: "LANSARE10" };
    expect(renderShopEmail("order_received", "ro", d).text).toContain("Reducere cu codul promoțional LANSARE10: −30 lei");
    expect(renderShopEmail("order_paid", "ru", d).text).toContain("Скидка по промокоду LANSARE10: −30 lei");
    expect(renderShopEmail("order_paid", "en", d).html).toContain("Promo code LANSARE10 discount");
    expect(renderShopEmail("order_paid", "ro", { ...d, discount: null }).text).not.toContain("Reducere");
  });
});

describe("admin promo form", () => {
  it("normalises the code and refuses bad values", () => {
    const ok = promoInputSchema.safeParse({ code: " lansare-10 ", type: "percent", value: 10 });
    expect(ok.success && ok.data).toMatchObject({ code: "LANSARE-10", value: 10, categories: [], products: [], active: true });
    expect(promoInputSchema.safeParse({ code: "ab", type: "percent", value: 10 }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: "OK123", type: "percent", value: 150 }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: "OK123", type: "fixed", value: 0 }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: "OK123", type: "percent", value: 5, categories: ["nope"] }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: "OK123", type: "percent", value: 5, validFrom: "2026-12-02", validTo: "2026-12-01" }).success).toBe(
      false,
    );
    const fd = promoInputSchema.safeParse({ code: "SHIP", type: "free_delivery", value: 99 });
    expect(fd.success && fd.data.value).toBe(0);
  });

  it("days are Chișinău days, «по» inclusive to the end of the day", () => {
    const { validFrom, validTo } = promoDatesToDb("2026-12-01", "2026-12-31");
    expect(validFrom!.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(validTo!.toISOString()).toBe("2026-12-31T21:59:59.999Z");
    // Summer time (UTC+3).
    expect(promoDatesToDb("2027-07-01", null).validFrom!.toISOString()).toBe("2027-06-30T21:00:00.000Z");
  });

  it("list state", () => {
    const base = { active: true, validFrom: null, validTo: null, maxUsesTotal: null, usesCount: 0 };
    expect(promoAdminState(base, "2026-11-10")).toBe("active");
    expect(promoAdminState({ ...base, active: false }, "2026-11-10")).toBe("off");
    expect(promoAdminState({ ...base, validTo: "2026-11-09" }, "2026-11-10")).toBe("expired");
    expect(promoAdminState({ ...base, validFrom: "2026-11-11" }, "2026-11-10")).toBe("scheduled");
    expect(promoAdminState({ ...base, maxUsesTotal: 2, usesCount: 2 }, "2026-11-10")).toBe("used_up");
  });
});

describe("a limited discount downstream", () => {
  it("the order snapshot marks it; the order page totals still add up to the 10 lei paid", () => {
    const r = evaluatePromo(
      {
        id: "p",
        code: "BIG",
        type: "fixed",
        value: 500,
        minOrderMdl: null,
        validFrom: null,
        validTo: null,
        maxUsesTotal: null,
        maxUsesPerCustomer: null,
        categories: [],
        products: [],
        active: true,
      },
      { lines: [{ total: 300, slug: null, category: null }], deliveryPrice: 0, now: new Date(), uses: { total: 0, customer: 0 } },
    ) as PromoApplied;
    expect(r).toMatchObject({ ok: true, discount: 290, total: 10, limited: true });
    expect(promoSnapshot(r)).toMatchObject({ discount: 290, limited: 1, uncappedDiscount: 300 });
    const v = buildShopOrderView(
      order({ price: 10, deliveryPriceMdl: 0, deliveryMethod: "pickup", promoDiscountMdl: 290, promoCode: "BIG", promoData: promoSnapshot(r) }),
    );
    expect(v).toMatchObject({ total: 10, subtotal: 300, discount: 290 });
  });
});
