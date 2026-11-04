import { describe, expect, it } from "vitest";
import { isTestPaymentEnabled } from "./paymentMode";
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

describe("resolvePaymentProvider", () => {
  it("picks the test provider when allowed", () => {
    expect(resolvePaymentProvider({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(testPaymentProvider);
  });
  it("picks Paynet when SHOP_PAYMENT_MODE=paynet", () => {
    expect(resolvePaymentProvider({ SHOP_PAYMENT_MODE: "paynet", NODE_ENV: "development" })).toBe(paynetProvider);
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
