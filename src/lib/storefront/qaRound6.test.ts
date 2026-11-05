import { afterEach, describe, expect, it, vi } from "vitest";
import { psPerPieceText, psSheetsText } from "./printShop/text";
import { fetchQuote, retryAfterMs } from "./quoteClient";
import { formatPrice as fp } from "./format";

/** Same text with plain spaces (prices use a non-breaking space). */
const plain = (s: string): string => s.replace(/\u00a0/g, " ");
const formatPrice = (a: number, lang: "ro" | "ru" | "en"): string => plain(fp(a, lang));

/** QA 2026-11-05 (docs/qa/2026-11-05-chrome-storefront.md): B1, B6, B8. */

describe("B1 — quote 429: wait for Retry-After and ask again", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retryAfterMs honours the header, clamped to 1–30 s", () => {
    expect(retryAfterMs("3", 0)).toBe(3000);
    expect(retryAfterMs("0", 0)).toBe(2000);
    expect(retryAfterMs("600", 0)).toBe(30_000);
    expect(retryAfterMs(null, 0)).toBe(2000);
    expect(retryAfterMs(null, 2)).toBe(8000);
    expect(retryAfterMs("abc", 1)).toBe(4000);
  });

  it("fetchQuote retries after a 429 instead of failing", async () => {
    vi.useFakeTimers();
    const ok = { currency: "MDL", lines: [], subtotal: 0 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onLimited = vi.fn();
    const p = fetchQuote([], "ro", undefined, onLimited);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onLimited).toHaveBeenCalledTimes(1);
  });

  it("a newer configuration (abort) stops the wait", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "5" } })));
    const ctrl = new AbortController();
    const p = fetchQuote([], "ro", ctrl.signal);
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    ctrl.abort();
    expect(((await caught) as { name?: string }).name).toBe("AbortError");
  });

  it("other errors still fail fast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await expect(fetchQuote([], "ro")).rejects.toThrow("quote_500");
  });
});

describe("B6 — fractional per-piece price is only a hint", () => {
  const ro = (a: number) => formatPrice(a, "ro");
  it("whole lei per piece stays plain", () => {
    expect(psPerPieceText(250, 50, false, "ro", ro)).toBe("5 lei / buc. · 50 buc.");
  });
  it("DL flyers 167 / 50 → «≈ 3,34 lei / buc.»", () => {
    expect(psPerPieceText(167, 50, false, "ro", ro)).toBe("≈ 3,34 lei / buc. · 50 buc.");
    expect(psPerPieceText(333, 100, false, "en", (a) => formatPrice(a, "en"))).toBe("≈ 3,33 lei / pc · 100 pcs");
  });
});

describe("B8 — sticker sheets count sheets with plural forms", () => {
  it("Romanian: 1 foaie, 2 foi, 20 de foi", () => {
    expect([1, 2, 5, 20, 101].map((n) => psSheetsText(n, "ro"))).toEqual(["1 foaie", "2 foi", "5 foi", "20 de foi", "101 foi"]);
  });
  it("Russian and English", () => {
    expect([1, 2, 5, 21].map((n) => psSheetsText(n, "ru"))).toEqual(["1 лист", "2 листа", "5 листов", "21 лист"]);
    expect([1, 5].map((n) => psSheetsText(n, "en"))).toEqual(["1 sheet", "5 sheets"]);
  });
  it("the price hint is per sheet", () => {
    expect(psPerPieceText(60, 5, true, "ro", (a) => formatPrice(a, "ro"))).toBe("12 lei / foaie · 5 foi");
    expect(psPerPieceText(12, 1, true, "ru", (a) => formatPrice(a, "ru"))).toBe("12 лей / лист · 1 лист");
  });
});
