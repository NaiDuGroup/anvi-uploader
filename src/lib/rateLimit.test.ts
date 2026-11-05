import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  RATE_LIMITS,
  clientIpFromHeaders,
  evaluateRateLimit,
  normalizeClientIp,
  rateLimitKey,
  rateLimitResponseInit,
  retryAfterSeconds,
  windowStart,
} from "./rateLimit";

const headers = (h: Record<string, string>) => new Headers(h);

describe("fixed window", () => {
  const W = 10 * 60 * 1000;
  it("aligns to window boundaries", () => {
    expect(windowStart(0, W)).toBe(0);
    expect(windowStart(W - 1, W)).toBe(0);
    expect(windowStart(W, W)).toBe(W);
    expect(windowStart(3 * W + 5, W)).toBe(3 * W);
  });

  it("retry-after counts down to the window end", () => {
    expect(retryAfterSeconds(0, W)).toBe(600);
    expect(retryAfterSeconds(W - 500, W)).toBe(1);
    expect(retryAfterSeconds(W - 1, W)).toBe(1);
  });

  it("allows up to the limit and rejects the next hit", () => {
    const rule = { name: "t", limit: 3, windowMs: W };
    expect(evaluateRateLimit(3, rule, 0).allowed).toBe(true);
    expect(evaluateRateLimit(4, rule, 0).allowed).toBe(false);
    expect(evaluateRateLimit(0, rule, 0).allowed).toBe(true);
  });

  it("limits are generous enough for a walk-in batch", () => {
    expect(RATE_LIMITS.uploadUrl.limit).toBeGreaterThanOrEqual(300);
    expect(RATE_LIMITS.createOrder.limit).toBeGreaterThanOrEqual(30);
  });

  it("storefront quotes: a shopper clicking «+» (or an office behind one NAT) never hits the limit", () => {
    expect(RATE_LIMITS.publicQuote.limit).toBeGreaterThanOrEqual(1000);
    expect(RATE_LIMITS.publicQuote.limit).toBeLessThanOrEqual(5000);
  });

  it("429 response carries Retry-After and a stable error code", () => {
    const r = evaluateRateLimit(999, RATE_LIMITS.uploadUrl, 0);
    const { body, init } = rateLimitResponseInit(r);
    expect(init.status).toBe(429);
    expect((init.headers as Record<string, string>)["Retry-After"]).toBe("600");
    expect(body.error).toBe("rate_limited");
  });
});

describe("client ip", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
  });

  it("groups IPv6 by /64 and unwraps IPv4-mapped addresses", () => {
    expect(normalizeClientIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(normalizeClientIp("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeClientIp("::ffff:10.1.2.3")).toBe("10.1.2.3");
    expect(normalizeClientIp("[::1]")).toBe("0:0:0:0::/64");
  });

  it("keys include the route", () => {
    expect(rateLimitKey(RATE_LIMITS.uploadUrl, "1.2.3.4")).toBe("upload-url:1.2.3.4");
    expect(rateLimitKey(RATE_LIMITS.createOrder, "1.2.3.4")).toBe("orders:1.2.3.4");
  });
});
