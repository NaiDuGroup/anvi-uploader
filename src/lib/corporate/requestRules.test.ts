import { describe, expect, it } from "vitest";
import {
  chisinauToday,
  corporateFileKey,
  corporateUpdateSchema,
  isHoneypotFilled,
  parseCorporateRequest,
  readCorporateFiles,
} from "./requestRules";

const NOW = new Date("2026-11-05T10:00:00Z");

const valid = {
  companyName: "Moldcell SRL",
  contactName: "Ion Popescu",
  phone: "+373 69 123 456",
  email: "Ion@Example.md ",
  products: ["mugs", "pens"],
  quantity: "100_250",
  deadline: "2026-11-20",
  budget: "",
  hasLogo: true,
  files: [{ fileKey: "uploads/1-abc-logo.pdf", fileName: "logo.pdf", sizeBytes: 1200 }],
  message: "Logo pe căni albe",
  consent: true,
  lang: "ru",
};

describe("parseCorporateRequest", () => {
  it("accepts a complete form and normalises it", () => {
    const r = parseCorporateRequest(valid, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.email).toBe("ion@example.md");
    expect(r.data.deadlineDate.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(r.data.lang).toBe("ru");
    expect(r.data.files).toHaveLength(1);
  });

  it("budget, files and message are optional", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.budget;
    delete rest.files;
    delete rest.message;
    const r = parseCorporateRequest(rest, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.files).toEqual([]);
  });

  it("reports each missing / bad field", () => {
    const r = parseCorporateRequest(
      { ...valid, companyName: " ", email: "nope", phone: "12", products: [], quantity: "lots", consent: false },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      companyName: "invalid",
      email: "invalid",
      phone: "invalid",
      products: "invalid",
      quantity: "invalid",
      consent: "consent",
    });
  });

  it("needs a yes / no for the logo", () => {
    const r = parseCorporateRequest({ ...valid, hasLogo: undefined }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.hasLogo).toBe("invalid");
  });

  it("rejects unknown products", () => {
    expect(parseCorporateRequest({ ...valid, products: ["mugs", "rockets"] }, NOW).ok).toBe(false);
  });

  it("«other» needs the free text", () => {
    const r = parseCorporateRequest({ ...valid, products: ["other"] }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.productsOther).toBe("required");
    expect(parseCorporateRequest({ ...valid, products: ["other"], productsOther: "Umbrele" }, NOW).ok).toBe(true);
  });

  it("deadline: today is fine; the past, impossible dates and > 2 years are not", () => {
    expect(parseCorporateRequest({ ...valid, deadline: "2026-11-05" }, NOW).ok).toBe(true);
    for (const deadline of ["2026-11-04", "2026-02-30", "2029-01-01", "20.11.2026"]) {
      const r = parseCorporateRequest({ ...valid, deadline }, NOW);
      expect(r.ok, deadline).toBe(false);
      if (!r.ok) expect(r.errors.deadline).toBe("invalid");
    }
  });

  it("«today» is Chișinău's date, not UTC's", () => {
    // 23:30 UTC on 4 Nov = 01:30 on 5 Nov in Chișinău (UTC+2).
    expect(chisinauToday(new Date("2026-11-04T23:30:00Z"))).toBe("2026-11-05");
  });

  it("files must be fresh order uploads, at most 5", () => {
    expect(parseCorporateRequest({ ...valid, files: [{ fileKey: "shop-orders/x.pdf", fileName: "x.pdf" }] }, NOW).ok).toBe(false);
    expect(parseCorporateRequest({ ...valid, files: [{ fileKey: "uploads/../secret", fileName: "x" }] }, NOW).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({ fileKey: `uploads/${i}.png`, fileName: `${i}.png` }));
    expect(parseCorporateRequest({ ...valid, files: six }, NOW).ok).toBe(false);
  });

  it("caps text lengths", () => {
    expect(parseCorporateRequest({ ...valid, message: "x".repeat(3001) }, NOW).ok).toBe(false);
    expect(parseCorporateRequest({ ...valid, companyName: "x".repeat(201) }, NOW).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(parseCorporateRequest(null, NOW).ok).toBe(false);
    expect(parseCorporateRequest("hi", NOW).ok).toBe(false);
  });
});

describe("honeypot", () => {
  it("is filled only by a non-empty value", () => {
    expect(isHoneypotFilled({ ...valid, website: "" })).toBe(false);
    expect(isHoneypotFilled({ ...valid, website: "   " })).toBe(false);
    expect(isHoneypotFilled(valid)).toBe(false);
    expect(isHoneypotFilled({ ...valid, website: "http://spam.example" })).toBe(true);
    expect(isHoneypotFilled({ ...valid, website: 1 })).toBe(true);
    expect(isHoneypotFilled(null)).toBe(false);
  });
});

describe("stored files", () => {
  it("copies move out of the expiring uploads/ prefix", () => {
    expect(corporateFileKey("uploads/123-ab-logo.pdf")).toBe("corporate-requests/123-ab-logo.pdf");
  });

  it("reads the stored JSON defensively", () => {
    expect(readCorporateFiles([{ key: "k", name: "n", size: 3 }, { key: 1 }, null, { key: "k2", name: "n2" }])).toEqual([
      { key: "k", name: "n", size: 3 },
      { key: "k2", name: "n2", size: null },
    ]);
    expect(readCorporateFiles("x")).toEqual([]);
  });
});

describe("corporateUpdateSchema", () => {
  it("accepts status, assignee and notes; refuses empty or unknown", () => {
    expect(corporateUpdateSchema.safeParse({ status: "in_work" }).success).toBe(true);
    expect(corporateUpdateSchema.safeParse({ assigneeId: null }).success).toBe(true);
    expect(corporateUpdateSchema.safeParse({ notes: "sunat" }).success).toBe(true);
    expect(corporateUpdateSchema.safeParse({}).success).toBe(false);
    expect(corporateUpdateSchema.safeParse({ status: "done" }).success).toBe(false);
    expect(corporateUpdateSchema.safeParse({ status: "won", email: "x@y.z" }).success).toBe(false);
    expect(corporateUpdateSchema.safeParse({ assigneeId: "not-a-uuid" }).success).toBe(false);
  });
});
