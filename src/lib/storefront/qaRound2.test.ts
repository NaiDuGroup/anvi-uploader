import { describe, expect, it } from "vitest";
import type { CartLine } from "./cart";
import { checkoutOutcome, parseCheckoutFieldErrors, type CheckoutForm } from "./checkout";
import { draftFromForm, parseCheckoutDraft } from "./checkoutDraft";
import { kindNeedsFile, lineMissingFile } from "./fileRules";
import { shopT, SHOP_LANGS } from "./i18n";
import { qtySuffix } from "./lineLabels";
import { applyRecentOrderChecks, visibleRecentOrders, type RecentOrder } from "./recentOrders";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: "l1",
  slug: "cana",
  title: "Cană",
  optionsText: "",
  image: null,
  quote: { kind: "mug", productId: "v1", quantity: 1 },
  files: [],
  addedAt: 1,
  ...over,
});

describe("design file rule (product page, cart, checkout = server)", () => {
  it("mug / notebook / pen need a file, DTF does not", () => {
    expect(["mug", "notebook", "pen"].every(kindNeedsFile)).toBe(true);
    expect(kindNeedsFile("dtf")).toBe(false);
  });

  it("flags an old cart line without a file", () => {
    expect(lineMissingFile(line())).toBe(true);
    expect(lineMissingFile(line({ files: [{ fileKey: "uploads/1-a-b.png", fileName: "b.png" }] }))).toBe(false);
    const dtf = line({
      quote: { kind: "dtf", garmentId: "g", sizes: [{ size: "L", quantity: 1 }], zones: [] },
    });
    expect(lineMissingFile(dtf)).toBe(false);
  });

  it("no «send it later» promise on file-required kinds in any language", () => {
    for (const lang of SHOP_LANGS) {
      const t = shopT(lang);
      expect(t("fileRequired")).not.toBe("fileRequired");
      expect(t("fileMissing")).not.toBe("fileMissing");
    }
  });
});

describe("checkout error mapping", () => {
  it("names the wrong line and the reason", () => {
    const out = checkoutOutcome(400, { error: "invalid_input", fieldErrors: { "lines.1.files": "required" } });
    expect(out).toEqual({ kind: "invalid", fields: [], lines: [{ index: 1, field: "files", code: "required" }] });
  });

  it("maps other line errors generically and form fields to their inputs", () => {
    const r = parseCheckoutFieldErrors({
      "lines.0.quote": "invalid",
      "lines.0.files.0.fileKey": "invalid_file_key",
      "lines.2.title": "too_small",
      "customer.phone": "invalid_phone",
      acceptTerms: "terms_required",
      something: "x",
    });
    expect(r.fields).toEqual(["phone", "terms"]);
    expect(r.lines).toEqual([
      { index: 0, field: "files", code: "invalid_file_key" },
      { index: 2, field: "title", code: "too_small" },
    ]);
  });

  it("a file gone from storage points at its line", () => {
    expect(checkoutOutcome(400, { error: "file_not_found", index: 0, fileKey: "uploads/x" })).toEqual({
      kind: "invalid",
      fields: [],
      lines: [{ index: 0, field: "files", code: "file_not_found" }],
    });
  });
});

describe("checkout draft", () => {
  const form: CheckoutForm = {
    name: "Ana",
    phone: "+373 60 000 000",
    email: "ana@example.md",
    method: "courier_chisinau",
    city: "",
    address: "str. Ismail 1",
    note: "etaj 3",
    acceptTerms: true,
  };

  it("keeps only the contact / delivery fields", () => {
    const draft = draftFromForm(form);
    expect(draft).not.toHaveProperty("acceptTerms");
    expect(parseCheckoutDraft(JSON.stringify({ ...draft, acceptTerms: true, cart: [1], token: "x" }))).toEqual(draft);
  });

  it("ignores junk, an empty form and unknown methods", () => {
    expect(parseCheckoutDraft("{")).toBeNull();
    expect(parseCheckoutDraft(JSON.stringify({ name: "", phone: "+373 " }))).toBeNull();
    expect(parseCheckoutDraft(JSON.stringify({ name: "Ana", method: "drone" }))?.method).toBe("pickup");
    expect(parseCheckoutDraft(JSON.stringify({ name: "x".repeat(500) }))?.name).toHaveLength(100);
  });
});

describe("summary quantity", () => {
  it("is not repeated when the options already show pieces per size", () => {
    expect(qtySuffix("Negru · L×2 · Față: A4 21×30", 2)).toBe("");
    expect(qtySuffix("M×1, L×2 · Spate: A3", 3)).toBe("");
    expect(qtySuffix("Negru · logo 9×5 cm", 4)).toBe(" × 4");
    expect(qtySuffix("Albă 320 ml", 2)).toBe(" × 2");
    expect(qtySuffix("", 1)).toBe(" × 1");
  });
});

describe("«Comenzile mele» clean-up", () => {
  const list: RecentOrder[] = [
    { token: "a", number: "12", at: 3 },
    { token: "b", number: null, at: 2 },
    { token: "c", number: null, at: 1 },
    { token: "d", number: "9", at: 0 },
  ];

  it("drops orders the API does not know and fills numbers, keeping the order", () => {
    const next = applyRecentOrderChecks(list, [
      { token: "d", found: false },
      { token: "b", found: true, number: 15 },
    ]);
    expect(next.map((o) => [o.token, o.number])).toEqual([
      ["a", "12"],
      ["b", "15"],
      ["c", null],
    ]);
  });

  it("does not show entries without a number", () => {
    expect(visibleRecentOrders(list).map((o) => o.token)).toEqual(["a", "d"]);
  });
});
