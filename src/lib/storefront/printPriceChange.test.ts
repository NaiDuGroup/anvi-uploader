import { describe, expect, it } from "vitest";
import type { CartLine } from "./cart";
import { applyPriceChange, checkoutOutcome } from "./checkout";

const line: CartLine = {
  id: "l1",
  slug: "printare",
  title: "Printare documente",
  optionsText: "",
  image: null,
  quote: {
    kind: "print",
    mode: "doc",
    items: [1, 1].map((pages) => ({ format: "A4" as const, color: "bw" as const, sides: "one" as const, pages, copies: 1 })),
  },
  files: [
    { fileKey: "uploads/1762250000000-a-a.pdf", fileName: "a.pdf", pages: 1 },
    { fileKey: "uploads/1762250000000-b-b.docx", fileName: "b.docx", pages: 1 },
  ],
  lastTotal: 4,
  addedAt: 1,
};

describe("checkout 409 price_changed (documents re-counted by the server)", () => {
  it("is read as its own outcome with the new total and the real pages", () => {
    const out = checkoutOutcome(409, {
      error: "price_changed",
      reason: "print_pages",
      lines: [{ index: 0, pages: [3, 1], counted: [true, false], total: 8 }, { index: "x" }],
      subtotal: 8,
      deliveryPrice: 0,
      total: 8,
    });
    expect(out).toEqual({ kind: "price_changed", total: 8, lines: [{ index: 0, pages: [3, 1], counted: [true, false], total: 8 }] });
  });

  it("updates the cart line: real pages, counted (read-only) files, new total", () => {
    const next = applyPriceChange(line, { index: 0, pages: [3, 1], counted: [true, false], total: 8 })!;
    expect(next.quote.kind === "print" && next.quote.items.map((i) => ("pages" in i ? i.pages : null))).toEqual([3, 1]);
    expect(next.files.map((f) => [f.pages, f.pagesCounted])).toEqual([
      [3, true],
      [1, undefined], // the Word file stays editable
    ]);
    expect(next.lastTotal).toBe(8);
    expect(applyPriceChange(line, { index: 0, pages: [3], counted: [true], total: 8 })).toBeNull();
  });
});
