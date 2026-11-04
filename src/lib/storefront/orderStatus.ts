import type { ShopStringKey } from "./i18n";

/** Answer of `GET /api/shop/order/[token]` (public, by the order's secret token). */
export interface ShopOrderView {
  orderNumber: string | number;
  createdAt: string;
  status: "pending_payment" | "paid" | "in_production" | "shipped" | "delivered" | "issue";
  paymentStatus: string;
  total: number;
  subtotal: number;
  deliveryPrice: number;
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
  lines: { title: string; optionsText?: string | null; quantity: number; total: number }[];
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
