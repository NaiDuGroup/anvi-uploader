import { describe, expect, it } from "vitest";
import {
  DESIGN_REQUEST_COMPANY,
  designRequestKindOf,
  designRequestToCorporate,
  designRequestTopic,
  designerHelpLabel,
  isDesignRequest,
  parseDesignRequest,
  parseDesignerPrice,
} from "./designerHelp";

const base = { name: "Ana", phone: "+373 79 123 456", message: "Logo + text pe cană", kind: "mug", slug: "cana-alba", consent: true };

describe("parseDesignRequest", () => {
  it("accepts a phone-only request and fills defaults", () => {
    const r = parseDesignRequest(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.email).toBe("");
      expect(r.data.files).toEqual([]);
      expect(r.data.source).toBe("product");
      expect(r.data.lang).toBe("ro");
    }
  });

  it("accepts an e-mail-only request", () => {
    expect(parseDesignRequest({ ...base, phone: "", email: "A@B.md" }).ok).toBe(true);
  });

  it("needs a phone or an e-mail", () => {
    const r = parseDesignRequest({ ...base, phone: "" });
    expect(r).toEqual({ ok: false, errors: { phone: "contact" } });
  });

  it("flags bad fields", () => {
    const r = parseDesignRequest({ ...base, name: "A", phone: "12", email: "x", message: "", consent: false, kind: "tshirt" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({ name: "invalid", phone: "invalid", email: "invalid", message: "invalid", consent: "consent", kind: "invalid" });
    }
  });

  it("refuses a bad slug and foreign file keys / types", () => {
    expect(parseDesignRequest({ ...base, slug: "../x" }).ok).toBe(false);
    const foreign = parseDesignRequest({ ...base, files: [{ fileKey: "corporate-requests/a.png", fileName: "a.png" }] });
    expect(foreign.ok).toBe(false);
    const exe = parseDesignRequest({ ...base, files: [{ fileKey: "uploads/x/a.exe", fileName: "a.exe" }] });
    expect(exe).toEqual({ ok: false, errors: { files: "file_type" } });
    const ok = parseDesignRequest({ ...base, files: [{ fileKey: "uploads/x/logo.png", fileName: "logo.png", sizeBytes: 1000 }] });
    expect(ok.ok).toBe(true);
  });
});

describe("designRequestToCorporate", () => {
  it("marks the stored request for staff", () => {
    const r = parseDesignRequest({ ...base, variant: "Alb", lang: "ru" });
    if (!r.ok) throw new Error("parse");
    const row = designRequestToCorporate(r.data, new Date("2026-11-06T22:30:00Z"));
    expect(row.companyName).toBe(DESIGN_REQUEST_COMPANY);
    expect(row.products).toEqual(["mugs", "other"]);
    expect(row.productsOther).toBe("Помощь дизайнера · cana-alba · Alb");
    expect(row.message.startsWith("[Помощь дизайнера · cana-alba · Alb]\n")).toBe(true);
    expect(row.quantity).toBe("lt50");
    // Chișinău is already on Nov 7 at 22:30 UTC.
    expect(row.deadline.toISOString().slice(0, 10)).toBe("2026-11-07");
    expect(row.hasLogo).toBe(false);
    expect(row.lang).toBe("ru");
    expect(isDesignRequest(row)).toBe(true);
    expect(isDesignRequest({ companyName: "SRL Test", productsOther: null })).toBe(false);
  });

  it("names the Studio gallery when there is no product", () => {
    expect(designRequestTopic({ kind: "pen", slug: "", variant: "", source: "studio" })).toBe("Помощь дизайнера · Studio (ручка)");
  });
});

describe("designerHelpLabel", () => {
  it("says «we'll tell you the price» without a price", () => {
    expect(designerHelpLabel("en", null)).toBe("Request a designer — we'll tell you the price");
    expect(designerHelpLabel("ru", undefined)).toBe("Помощь дизайнера — сообщим цену");
    expect(designerHelpLabel("ro", 0)).toBe("Cere ajutorul unui designer — îți spunem prețul");
  });

  it("shows «from X lei» with a price", () => {
    const plain = (s: string) => s.replace(/[\u00a0\u2009\u202f]/g, " ");
    expect(plain(designerHelpLabel("en", 150))).toBe("Designer help — from 150 lei");
    expect(plain(designerHelpLabel("ru", 99.5))).toBe("Помощь дизайнера — от 99,50 лей");
    expect(plain(designerHelpLabel("ro", 1200))).toBe("Ajutorul designerului — de la 1 200 lei");
  });
});

describe("parseDesignerPrice / designRequestKindOf", () => {
  it("parses the setting", () => {
    expect(parseDesignerPrice("150")).toBe(150);
    expect(parseDesignerPrice("99,5")).toBe(99.5);
    expect(parseDesignerPrice("")).toBeNull();
    expect(parseDesignerPrice(-1)).toBeNull();
    expect(parseDesignerPrice(null)).toBeNull();
  });

  it("maps categories", () => {
    expect(designRequestKindOf({ category: "cani" })).toBe("mug");
    expect(designRequestKindOf({ category: "pixuri" })).toBe("pen");
    expect(designRequestKindOf({ category: "tricouri" })).toBeNull();
  });
});
