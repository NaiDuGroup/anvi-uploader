import { describe, expect, it } from "vitest";
import { buildFunnel, deviceSplit, pct, productDropOff, sourceTable } from "./funnel";
import { shopFunnelCsv } from "./funnelCsv";

describe("funnel math", () => {
  it("percentages", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(5, 0)).toBeNull();
  });

  it("step-to-step and overall conversion, drop-off", () => {
    const steps = buildFunnel({ visit: 200, product_view: 120, add_to_cart: 30, cart_view: 24, checkout_start: 12, payment_start: 9, paid: 6 });
    expect(steps.map((s) => s.step)).toEqual(["visit", "product_view", "add_to_cart", "cart_view", "checkout_start", "payment_start", "paid"]);
    expect(steps[0]).toEqual({ step: "visit", sessions: 200, fromPrev: null, fromStart: null, dropped: 0 });
    expect(steps[1]).toMatchObject({ fromPrev: 60, fromStart: 60, dropped: 80 });
    expect(steps[2]).toMatchObject({ fromPrev: 25, fromStart: 15, dropped: 90 });
    expect(steps[6]).toMatchObject({ sessions: 6, fromPrev: 66.7, fromStart: 3, dropped: 3 });
  });

  it("empty and out-of-order steps", () => {
    const empty = buildFunnel({});
    expect(empty.every((s) => s.sessions === 0 && s.dropped === 0)).toBe(true);
    expect(empty[3]!.fromPrev).toBeNull();
    // A paid page opened from the e-mail: more «paid» than «payment_start» — shown as is, never a negative drop.
    const odd = buildFunnel({ visit: 10, payment_start: 1, paid: 2 });
    expect(odd[6]).toMatchObject({ fromPrev: 200, dropped: 0 });
  });

  it("products: worst drop-off first, names from the catalog", () => {
    const rows = productDropOff(
      [
        { product: "a", category: "cani", views: 10, adds: 8, checkouts: 6, paid: 4 },
        { product: "b", category: "cani", views: 50, adds: 5, checkouts: 2, paid: 1 },
        { product: "c", category: null, views: 10, adds: 2, checkouts: 0, paid: 0 },
      ],
      { b: "Cană albă" },
    );
    expect(rows.map((r) => r.product)).toEqual(["b", "c", "a"]);
    expect(rows[0]).toMatchObject({ name: "Cană albă", addRate: 10, checkoutRate: 40, paidRate: 2, lostAtView: 45, lostAfterAdd: 4 });
    expect(rows[2]!.name).toBe("a");
  });

  it("sources: utm_source over referrer, direct = null, shares", () => {
    const rows = sourceTable([
      { referrer: null, utmSource: null, utmMedium: null, utmCampaign: null, sessions: 50, adds: 5, checkouts: 3, paid: 2 },
      { referrer: "l.facebook.com", utmSource: "facebook", utmMedium: "cpc", utmCampaign: "x", sessions: 30, adds: 3, checkouts: 2, paid: 1 },
      { referrer: null, utmSource: "facebook", utmMedium: "cpc", utmCampaign: "x", sessions: 10, adds: 1, checkouts: 1, paid: 1 },
      { referrer: "google.com", utmSource: null, utmMedium: null, utmCampaign: null, sessions: 10, adds: 0, checkouts: 0, paid: 0 },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ source: null, sessions: 50, share: 50, conversion: 4 });
    expect(rows[1]).toMatchObject({ source: "facebook", medium: "cpc", sessions: 40, paid: 2, share: 40, conversion: 5 });
    expect(rows[2]).toMatchObject({ source: "google.com", sessions: 10, conversion: 0 });
  });

  it("devices", () => {
    const rows = deviceSplit([
      { device: "desktop", sessions: 25, paid: 2 },
      { device: "mobile", sessions: 70, paid: 1 },
      { device: null, sessions: 5, paid: 0 },
      { device: "tv", sessions: 0, paid: 0 },
    ]);
    expect(rows.map((r) => r.device)).toEqual(["mobile", "desktop", null]);
    expect(rows[0]).toMatchObject({ share: 70, conversion: 1.4 });
  });

  it("CSV has every section", () => {
    const csv = shopFunnelCsv({
      from: "2026-11-01",
      to: "2026-11-05",
      events: 3,
      steps: buildFunnel({ visit: 2, paid: 1 }),
      products: [],
      sources: sourceTable([{ referrer: null, utmSource: "=cmd", utmMedium: null, utmCampaign: null, sessions: 2, adds: 0, checkouts: 0, paid: 1 }]),
      devices: deviceSplit([{ device: "mobile", sessions: 2, paid: 1 }]),
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Оплатили;1");
    expect(csv).toContain("'=cmd"); // formula injection neutralised
    expect(csv).toContain("Телефон;2");
  });
});
