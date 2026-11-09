import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isRealPaymentConfigured, isTestPaymentAllowed, isTestPaymentEnabled, shopPaymentState } from "./paymentMode";
import { onDeliveryPaymentProvider, paynetProvider, PaymentNotConfiguredError, resolvePaymentProvider, testPaymentProvider } from "./payment";

const PAYNET = {
  SHOP_PAYMENT_MODE: "paynet",
  PAYNET_API_URL: "https://paynet.example",
  PAYNET_USERNAME: "u",
  PAYNET_PASSWORD: "p",
  PAYNET_SALE_AREA_CODE: "area",
  PAYNET_MERCHANT_CODE: "m",
  PAYNET_NOTIFICATION_SECRET: "s",
};

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
  it("SHOP_PAYMENT_MODE=paynet without every credential does not select Paynet", () => {
    expect(resolvePaymentProvider({ SHOP_PAYMENT_MODE: "paynet", NODE_ENV: "development" })).toBe(testPaymentProvider);
    expect(resolvePaymentProvider({ SHOP_PAYMENT_MODE: "paynet", VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
    for (const k of Object.keys(PAYNET).filter((k) => k.startsWith("PAYNET_"))) {
      expect(isRealPaymentConfigured({ ...PAYNET, [k]: "" })).toBe(false);
    }
  });
  it("Paynet configured: real wins everywhere, also for testers and on previews", () => {
    const prod = { ...PAYNET, VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(isRealPaymentConfigured(prod)).toBe(true);
    expect(shopPaymentState(prod)).toBe("real");
    expect(resolvePaymentProvider(prod)).toBe(paynetProvider);
    expect(resolvePaymentProvider(prod, { tester: true })).toBe(paynetProvider);
    expect(resolvePaymentProvider({ ...PAYNET, VERCEL_ENV: "preview" })).toBe(paynetProvider);
    expect(isTestPaymentAllowed(prod, { tester: true })).toBe(false);
    // Credentials alone (another mode) keep Paynet off.
    expect(isRealPaymentConfigured({ ...PAYNET, SHOP_PAYMENT_MODE: "test" })).toBe(false);
  });
  it("production: only a tester gets the test provider", () => {
    const prod = { VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(resolvePaymentProvider(prod, { tester: false })).toBeNull();
    expect(resolvePaymentProvider(prod, { tester: true })).toBe(testPaymentProvider);
  });
  it("has no provider on production without configuration", () => {
    expect(resolvePaymentProvider({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
  });
  it("test provider redirects to the test pay page; Paynet without credentials is not configured", async () => {
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

describe("pay on delivery («Оплата только при получении»)", () => {
  it("wins over Paynet, the test provider and a tester pass", () => {
    expect(shopPaymentState(PAYNET, { payOnDelivery: true })).toBe("on_delivery");
    expect(shopPaymentState({ NODE_ENV: "development" }, { payOnDelivery: true, tester: true })).toBe("on_delivery");
    expect(shopPaymentState({ NODE_ENV: "production", VERCEL_ENV: "production" }, { payOnDelivery: true })).toBe("on_delivery");
    expect(resolvePaymentProvider(PAYNET, { payOnDelivery: true })).toBe(onDeliveryPaymentProvider);
    expect(resolvePaymentProvider({ NODE_ENV: "development" }, { payOnDelivery: true })).toBe(onDeliveryPaymentProvider);
    expect(isTestPaymentAllowed({ NODE_ENV: "development" }, { payOnDelivery: true })).toBe(false);
  });
  it("off: everything as before", () => {
    expect(shopPaymentState(PAYNET, { payOnDelivery: false })).toBe("real");
    expect(resolvePaymentProvider(PAYNET, { payOnDelivery: false })).toBe(paynetProvider);
    expect(resolvePaymentProvider({ NODE_ENV: "development" }, { payOnDelivery: false })).toBe(testPaymentProvider);
  });
  it("starts nothing: the customer goes to the order page", async () => {
    const r = await onDeliveryPaymentProvider.startPayment({
      orderId: "o",
      orderNumber: 5,
      publicToken: "tok/1",
      amountMdl: 100,
      customer: { name: "A", phone: "1" },
      locale: "ro",
      description: "x",
    });
    expect(r).toEqual({ provider: "on_delivery", redirectUrl: "/shop/comanda/tok%2F1" });
  });
});
