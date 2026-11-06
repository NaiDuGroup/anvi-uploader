/**
 * Invoice lines for one picked order («+ строка из заказа»). An order with a
 * dealer «Срочно» fee is billed as two lines — the goods (price − fee) and
 * «Срочность» (the fee) — both linked to the order; any other order is one
 * line at its price. Pure, client-safe.
 */
export interface PickedOrderForInvoice {
  id: string;
  orderNumber: number;
  productLabel: string;
  /** Order total (goods + urgency fee); null = not priced yet. */
  price: number | null;
  /** Dealer urgency fee inside `price` (null / 0 = none). */
  urgencyFeeMdl?: number | null;
}

export interface OrderInvoiceLineDraft {
  description: string;
  unitPrice: number;
  orderId: string;
  orderNumber: number;
}

export function orderToInvoiceLines(
  order: PickedOrderForInvoice,
  labels: { orderLine: (orderNumber: number) => string; urgencyLine: (orderNumber: number) => string },
): OrderInvoiceLineDraft[] {
  const base = `${labels.orderLine(order.orderNumber)} — ${order.productLabel}`;
  const price = order.price ?? 0;
  const fee = order.urgencyFeeMdl ?? 0;
  if (order.price == null || !(fee > 0) || fee > price) {
    return [{ description: base, unitPrice: price, orderId: order.id, orderNumber: order.orderNumber }];
  }
  const goods = Math.round((price - fee) * 100) / 100;
  return [
    { description: base, unitPrice: goods, orderId: order.id, orderNumber: order.orderNumber },
    {
      description: labels.urgencyLine(order.orderNumber),
      unitPrice: Math.round(fee * 100) / 100,
      orderId: order.id,
      orderNumber: order.orderNumber,
    },
  ];
}
