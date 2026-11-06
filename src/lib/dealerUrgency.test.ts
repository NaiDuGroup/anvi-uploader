import { describe, expect, it } from "vitest";
import {
  adminDealerUrgencyView,
  chargedUrgencyFeeMdl,
  staffPriceToStored,
  storedPriceToStaff,
  DEALER_URGENCY_OFF_COLUMNS,
  dealerUrgencyMode,
  dealerUrgencyOnColumns,
  dealerUrgencyOverrideColumns,
  orderUrgencyState,
  planDealerUrgencyChange,
  priceWithoutUrgencyFee,
  priceWithUrgencyFee,
  resolveDealerUrgencyOffer,
  toFeeMdl,
} from "./dealerUrgency";
import { canDealerModifyOrder } from "./dealerOrderModify";

const dealer = (over: Record<string, unknown> = {}) => ({ isDealer: true, ...over });

describe("resolveDealerUrgencyOffer", () => {
  it("«как у всех» (null override) takes the global fee", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, dealer({ urgencyFeeMdl: null }))).toEqual({
      available: true,
      feeMdl: 50,
    });
  });

  it("launch default: global 0 and no override → available and free", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 0 }, dealer())).toEqual({ available: true, feeMdl: 0 });
  });

  it("own amount wins over the global fee", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, dealer({ urgencyFeeMdl: 30 }))).toEqual({
      available: true,
      feeMdl: 30,
    });
  });

  it("own amount 0 means free even when the global fee is set", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, dealer({ urgencyFeeMdl: 0 }))).toEqual({
      available: true,
      feeMdl: 0,
    });
  });

  it("«срочность недоступна» hides it whatever the amounts", () => {
    expect(
      resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, dealer({ urgencyFeeMdl: 10, urgencyDisabled: true })),
    ).toEqual({ available: false });
  });

  it("non-dealers and missing clients are never offered dealer urgency", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, { isDealer: false })).toEqual({ available: false });
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, null)).toEqual({ available: false });
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 50 }, undefined)).toEqual({ available: false });
  });

  it("reads Decimal-like / string values and rounds to bani", () => {
    const decimal = { toString: () => "49.999" };
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: decimal }, dealer())).toEqual({ available: true, feeMdl: 50 });
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: "0" }, dealer({ urgencyFeeMdl: "12.5" }))).toEqual({
      available: true,
      feeMdl: 12.5,
    });
  });

  it("a broken / negative global fee counts as free, not as a block", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: null }, dealer())).toEqual({ available: true, feeMdl: 0 });
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: -5 }, dealer())).toEqual({ available: true, feeMdl: 0 });
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: "abc" }, dealer())).toEqual({ available: true, feeMdl: 0 });
  });

  it("a negative own amount falls back to the global fee", () => {
    expect(resolveDealerUrgencyOffer({ globalFeeMdl: 40 }, dealer({ urgencyFeeMdl: -1 }))).toEqual({
      available: true,
      feeMdl: 40,
    });
  });
});

describe("toFeeMdl", () => {
  it("null / undefined / invalid → null; numbers rounded", () => {
    expect(toFeeMdl(null)).toBeNull();
    expect(toFeeMdl(undefined)).toBeNull();
    expect(toFeeMdl(Number.NaN)).toBeNull();
    expect(toFeeMdl(-0.01)).toBeNull();
    expect(toFeeMdl(0)).toBe(0);
    expect(toFeeMdl(10.005)).toBe(10.01);
  });
});

describe("client card override", () => {
  it("mode follows the columns", () => {
    expect(dealerUrgencyMode({ urgencyFeeMdl: null, urgencyDisabled: false })).toBe("default");
    expect(dealerUrgencyMode({ urgencyFeeMdl: 0, urgencyDisabled: false })).toBe("custom");
    expect(dealerUrgencyMode({ urgencyFeeMdl: 25, urgencyDisabled: false })).toBe("custom");
    expect(dealerUrgencyMode({ urgencyFeeMdl: 25, urgencyDisabled: true })).toBe("unavailable");
  });

  it("columns for each mode; custom requires an amount (0 allowed)", () => {
    expect(dealerUrgencyOverrideColumns("default")).toEqual({ urgencyFeeMdl: null, urgencyDisabled: false });
    expect(dealerUrgencyOverrideColumns("unavailable", 99)).toEqual({ urgencyFeeMdl: null, urgencyDisabled: true });
    expect(dealerUrgencyOverrideColumns("custom", 0)).toEqual({ urgencyFeeMdl: 0, urgencyDisabled: false });
    expect(dealerUrgencyOverrideColumns("custom", 35)).toEqual({ urgencyFeeMdl: 35, urgencyDisabled: false });
    expect(() => dealerUrgencyOverrideColumns("custom", null)).toThrow("custom_amount_required");
    expect(() => dealerUrgencyOverrideColumns("custom")).toThrow("custom_amount_required");
  });
});

describe("order urgency state", () => {
  it("dealer request beats isPrio; staff 🔥 is «staff»; else off", () => {
    expect(orderUrgencyState({ isPrio: true, urgencyByDealerAt: new Date() })).toBe("dealer");
    expect(orderUrgencyState({ isPrio: false, urgencyByDealerAt: "2026-11-07T10:00:00Z" })).toBe("dealer");
    expect(orderUrgencyState({ isPrio: true, urgencyByDealerAt: null })).toBe("staff");
    expect(orderUrgencyState({ isPrio: false })).toBe("off");
  });
});

describe("price = goods + fee", () => {
  it("adds and removes the fee with bani precision", () => {
    expect(priceWithUrgencyFee(100, 50)).toBe(150);
    expect(priceWithUrgencyFee(0.1, 0.2)).toBe(0.3);
    expect(priceWithUrgencyFee(100, null)).toBe(100);
    expect(priceWithoutUrgencyFee(150, 50)).toBe(100);
    expect(priceWithoutUrgencyFee(150, undefined)).toBe(150);
  });

  it("unpriced goods stay unpriced; removing never goes below 0", () => {
    expect(priceWithUrgencyFee(null, 50)).toBeNull();
    expect(priceWithoutUrgencyFee(null, 50)).toBeNull();
    expect(priceWithoutUrgencyFee(30, 50)).toBe(0);
  });
});

describe("planDealerUrgencyChange", () => {
  const on = { available: true as const, feeMdl: 50 };
  const off = { available: false as const };

  it("off → on takes today's fee", () => {
    expect(planDealerUrgencyChange({ current: { isPrio: false }, wanted: true, offer: on })).toEqual({
      kind: "on",
      feeMdl: 50,
    });
  });

  it("off → on refused when unavailable", () => {
    expect(planDealerUrgencyChange({ current: { isPrio: false }, wanted: true, offer: off })).toEqual({
      kind: "unavailable",
    });
  });

  it("dealer urgency kept keeps the frozen fee, not today's rate", () => {
    const current = { isPrio: true, urgencyByDealerAt: new Date(), urgencyFee: "20.00" };
    expect(planDealerUrgencyChange({ current, wanted: true, offer: { available: true, feeMdl: 99 } })).toEqual({
      kind: "keep",
      feeMdl: 20,
    });
    expect(planDealerUrgencyChange({ current, wanted: undefined, offer: off })).toEqual({ kind: "keep", feeMdl: 20 });
  });

  it("dealer urgency → off removes exactly the stored fee", () => {
    const current = { isPrio: true, urgencyByDealerAt: new Date(), urgencyFee: 20 };
    expect(planDealerUrgencyChange({ current, wanted: false, offer: on })).toEqual({ kind: "off", removedFeeMdl: 20 });
  });

  it("dealer may switch off even after becoming «unavailable»", () => {
    const current = { isPrio: true, urgencyByDealerAt: new Date(), urgencyFee: 20 };
    expect(planDealerUrgencyChange({ current, wanted: false, offer: off }).kind).toBe("off");
  });

  it("studio 🔥 is never removed nor charged by the dealer", () => {
    const current = { isPrio: true, urgencyByDealerAt: null };
    expect(planDealerUrgencyChange({ current, wanted: false, offer: on })).toEqual({ kind: "keep", feeMdl: 0 });
    expect(planDealerUrgencyChange({ current, wanted: true, offer: on })).toEqual({ kind: "keep", feeMdl: 0 });
  });

  it("no wish (undefined / false) on a non-urgent order changes nothing", () => {
    expect(planDealerUrgencyChange({ current: { isPrio: false }, wanted: undefined, offer: on })).toEqual({
      kind: "keep",
      feeMdl: 0,
    });
    expect(planDealerUrgencyChange({ current: { isPrio: false }, wanted: false, offer: off })).toEqual({
      kind: "keep",
      feeMdl: 0,
    });
  });
});

describe("column patches and staff view", () => {
  it("on / off columns", () => {
    const at = new Date("2026-11-07T10:00:00Z");
    expect(dealerUrgencyOnColumns(50, "u1", at)).toEqual({
      isPrio: true,
      urgencyFee: 50,
      urgencyByDealerAt: at,
      urgencySetById: "u1",
      urgencyFeeWaivedAt: null,
      urgencyFeeWaivedById: null,
    });
    expect(DEALER_URGENCY_OFF_COLUMNS).toMatchObject({ isPrio: false, urgencyFee: null, urgencyByDealerAt: null });
  });

  it("staff badge only for dealer requests", () => {
    expect(adminDealerUrgencyView({ urgencyByDealerAt: null, urgencyFee: 50 })).toBeNull();
    expect(adminDealerUrgencyView({ urgencyByDealerAt: new Date(), urgencyFee: "50.00" })).toEqual({
      feeMdl: 50,
      waived: false,
    });
    expect(
      adminDealerUrgencyView({ urgencyByDealerAt: new Date(), urgencyFee: 0, urgencyFeeWaivedAt: new Date() }),
    ).toEqual({ feeMdl: 0, waived: true });
  });
});

describe("permission: urgency follows canDealerModifyOrder", () => {
  const base = { status: "SENT_TO_WORKSHOP", isPaid: false, orderLines: [{ productionStatus: "WAITING" }] };
  it("editable order may toggle", () => {
    expect(canDealerModifyOrder(base)).toBe(true);
  });
  it.each([
    ["paid", { ...base, isPaid: true }],
    ["printing line", { ...base, orderLines: [{ productionStatus: "PRINTING" }] }],
    ["printing status", { ...base, status: "WORKSHOP_PRINTING" }],
    ["cancelled", { ...base, cancelledAt: new Date() }],
    ["shop", { ...base, source: "shop" }],
    ["delivered", { ...base, status: "DELIVERED" }],
  ])("%s → locked", (_label, order) => {
    expect(canDealerModifyOrder(order)).toBe(false);
  });
});

describe("staff price contract (goods price in staff fields)", () => {
  it("charged fee: dealer request with fee > 0 only", () => {
    expect(chargedUrgencyFeeMdl({ urgencyByDealerAt: new Date(), urgencyFee: "30.00" })).toBe(30);
    expect(chargedUrgencyFeeMdl({ urgencyByDealerAt: new Date(), urgencyFee: 0 })).toBe(0);
    expect(chargedUrgencyFeeMdl({ urgencyByDealerAt: null, urgencyFee: 30 })).toBe(0);
    expect(chargedUrgencyFeeMdl({ urgencyByDealerAt: new Date(), urgencyFee: null })).toBe(0);
  });

  it("typed goods → stored total, and back for the prefill (round trip, no double add)", () => {
    expect(staffPriceToStored(100, 30)).toBe(130);
    expect(storedPriceToStaff(130, 30)).toBe(100);
    expect(staffPriceToStored(storedPriceToStaff(130, 30), 30)).toBe(130);
    expect(staffPriceToStored(0.1, 0.2)).toBe(0.3);
  });

  it("no fee or null price pass through", () => {
    expect(staffPriceToStored(100, 0)).toBe(100);
    expect(storedPriceToStaff(100, 0)).toBe(100);
    expect(staffPriceToStored(null, 30)).toBeNull();
    expect(storedPriceToStaff(null, 30)).toBeNull();
  });
});
