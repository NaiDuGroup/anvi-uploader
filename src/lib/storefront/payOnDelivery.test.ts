import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_INFO } from "@/lib/studioInfo/studioInfo";
import { checkoutOutcome } from "./checkout";
import { INFO_PAGES, infoFaqEntries, infoPageVars } from "./infoPages";
import { isPaid, orderSteps } from "./orderStatus";
import { leadTimeText } from "./leadTime";
import { shopT } from "./i18n";
import { shopTestBannerKeys } from "./shopMetadata";

describe("storefront pay on delivery", () => {
  it("checkout: the on-delivery answer goes to the order page, flagged (no payment tracking)", () => {
    const out = checkoutOutcome(201, {
      orderId: "o",
      orderNumber: 5,
      publicToken: "tok",
      payment: { provider: "on_delivery", redirectUrl: "/shop/comanda/tok" },
    });
    expect(out).toMatchObject({ kind: "redirect", url: "/shop/comanda/tok", onDelivery: true });
    const paynet = checkoutOutcome(201, { publicToken: "tok", payment: { provider: "paynet", redirectUrl: "https://p" } });
    expect(paynet).not.toHaveProperty("onDelivery");
  });

  it("order page: «received» first step, not paid until staff mark it", () => {
    expect(orderSteps("accepted", "pickup", { payOnDelivery: true }).map((s) => [s.label, s.state])).toEqual([
      ["stAccepted", "done"],
      ["stPrinting", "current"],
      ["stPickupReady", "todo"],
      ["stPickedUp", "todo"],
    ]);
    expect(orderSteps("paid", "pickup")[0]!.label).toBe("stPaid");
    expect(isPaid({ status: "in_production", paymentStatus: "pending", payOnDelivery: true })).toBe(false);
    expect(isPaid({ status: "accepted", paymentStatus: "pending" })).toBe(false);
    expect(isPaid({ status: "in_production", paymentStatus: "pending" })).toBe(true);
    expect(isPaid({ status: "accepted", paymentStatus: "paid", payOnDelivery: false })).toBe(true);
  });

  it("no tester banner while orders are taken on delivery", () => {
    expect(shopTestBannerKeys(true, "on_delivery")).toEqual([]);
  });

  it("info pages: payment answers say «on delivery» instead of «no cash on delivery»", () => {
    const base = { lang: "ro" as const, address: "", hours: DEFAULT_STUDIO_INFO.hours, phone: "", paymentLive: false };
    const faq = (vars: Record<string, string>) => infoFaqEntries(INFO_PAGES.intrebari, "ro", vars).map((e) => e.answer).join("\n");
    const online = faq(infoPageVars(base));
    expect(online).toContain("Plata la livrare nu este disponibilă");
    const pod = faq(infoPageVars({ ...base, payOnDelivery: true }));
    expect(pod).not.toContain("nu este disponibilă");
    expect(pod).toContain("La primire — numerar sau cu cardul");
    const delivery = infoFaqEntries(INFO_PAGES["livrare-si-plata"], "ru", infoPageVars({ ...base, lang: "ru", payOnDelivery: true }))
      .map((e) => e.answer)
      .join("\n");
    expect(delivery).toContain("Оплата при получении");
    expect(delivery).not.toContain("Оплаты при получении (наложенный платёж) нет");
  });

  it("lead time counts from the order, not the payment", () => {
    for (const lang of ["ro", "ru", "en"] as const) {
      const t = shopT(lang);
      const a = leadTimeText({ from: 6, to: 7 }, t, "checkout");
      const b = leadTimeText({ from: 6, to: 7 }, t, "checkout", { payOnDelivery: true });
      const c = leadTimeText({ from: 6, to: null }, t, "order", { payOnDelivery: true });
      expect(b).not.toBe(a);
      expect(b).not.toMatch(/plată|оплаты|payment/);
      expect(c).not.toMatch(/plată|оплаты|payment/);
    }
  });
});
