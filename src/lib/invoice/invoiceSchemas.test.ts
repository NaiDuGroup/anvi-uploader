import { describe, it, expect } from "vitest";
import {
  cancelInvoiceSchema,
  companyProfileUpdateSchema,
  createInvoiceSchema,
  markInvoicePaidSchema,
  updateInvoiceSchema,
} from "@/lib/validations";

const VALID_CLIENT_ID = "11111111-1111-4111-8111-111111111111";

describe("createInvoiceSchema", () => {
  it("accepts a minimal payload", () => {
    const parsed = createInvoiceSchema.parse({
      clientId: VALID_CLIENT_ID,
      lineItems: [
        { description: "Service", quantity: 1, unitPrice: 100 },
      ],
    });
    expect(parsed.clientId).toBe(VALID_CLIENT_ID);
    expect(parsed.lineItems).toHaveLength(1);
  });

  it("rejects a payload with no line items", () => {
    expect(() =>
      createInvoiceSchema.parse({
        clientId: VALID_CLIENT_ID,
        lineItems: [],
      }),
    ).toThrow();
  });

  it("rejects negative unit price", () => {
    expect(() =>
      createInvoiceSchema.parse({
        clientId: VALID_CLIENT_ID,
        lineItems: [{ description: "X", quantity: 1, unitPrice: -1 }],
      }),
    ).toThrow();
  });

  it("rejects zero quantity", () => {
    expect(() =>
      createInvoiceSchema.parse({
        clientId: VALID_CLIENT_ID,
        lineItems: [{ description: "X", quantity: 0, unitPrice: 1 }],
      }),
    ).toThrow();
  });

  it("rejects an unknown locale", () => {
    expect(() =>
      createInvoiceSchema.parse({
        clientId: VALID_CLIENT_ID,
        locale: "fr",
        lineItems: [{ description: "X", quantity: 1, unitPrice: 1 }],
      }),
    ).toThrow();
  });

  it("rejects more than 50 line items", () => {
    const lines = Array.from({ length: 51 }, () => ({
      description: "x",
      quantity: 1,
      unitPrice: 1,
    }));
    expect(() =>
      createInvoiceSchema.parse({
        clientId: VALID_CLIENT_ID,
        lineItems: lines,
      }),
    ).toThrow();
  });
});

describe("updateInvoiceSchema", () => {
  it("allows empty body (partial edit)", () => {
    const parsed = updateInvoiceSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("accepts replacement of line items", () => {
    const parsed = updateInvoiceSchema.parse({
      lineItems: [{ description: "Updated", quantity: 2, unitPrice: 50 }],
    });
    expect(parsed.lineItems).toHaveLength(1);
  });
});

describe("companyProfileUpdateSchema", () => {
  it("accepts a partial supplier update", () => {
    const parsed = companyProfileUpdateSchema.parse({
      vatRate: 20,
      defaultLocale: "ro",
    });
    expect(parsed.vatRate).toBe(20);
  });

  it("rejects invalid VAT rate", () => {
    expect(() =>
      companyProfileUpdateSchema.parse({ vatRate: 150 }),
    ).toThrow();
  });

  it("rejects empty IBAN string", () => {
    expect(() => companyProfileUpdateSchema.parse({ iban: "" })).toThrow();
  });
});

describe("markInvoicePaidSchema / cancelInvoiceSchema", () => {
  it("markInvoicePaidSchema accepts empty body and a note", () => {
    expect(markInvoicePaidSchema.parse({})).toEqual({});
    expect(markInvoicePaidSchema.parse({ paidNote: "OK" })).toEqual({
      paidNote: "OK",
    });
  });

  it("cancelInvoiceSchema accepts a reason", () => {
    expect(cancelInvoiceSchema.parse({ reason: "client backed out" })).toEqual({
      reason: "client backed out",
    });
  });
});
