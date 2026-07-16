import { describe, it, expect } from "vitest";
import {
  allocationsForConfirm,
  orderCitedSuggestions,
  type MatchSuggestion,
} from "./autoMatch";
import type { MatchSignals } from "./match";

function sug(input: {
  fiscalInvoiceId: string;
  fiscalNumber: string;
  amount: string;
  confidence: number;
  signals?: Partial<MatchSignals>;
}): MatchSuggestion {
  return {
    fiscalInvoiceId: input.fiscalInvoiceId,
    fiscalNumber: input.fiscalNumber,
    amount: input.amount,
    confidence: input.confidence,
    buyerName: "Test",
    signals: {
      numberMatch: true,
      idnoMatch: true,
      amountExact: false,
      uniqueOpenForClient: false,
      ...input.signals,
    },
  };
}

describe("orderCitedSuggestions", () => {
  it("orders cited invoices as they appear in the purpose", () => {
    const purpose =
      "Plata conform e-factura Nr. EBD000641852 din 08-12-2025 si nr. EAZ000879209 din 04-08-2025";
    const suggestions = [
      sug({
        fiscalInvoiceId: "a",
        fiscalNumber: "EAZ000879209",
        amount: "96.00",
        confidence: 88,
      }),
      sug({
        fiscalInvoiceId: "b",
        fiscalNumber: "EBD000641852",
        amount: "544.00",
        confidence: 88,
      }),
    ];
    const ordered = orderCitedSuggestions(purpose, suggestions);
    expect(ordered.map((s) => s.fiscalNumber)).toEqual([
      "EBD000641852",
      "EAZ000879209",
    ]);
  });

  it("ignores suggestions without numberMatch", () => {
    const suggestions = [
      sug({
        fiscalInvoiceId: "a",
        fiscalNumber: "EAZ000879209",
        amount: "96.00",
        confidence: 88,
        signals: {
          numberMatch: false,
          idnoMatch: true,
          amountExact: false,
          uniqueOpenForClient: true,
        },
      }),
    ];
    expect(orderCitedSuggestions("anything", suggestions)).toHaveLength(0);
  });
});

describe("allocationsForConfirm", () => {
  it("sends all cited invoices for a multi-invoice payment", () => {
    const purpose = "Plata Nr. EBD000641852 si nr. EAZ000879209";
    const suggestions = [
      sug({
        fiscalInvoiceId: "a",
        fiscalNumber: "EAZ000879209",
        amount: "96.00",
        confidence: 88,
      }),
      sug({
        fiscalInvoiceId: "b",
        fiscalNumber: "EBD000641852",
        amount: "544.00",
        confidence: 88,
      }),
    ];
    const alloc = allocationsForConfirm(purpose, suggestions);
    expect(alloc).toEqual([
      { fiscalInvoiceId: "b", amount: 544 },
      { fiscalInvoiceId: "a", amount: 96 },
    ]);
  });

  it("falls back to the top suggestion when nothing is cited", () => {
    const suggestions = [
      sug({
        fiscalInvoiceId: "x",
        fiscalNumber: "EAZ000000001",
        amount: "100.00",
        confidence: 40,
        signals: {
          numberMatch: false,
          idnoMatch: true,
          amountExact: false,
          uniqueOpenForClient: false,
        },
      }),
    ];
    expect(allocationsForConfirm("no invoice here", suggestions)).toEqual([
      { fiscalInvoiceId: "x", amount: 100 },
    ]);
  });
});
