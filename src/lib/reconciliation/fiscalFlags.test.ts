import { describe, expect, it } from "vitest";
import { isNonDeliveryFiscal } from "./fiscalFlags";

describe("isNonDeliveryFiscal", () => {
  it("matches Non-livrare variants", () => {
    expect(isNonDeliveryFiscal("Non-livrare")).toBe(true);
    expect(isNonDeliveryFiscal("non livrare")).toBe(true);
    expect(isNonDeliveryFiscal("NONLIVRARE")).toBe(true);
  });

  it("rejects empty and unrelated reasons", () => {
    expect(isNonDeliveryFiscal(null)).toBe(false);
    expect(isNonDeliveryFiscal(undefined)).toBe(false);
    expect(isNonDeliveryFiscal("")).toBe(false);
    expect(isNonDeliveryFiscal("Factură fiscală")).toBe(false);
  });
});
