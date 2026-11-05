import type { ShopStringKey } from "./i18n";
import type { ShopLeadTime } from "./leadTime";

/** Answer of `GET /api/shop/order/[token]` (public, by the order's secret token). */
export interface ShopOrderView {
  orderNumber: string | number;
  createdAt: string;
  status: "pending_payment" | "paid" | "in_production" | "shipped" | "delivered" | "issue";
  paymentStatus: string;
  total: number;
  subtotal: number;
  deliveryPrice: number;
  /** Promo code discount already taken off `total` (absent on older answers). */
  discount?: number;
  promoCode?: string;
  promoFreeDelivery?: boolean;
  delivery: {
    method: "pickup" | "courier_chisinau" | "courier_moldova";
    city?: string | null;
    address?: string | null;
    note?: string | null;
  };
  trackingNumber?: string | null;
  customerName: string;
  /** Not paid yet: the page offers «Plătește acum» (absent on older answers). */
  canPay?: boolean;
  /** Files may still be added to DTF lines (absent on older answers). */
  canAddFiles?: boolean;
  /** Until it ships: the longest lead time of its lines, working days after payment. */
  leadTime?: ShopLeadTime;
  lines: {
    title: string;
    optionsText?: string | null;
    quantity: number;
    total: number;
    /** DTF: print zones without an artwork file yet. */
    missingFileZones?: string[];
    /** Photo / document printing: no « × N» after the options. */
    noQty?: boolean;
  }[];
}

export interface OrderStep {
  label: ShopStringKey;
  state: "done" | "current" | "todo";
}

/** Last step already reached per status; the next one is «in progress». */
const REACHED: Record<ShopOrderView["status"], number> = {
  pending_payment: -1,
  paid: 0,
  in_production: 0,
  issue: 0,
  shipped: 2,
  delivered: 3,
};

/** Four progress steps (paid → printing → handed over → delivered) for a status. */
export function orderSteps(status: ShopOrderView["status"], method: ShopOrderView["delivery"]["method"]): OrderStep[] {
  const pickup: boolean = method === "pickup";
  const labels: ShopStringKey[] = [
    "stPaid",
    "stPrinting",
    pickup ? "stPickupReady" : "stShipped",
    pickup ? "stPickedUp" : "stDelivered",
  ];
  const reached: number = REACHED[status] ?? -1;
  return labels.map((label, i) => ({
    label,
    state: i <= reached ? "done" : i === reached + 1 && reached >= 0 ? "current" : "todo",
  }));
}

export function isPaid(order: Pick<ShopOrderView, "status" | "paymentStatus">): boolean {
  return order.status !== "pending_payment" || order.paymentStatus === "paid";
}
