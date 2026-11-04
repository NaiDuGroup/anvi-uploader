import { round2 } from "@/lib/money";
import type { ShopDeliveryMethod } from "./constants";
import { shopCustomerStatus, type ShopCustomerStatus } from "./customerStatus";

/**
 * Public view of a storefront order (`GET /api/shop/order/[token]`): an
 * allowlist — no costs, consumption, staff names, phone or address.
 */
export interface ShopOrderView {
  orderNumber: number;
  createdAt: string;
  status: ShopCustomerStatus;
  paymentStatus: string;
  total: number;
  subtotal: number;
  deliveryPrice: number;
  delivery: { method: ShopDeliveryMethod; city?: string };
  trackingNumber?: string;
  customerName: string;
  lines: { title: string; optionsText?: string; quantity: number; total: number }[];
}

type Decimalish = { toString(): string } | number | null | undefined;

export interface ShopOrderViewInput {
  orderNumber: number;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  isPaid: boolean;
  shippedAt: Date | null;
  price: Decimalish;
  deliveryPriceMdl: Decimalish;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  trackingNumber: string | null;
  customerName: string | null;
  clientName: string | null;
  orderLines: { shopLineData: unknown }[];
}

function num(v: Decimalish): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function lineView(raw: unknown): ShopOrderView["lines"][number] | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.title !== "string") return null;
  return {
    title: d.title,
    ...(typeof d.optionsText === "string" && d.optionsText ? { optionsText: d.optionsText } : {}),
    quantity: typeof d.quantity === "number" ? d.quantity : 0,
    total: typeof d.total === "number" ? d.total : 0,
  };
}

const METHODS: ReadonlySet<string> = new Set(["pickup", "courier_chisinau", "courier_moldova"]);

export function buildShopOrderView(o: ShopOrderViewInput): ShopOrderView {
  const total = round2(num(o.price));
  const deliveryPrice = round2(num(o.deliveryPriceMdl));
  const method = (METHODS.has(o.deliveryMethod ?? "") ? o.deliveryMethod : "pickup") as ShopDeliveryMethod;
  return {
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    status: shopCustomerStatus(o),
    paymentStatus: o.paymentStatus,
    total,
    subtotal: round2(total - deliveryPrice),
    deliveryPrice,
    delivery: { method, ...(o.deliveryCity ? { city: o.deliveryCity } : {}) },
    ...(o.trackingNumber ? { trackingNumber: o.trackingNumber } : {}),
    customerName: o.customerName ?? o.clientName ?? "",
    lines: o.orderLines.map((l) => lineView(l.shopLineData)).filter((l): l is NonNullable<typeof l> => l != null),
  };
}
