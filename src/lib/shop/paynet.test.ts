import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clearPaynetTokenCache,
  createPaynetOrder,
  formatChisinauTime,
  formatPaynetRef,
  getPaynetOrder,
  isPaynetPaid,
  isPaynetReusable,
  normalizePaynetNotification,
  parseChisinauTime,
  parsePaynetOrderNumber,
  parsePaynetRef,
  paynetConfig,
  paynetNotificationHash,
  paynetOrderNumber,
  toBani,
  verifyPaynetNotificationHash,
  type PaynetConfig,
  type PaynetPayment,
} from "./paynet";

const ENV = {
  PAYNET_API_URL: "https://paynet.example/",
  PAYNET_USERNAME: "u",
  PAYNET_PASSWORD: "p",
  PAYNET_SALE_AREA_CODE: "area",
  PAYNET_MERCHANT_CODE: "265505",
  PAYNET_NOTIFICATION_SECRET: "test-secret",
};
const CFG = paynetConfig(ENV) as PaynetConfig;

/** A notification as Paynet sends it (`Id` / `ExternalId` casing). */
const WIRE = {
  Eventid: 98765,
  EventType: "PAID",
  Message: "Request was processed successfully.",
  EventDate: "2026-11-06T18:01:40",
  Payment: {
    Id: 328610,
    ExternalId: 676312100,
    SaleAreaCode: "area",
    Merchant: "265505",
    Customer: "6763121",
    StatusDate: "2026-11-06T18:01:40",
    Amount: 1500,
    CardMask: "411111******1111",
  },
};
/**
 * Base64(MD5("2026-11-06T18:01:40" + "98765" + "PAID" + "1500" + "6763121" +
 * "676312100" + "328610" + "265505" + "2026-11-06T18:01:40" + "test-secret")),
 * computed outside this code (Python hashlib) from the documented formula.
 */
const WIRE_HASH = "/DILHpBzQl/ZoHquUNYXfw==";

describe("paynetConfig", () => {
  it("needs every credential; trims the URL; expiry ≥ 15 min, default 120", () => {
    expect(CFG.apiUrl).toBe("https://paynet.example");
    expect(CFG.expiryMinutes).toBe(120);
    expect(CFG.orderBase).toBe(0);
    expect(paynetConfig({ ...ENV, PAYNET_PASSWORD: " " })).toBeNull();
    expect(paynetConfig({ ...ENV, PAYNET_EXPIRY_MINUTES: "5" })?.expiryMinutes).toBe(15);
    expect(paynetConfig({ ...ENV, PAYNET_EXPIRY_MINUTES: "60", PAYNET_ORDER_BASE: "9000000000" })).toMatchObject({
      expiryMinutes: 60,
      orderBase: 9_000_000_000,
    });
  });
});

describe("amounts, order numbers, refs", () => {
  it("MDL → bani", () => {
    expect(toBani(325)).toBe(32500);
    expect(toBani(19.99)).toBe(1999);
    expect(toBani(0.1 + 0.2)).toBe(30);
  });
  it("Paynet order = base + orderNumber × 100 + attempt, and back", () => {
    expect(paynetOrderNumber(1234, 0)).toBe(123400);
    expect(paynetOrderNumber(1234, 7, 9_000_000_000)).toBe(9_000_123_407);
    expect(parsePaynetOrderNumber(123407)).toEqual({ orderNumber: 1234, attempt: 7 });
    expect(parsePaynetOrderNumber(9_000_123_407, 9_000_000_000)).toEqual({ orderNumber: 1234, attempt: 7 });
    expect(parsePaynetOrderNumber(42)).toBeNull();
    expect(parsePaynetOrderNumber(1.5)).toBeNull();
  });
  it("paymentRef keeps the Paynet order and the payment id", () => {
    expect(formatPaynetRef(123401, 328610)).toBe("paynet:123401:328610");
    expect(parsePaynetRef("paynet:123401:328610")).toEqual({ paynetOrder: 123401, paymentId: "328610" });
    expect(parsePaynetRef("test-abc")).toBeNull();
    expect(parsePaynetRef(null)).toBeNull();
  });
});

describe("Europe/Chisinau time (Paynet ExpiryDate)", () => {
  it("winter is UTC+2, summer UTC+3", () => {
    expect(formatChisinauTime(new Date("2026-11-06T16:05:00Z"))).toBe("2026-11-06T18:05:00");
    expect(formatChisinauTime(new Date("2026-07-01T09:30:15Z"))).toBe("2026-07-01T12:30:15");
  });
  it("across the DST switches (last Sunday of March / October)", () => {
    // Moldova: 2026-03-29 02:00 local → 03:00 (00:00 UTC); 2026-10-25 03:00 local → 02:00 (00:00 UTC).
    expect(formatChisinauTime(new Date("2026-03-28T23:59:59Z"))).toBe("2026-03-29T01:59:59");
    expect(formatChisinauTime(new Date("2026-03-29T00:00:00Z"))).toBe("2026-03-29T03:00:00");
    expect(formatChisinauTime(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25T02:30:00");
    expect(formatChisinauTime(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25T02:30:00");
    // Expiry = now + 120 min across midnight / the year end.
    expect(formatChisinauTime(new Date(Date.parse("2026-12-31T21:30:00Z") + 120 * 60_000))).toBe("2027-01-01T01:30:00");
  });
  it("parses Paynet's local dates back to instants", () => {
    expect(parseChisinauTime("2026-11-06 18:05:20")?.toISOString()).toBe("2026-11-06T16:05:20.000Z");
    expect(parseChisinauTime("2026-07-01T12:30:15")?.toISOString()).toBe("2026-07-01T09:30:15.000Z");
    expect(parseChisinauTime("2026-03-29 03:30:00")?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(parseChisinauTime("2026-03-29 01:30:00")?.toISOString()).toBe("2026-03-28T23:30:00.000Z");
    expect(parseChisinauTime("2026-10-25 04:00:00")?.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    expect(parseChisinauTime(null)).toBeNull();
    expect(parseChisinauTime("soon")).toBeNull();
  });
});

describe("notification", () => {
  it("normalises Id / ExternalId (wire) and ID / ExternalID (docs) alike", () => {
    const a = normalizePaynetNotification(WIRE);
    const docs = {
      ...WIRE,
      Payment: { ...WIRE.Payment, Id: undefined, ExternalId: undefined, ID: 328610, ExternalID: 676312100 },
    };
    const b = normalizePaynetNotification(docs);
    expect(a).toEqual({
      eventId: "98765",
      eventType: "PAID",
      eventDate: "2026-11-06T18:01:40",
      payment: {
        id: "328610",
        externalId: "676312100",
        merchant: "265505",
        customer: "6763121",
        statusDate: "2026-11-06T18:01:40",
        amount: "1500",
      },
    });
    expect(b).toEqual(a);
    expect(normalizePaynetNotification({ EventType: "PAID" })).toBeNull();
    expect(normalizePaynetNotification(null)).toBeNull();
    expect(normalizePaynetNotification([1])).toBeNull();
  });
  it("missing fields hash as empty strings", () => {
    const n = normalizePaynetNotification({ Payment: {} })!;
    expect(n.payment.customer).toBe("");
    expect(paynetNotificationHash(n, "s")).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
  it("hash = Base64(MD5(prepared string + secret)), the documented vector", () => {
    const n = normalizePaynetNotification(WIRE)!;
    expect(paynetNotificationHash(n, "test-secret")).toBe(WIRE_HASH);
    expect(verifyPaynetNotificationHash(n, WIRE_HASH, "test-secret")).toBe(true);
    expect(verifyPaynetNotificationHash(n, ` ${WIRE_HASH} `, "test-secret")).toBe(true);
  });
  it("rejects a wrong secret, a tampered field, a missing header", () => {
    const n = normalizePaynetNotification(WIRE)!;
    expect(verifyPaynetNotificationHash(n, WIRE_HASH, "other")).toBe(false);
    expect(verifyPaynetNotificationHash({ ...n, payment: { ...n.payment, amount: "150000" } }, WIRE_HASH, "test-secret")).toBe(false);
    expect(verifyPaynetNotificationHash(n, null, "test-secret")).toBe(false);
    expect(verifyPaynetNotificationHash(n, "short", "test-secret")).toBe(false);
    expect(verifyPaynetNotificationHash(n, WIRE_HASH, "")).toBe(false);
  });
});

const payment = (over: Partial<PaynetPayment> = {}): PaynetPayment => ({
  paymentId: 1,
  paymentLink: "https://pay/1?s=x",
  status: 1,
  order: 123400,
  merchantCode: "265505",
  amount: { requestAmount: 32500, paidAmount: null },
  expiryDate: "2026-11-06 20:00:00",
  paidDate: null,
  ...over,
});

describe("payment state", () => {
  it("paid = paidDate (status 4 on the sandbox) with a paid amount", () => {
    expect(isPaynetPaid(payment())).toBe(false);
    expect(isPaynetPaid(payment({ status: 4, paidDate: "2026-11-06 18:01:40", amount: { requestAmount: 1500, paidAmount: 1500 } }))).toBe(true);
    expect(isPaynetPaid(payment({ status: 4, amount: { requestAmount: 1500, paidAmount: 1500 } }))).toBe(true);
    expect(isPaynetPaid(payment({ paidDate: "2026-11-06 18:01:40" }))).toBe(false);
  });
  it("reusable: registered, same amount, ≥ 10 min left", () => {
    const now = new Date("2026-11-06T16:00:00Z"); // 18:00 in Chisinau
    expect(isPaynetReusable(payment(), 32500, now)).toBe(true);
    expect(isPaynetReusable(payment(), 32600, now)).toBe(false);
    expect(isPaynetReusable(payment({ expiryDate: "2026-11-06 18:09:00" }), 32500, now)).toBe(false);
    expect(isPaynetReusable(payment({ expiryDate: "2026-11-06 17:00:00" }), 32500, now)).toBe(false);
    expect(isPaynetReusable(payment({ status: 4 }), 32500, now)).toBe(false);
  });
});

describe("API client", () => {
  const fetchMock = vi.fn();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  beforeEach(() => {
    clearPaynetTokenCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("authenticates once, sends the order in bani with Chisinau expiry, re-uses the token", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: "T1", token_type: "Bearer", expires_in: 86400 }))
      .mockResolvedValueOnce(json(200, { ...payment(), paymentLink: "https://pay/1?s=sig" }))
      .mockResolvedValueOnce(json(404, { code: "NOT_FOUND_RECORD" }));
    const p = await createPaynetOrder(CFG, {
      paynetOrder: 123400,
      amountBani: 32500,
      title: "Comanda ANVI #1234",
      lang: "RO",
      successUrl: "https://anvi.md/comanda/tok?pay=ok",
      cancelUrl: "https://anvi.md/comanda/tok?pay=cancel",
      customer: { code: "1234", firstName: "Ana", lastName: "Pop", email: "a@x.md", phone: "+37360000000" },
      now: new Date("2026-11-06T16:00:00Z"),
    });
    expect(p.paymentLink).toBe("https://pay/1?s=sig");
    expect(await getPaynetOrder(CFG, 999900)).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toBe("https://paynet.example/auth");
    expect(JSON.parse(authInit.body)).toEqual({ grantType: "password", username: "u", password: "p" });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://paynet.example/api/order");
    expect(init.headers.Authorization).toBe("Bearer T1");
    expect(JSON.parse(init.body)).toEqual({
      Order: 123400,
      SaleAreaCode: "area",
      LinkUrlSuccess: "https://anvi.md/comanda/tok?pay=ok",
      LinkUrlCancel: "https://anvi.md/comanda/tok?pay=cancel",
      Currency: 498,
      ExpiryDate: "2026-11-06T20:00:00",
      MoneyType: "All",
      Lang: "RO",
      Customer: { Code: "1234", NameFirst: "Ana", NameLast: "Pop", Email: "a@x.md", PhoneNumber: "+37360000000" },
      Services: [{ Name: "Comanda ANVI #1234", Description: "Comanda ANVI #1234", Amount: 32500 }],
    });
    expect(fetchMock.mock.calls[2][0]).toBe("https://paynet.example/api/order/merchant/999900");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer T1");
  });

  it("on 401 fetches a new token and retries once", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: "T1", expires_in: 86400 }))
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { access_token: "T2", expires_in: 86400 }))
      .mockResolvedValueOnce(json(200, payment({ status: 4 })));
    const p = await getPaynetOrder(CFG, 123400);
    expect(p?.status).toBe(4);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer T2");
  });

  it("Paynet errors carry the HTTP status and code, without secrets", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: "T1", expires_in: 86400 }))
      .mockResolvedValueOnce(json(500, { code: "TECHNICAL_ERROR", details: "Please verify the transmitted data" }));
    const err: unknown = await getPaynetOrder(CFG, 1).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "PaynetError", httpStatus: 500, code: "TECHNICAL_ERROR" });
    expect(String((err as Error).message)).not.toMatch(/T1|password/);
  });

  it("a failed login is an error", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { code: "INVALID_GRANT" }));
    await expect(getPaynetOrder(CFG, 1)).rejects.toMatchObject({ httpStatus: 400, code: "INVALID_GRANT" });
  });

  it("network failure / timeout → PaynetError status 0", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(getPaynetOrder(CFG, 1)).rejects.toMatchObject({ httpStatus: 0, code: "TIMEOUT" });
  });
});
