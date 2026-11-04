import { dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { round2 } from "@/lib/money";
import type { ShopDeliveryMethod } from "./constants";
import { shopCustomerStatus, type ShopCustomerStatus } from "./customerStatus";

/**
 * Public view of a storefront order (`GET /api/shop/order/[token]`): an
 * allowlist — no costs, consumption, staff names, phone or email. The
 * courier address and note are shown: only the holder of the order's secret
 * link (the customer) sees this view.
 */
export interface ShopOrderView {
  orderNumber: number;
  createdAt: string;
  status: ShopCustomerStatus;
  paymentStatus: string;
  total: number;
  subtotal: number;
  deliveryPrice: number;
  delivery: { method: ShopDeliveryMethod; city?: string; address?: string; note?: string };
  trackingNumber?: string;
  customerName: string;
  /** Not paid yet and payable online: the page offers «Plătește acum». */
  canPay: boolean;
  /** Files may still be added to DTF lines (not shipped / delivered yet). */
  canAddFiles: boolean;
  lines: {
    title: string;
    optionsText?: string;
    quantity: number;
    total: number;
    /** DTF: print zones («front» / «back») that have no artwork file yet. */
    missingFileZones?: string[];
    /** Photo / document printing: the options already carry the copies (no « × N»). */
    noQty?: true;
  }[];
}

/** Line name in the viewer's language from the stored quote; null keeps the stored text. */
export type ShopLineDescriber = (quote: unknown) => { title: string; optionsText: string } | null;

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
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  trackingNumber: string | null;
  customerName: string | null;
  clientName: string | null;
  /** `files` (paper types) mark DTF zones without artwork; absent = not checked. */
  orderLines: { shopLineData: unknown; files?: { paperType: string | null }[] }[];
}

/** DTF zone ids of a stored shop line (`shopLineData.quote.zones`); [] for other kinds. */
export function shopLineDtfZoneIds(raw: unknown): string[] {
  if (raw == null || typeof raw !== "object") return [];
  const quote = (raw as Record<string, unknown>).quote;
  if (quote == null || typeof quote !== "object") return [];
  const q = quote as Record<string, unknown>;
  if (q.kind !== "dtf" || !Array.isArray(q.zones)) return [];
  return q.zones.flatMap((z) => (z && typeof z === "object" && typeof (z as { id?: unknown }).id === "string" ? [(z as { id: string }).id] : []));
}

/**
 * Zones of a DTF line with no file: a file is tagged `dtf:<zoneId>` (the
 * checkout tags each); an untagged file counts for the first zone.
 */
export function missingDtfFileZones(raw: unknown, files: readonly { paperType: string | null }[]): string[] {
  const zones: string[] = shopLineDtfZoneIds(raw);
  if (zones.length === 0) return [];
  const covered = new Set<string>(
    files.map((f) => dtfZoneIdFromPaperType(f.paperType) ?? zones[0]!),
  );
  return zones.filter((z) => !covered.has(z));
}

function num(v: Decimalish): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function lineView(
  raw: unknown,
  describe?: ShopLineDescriber,
  files?: readonly { paperType: string | null }[],
): ShopOrderView["lines"][number] | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.title !== "string") return null;
  let live: { title: string; optionsText: string } | null = null;
  try {
    live = describe ? describe(d.quote) : null;
  } catch {
    live = null;
  }
  const title: string = live?.title || d.title;
  const optionsText: unknown = live ? live.optionsText : d.optionsText;
  const missing: string[] = files ? missingDtfFileZones(raw, files) : [];
  return {
    ...(missing.length ? { missingFileZones: missing } : {}),
    ...(d.kind === "print" ? { noQty: true as const } : {}),
    title,
    ...(typeof optionsText === "string" && optionsText ? { optionsText } : {}),
    quantity: typeof d.quantity === "number" ? d.quantity : 0,
    total: typeof d.total === "number" ? d.total : 0,
  };
}

const METHODS: ReadonlySet<string> = new Set(["pickup", "courier_chisinau", "courier_moldova"]);

export function buildShopOrderView(o: ShopOrderViewInput, describe?: ShopLineDescriber): ShopOrderView {
  const total = round2(num(o.price));
  const deliveryPrice = round2(num(o.deliveryPriceMdl));
  const method = (METHODS.has(o.deliveryMethod ?? "") ? o.deliveryMethod : "pickup") as ShopDeliveryMethod;
  const status = shopCustomerStatus(o);
  return {
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    status,
    paymentStatus: o.paymentStatus,
    total,
    subtotal: round2(total - deliveryPrice),
    deliveryPrice,
    delivery: {
      method,
      ...(o.deliveryCity ? { city: o.deliveryCity } : {}),
      ...(method !== "pickup" && o.deliveryAddress ? { address: o.deliveryAddress } : {}),
      ...(o.deliveryNote ? { note: o.deliveryNote } : {}),
    },
    ...(o.trackingNumber ? { trackingNumber: o.trackingNumber } : {}),
    customerName: o.customerName ?? o.clientName ?? "",
    canPay: status === "pending_payment",
    canAddFiles: status !== "shipped" && status !== "delivered",
    lines: o.orderLines
      .map((l) => lineView(l.shopLineData, describe, l.files))
      .filter((l): l is NonNullable<typeof l> => l != null),
  };
}
