import { describe, expect, it } from "vitest";
import { isTestPaymentAllowed, isTestPaymentEnabled, shopPaymentState } from "./paymentMode";
import { paynetProvider, PaymentNotConfiguredError, resolvePaymentProvider, testPaymentProvider } from "./payment";

describe("isTestPaymentEnabled", () => {
  it("is on with an explicit SHOP_PAYMENT_MODE=test, even on Vercel production", () => {
    expect(isTestPaymentEnabled({ SHOP_PAYMENT_MODE: "test", VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
  });
  it("is never on for Vercel production without the explicit flag", () => {
    expect(isTestPaymentEnabled({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(isTestPaymentEnabled({ VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(false);
    expect(isTestPaymentEnabled({ VERCEL_ENV: "production", SHOP_PAYMENT_MODE: "paynet" })).toBe(false);
  });
  it("is on for Vercel preview deployments", () => {
    expect(isTestPaymentEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
  });
  it("is on in local dev, off in a self-hosted production build", () => {
    expect(isTestPaymentEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isTestPaymentEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isTestPaymentEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("shopPaymentState", () => {
  it("unavailable in production without a tester; tester with one; test on previews / dev", () => {
    const prod = { VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(shopPaymentState(prod)).toBe("unavailable");
    expect(shopPaymentState(prod, { tester: true })).toBe("tester");
    expect(isTestPaymentAllowed(prod)).toBe(false);
    expect(isTestPaymentAllowed(prod, { tester: true })).toBe(true);
    expect(shopPaymentState({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("test");
    expect(shopPaymentState({ NODE_ENV: "development" }, { tester: true })).toBe("test");
    expect(shopPaymentState({ ...prod, SHOP_PAYMENT_MODE: "test" })).toBe("test");
  });
});

describe("resolvePaymentProvider", () => {
  it("picks the test provider when allowed", () => {
    expect(resolvePaymentProvider({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(testPaymentProvider);
  });
  it("Paynet is a stub: SHOP_PAYMENT_MODE=paynet does not select it yet", () => {
    expect(resolvePaymentProvider({ SHOP_PAYMENT_MODE: "paynet", NODE_ENV: "development" })).toBe(testPaymentProvider);
    expect(resolvePaymentProvider({ SHOP_PAYMENT_MODE: "paynet", VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
  });
  it("production: only a tester gets the test provider", () => {
    const prod = { VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(resolvePaymentProvider(prod, { tester: false })).toBeNull();
    expect(resolvePaymentProvider(prod, { tester: true })).toBe(testPaymentProvider);
  });
  it("has no provider on production without configuration", () => {
    expect(resolvePaymentProvider({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
  });
  it("test provider redirects to the test pay page; Paynet stub is not configured", async () => {
    const input = {
      orderId: "o",
      orderNumber: 1,
      publicToken: "tok_1",
      amountMdl: 10,
      customer: { name: "A", phone: "069000000" },
      locale: "ro" as const,
      description: "x",
    };
    await expect(testPaymentProvider.startPayment(input)).resolves.toEqual({
      provider: "test",
      redirectUrl: "/shop/pay/test?token=tok_1",
    });
    await expect(paynetProvider.startPayment(input)).rejects.toBeInstanceOf(PaymentNotConfiguredError);
  });
});
