import { describe, expect, it } from "vitest";
import { orderToInvoiceLines } from "./orderInvoiceLines";
import { uniqueByInvoice } from "./invoiceLinks";
import { dealerUrgencyRu } from "@/lib/i18n/dealerUrgency/ru";

const labels = { orderLine: (n: number) => `Comanda #${n}`, urgencyLine: dealerUrgencyRu.invoiceLine };

describe("orderToInvoiceLines", () => {
  it("plain order → one line at its price", () => {
    expect(orderToInvoiceLines({ id: "o1", orderNumber: 7, productLabel: "Mug", price: 120 }, labels)).toEqual([
      { description: "Comanda #7 — Mug", unitPrice: 120, orderId: "o1", orderNumber: 7 },
    ]);
  });

  it("dealer urgency fee → goods line + «Срочность» line, same total, both linked", () => {
    const lines = orderToInvoiceLines(
      { id: "o1", orderNumber: 7, productLabel: "Mug", price: 150, urgencyFeeMdl: 50 },
      labels,
    );
    expect(lines).toEqual([
      { description: "Comanda #7 — Mug", unitPrice: 100, orderId: "o1", orderNumber: 7 },
      { description: "Срочность (заказ #7)", unitPrice: 50, orderId: "o1", orderNumber: 7 },
    ]);
    expect(lines.reduce((s, l) => s + l.unitPrice, 0)).toBe(150);
  });

  it("free / waived urgency (0) and unpriced orders stay one line", () => {
    expect(
      orderToInvoiceLines({ id: "o", orderNumber: 1, productLabel: "X", price: 100, urgencyFeeMdl: 0 }, labels),
    ).toHaveLength(1);
    expect(
      orderToInvoiceLines({ id: "o", orderNumber: 1, productLabel: "X", price: null, urgencyFeeMdl: 50 }, labels),
    ).toEqual([{ description: "Comanda #1 — X", unitPrice: 0, orderId: "o", orderNumber: 1 }]);
  });

  it("a fee larger than the price (staff lowered the price) is not split", () => {
    expect(
      orderToInvoiceLines({ id: "o", orderNumber: 1, productLabel: "X", price: 30, urgencyFeeMdl: 50 }, labels),
    ).toHaveLength(1);
  });
});

describe("uniqueByInvoice", () => {
  it("keeps one line item per invoice", () => {
    const items = [
      { id: "a", invoice: { id: "i1" } },
      { id: "b", invoice: { id: "i1" } },
      { id: "c", invoice: { id: "i2" } },
    ];
    expect(uniqueByInvoice(items).map((i) => i.id)).toEqual(["a", "c"]);
  });
});
