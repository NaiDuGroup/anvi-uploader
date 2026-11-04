import { describe, expect, it } from "vitest";
import { shopDeliveryPriceMdl } from "./delivery";

describe("shopDeliveryPriceMdl", () => {
  it("prices pickup 0, Chișinău 45, Moldova 60 by default", () => {
    expect(shopDeliveryPriceMdl("pickup", {})).toBe(0);
    expect(shopDeliveryPriceMdl("courier_chisinau", {})).toBe(45);
    expect(shopDeliveryPriceMdl("courier_moldova", {})).toBe(60);
  });
  it("takes the Moldova price from SHOP_DELIVERY_MOLDOVA_MDL (season)", () => {
    expect(shopDeliveryPriceMdl("courier_moldova", { SHOP_DELIVERY_MOLDOVA_MDL: "70" })).toBe(70);
    expect(shopDeliveryPriceMdl("courier_chisinau", { SHOP_DELIVERY_MOLDOVA_MDL: "70" })).toBe(45);
  });
  it("ignores a broken env value", () => {
    expect(shopDeliveryPriceMdl("courier_moldova", { SHOP_DELIVERY_MOLDOVA_MDL: "abc" })).toBe(60);
    expect(shopDeliveryPriceMdl("courier_moldova", { SHOP_DELIVERY_MOLDOVA_MDL: "-5" })).toBe(60);
    expect(shopDeliveryPriceMdl("courier_moldova", { SHOP_DELIVERY_MOLDOVA_MDL: " " })).toBe(60);
  });
});
