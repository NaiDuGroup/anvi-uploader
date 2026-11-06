import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PaymentAlreadyPaidError, paynetReturnUrl, startPaynetPayment, type StartPaymentInput } from "./payment";
import { paynetConfig, type PaynetConfig, type PaynetPayment } from "./paynet";

const CFG = paynetConfig({
  PAYNET_API_URL: "https://paynet.example",
  PAYNET_USERNAME: "u",
  PAYNET_PASSWORD: "p",
  PAYNET_SALE_AREA_CODE: "area",
  PAYNET_MERCHANT_CODE: "265505",
  PAYNET_NOTIFICATION_SECRET: "s",
}) as PaynetConfig;
const ENV = { SHOP_PUBLIC_BASE_URL: "https://anvi.md/" };
const NOW = new Date("2026-11-06T16:00:00Z"); // 18:00 in Chisinau

const input = (over: Partial<StartPaymentInput> = {}): StartPaymentInput => ({
  orderId: "o1",
  orderNumber: 1234,
  publicToken: "tok",
  amountMdl: 325,
  customer: { name: "Ana Maria Pop", phone: "+37360000000", email: "a@x.md" },
  locale: "ru",
  description: "ANVI #1234",
  ...over,
});

const pay = (order: number, over: Partial<PaynetPayment> = {}): PaynetPayment => ({
  paymentId: 500 + (order % 100),
  paymentLink: `https://pay/${order}?s=sig`,
  status: 1,
  order,
  merchantCode: "265505",
  amount: { requestAmount: 32500, paidAmount: null },
  expiryDate: "2026-11-06 20:00:00",
  paidDate: null,
  ...over,
});

function deps(existing: Record<number, PaynetPayment>) {
  const get = vi.fn(async (_c: PaynetConfig, n: number) => existing[n] ?? null);
  const create = vi.fn(async (_c: PaynetConfig, i: { paynetOrder: number; amountBani: number }) => existing[i.paynetOrder] ?? pay(i.paynetOrder, { amount: { requestAmount: i.amountBani, paidAmount: null } }));
  return { get, create, now: () => NOW };
}

describe("startPaynetPayment", () => {
  it("first attempt: Order = orderNumber × 100, bani, localized title, return links, prefilled customer", async () => {
    const d = deps({});
    const r = await startPaynetPayment(CFG, input(), ENV, d);
    expect(r).toEqual({ provider: "paynet", redirectUrl: "https://pay/123400?s=sig", paymentRef: "paynet:123400:500" });
    expect(d.create).toHaveBeenCalledTimes(1);
    expect(d.create.mock.calls[0][1]).toEqual({
      paynetOrder: 123400,
      amountBani: 32500,
      title: "Заказ ANVI #1234",
      lang: "RU",
      successUrl: "https://anvi.md/comanda/tok?pay=ok",
      cancelUrl: "https://anvi.md/comanda/tok?pay=cancel",
      customer: { code: "1234", firstName: "Ana", lastName: "Maria Pop", email: "a@x.md", phone: "+37360000000" },
      now: NOW,
    });
  });

  it("pay again with the same amount re-uses the open payment (same Order → same link)", async () => {
    const d = deps({ 123401: pay(123401) });
    const r = await startPaynetPayment(CFG, input({ previousRef: "paynet:123401:501" }), ENV, d);
    expect(r.paymentRef).toBe("paynet:123401:501");
    expect(r.redirectUrl).toBe("https://pay/123401?s=sig");
    expect(d.create.mock.calls[0][1].paynetOrder).toBe(123401);
  });

  it("expired / expiring soon or another amount → the next attempt number", async () => {
    const expired = deps({ 123400: pay(123400, { expiryDate: "2026-11-06 17:30:00" }) });
    expect((await startPaynetPayment(CFG, input({ previousRef: "paynet:123400:500" }), ENV, expired)).paymentRef).toBe("paynet:123401:501");
    const soon = deps({ 123400: pay(123400, { expiryDate: "2026-11-06 18:05:00" }) });
    expect((await startPaynetPayment(CFG, input({ previousRef: "paynet:123400:500" }), ENV, soon)).paymentRef).toBe("paynet:123401:501");
    const repriced = deps({ 123400: pay(123400), 123401: pay(123401, { amount: { requestAmount: 1, paidAmount: null } }) });
    const r = await startPaynetPayment(CFG, input({ amountMdl: 330, previousRef: "paynet:123400:500" }), ENV, repriced);
    expect(r.paymentRef).toBe("paynet:123402:502");
    expect(repriced.create).toHaveBeenCalledTimes(1);
  });

  it("a ref of another order is ignored (attempt 0)", async () => {
    const d = deps({});
    expect((await startPaynetPayment(CFG, input({ previousRef: "paynet:999907:1" }), ENV, d)).paymentRef).toBe("paynet:123400:500");
  });

  it("already paid on Paynet → PaymentAlreadyPaidError with its ref, no new payment", async () => {
    const d = deps({ 123400: pay(123400, { status: 4, paidDate: "2026-11-06 17:59:00", amount: { requestAmount: 32500, paidAmount: 32500 } }) });
    const err = await startPaynetPayment(CFG, input({ previousRef: "paynet:123400:500" }), ENV, d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentAlreadyPaidError);
    expect((err as PaymentAlreadyPaidError).paymentRef).toBe("paynet:123400:500");
    expect(d.create).not.toHaveBeenCalled();
  });

  it("a sandbox base keeps our numbers apart", async () => {
    const d = deps({});
    const r = await startPaynetPayment({ ...CFG, orderBase: 9_000_000_000 }, input(), ENV, d);
    expect(r.paymentRef).toBe("paynet:9000123400:500");
  });

  it("return URLs default to https://anvi.md", () => {
    expect(paynetReturnUrl("a b", "ok", {})).toBe("https://anvi.md/comanda/a%20b?pay=ok");
  });
});
