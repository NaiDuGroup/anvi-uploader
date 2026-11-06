import "server-only";
import { prisma } from "@/lib/prisma";
import { runAfter } from "@/lib/runAfter";
import { notifyShopOrderByToken } from "@/lib/email/shopNotify";
import { alertShopOrderPaid } from "@/lib/notify/staffAlerts";
import { markShopOrderPaid } from "./orders";
import {
  formatPaynetRef,
  getPaynetOrder,
  isPaynetPaid,
  parsePaynetOrderNumber,
  parsePaynetRef,
  paynetConfig,
  toBani,
  type PaynetConfig,
  type PaynetPayment,
} from "./paynet";

/**
 * Settling storefront orders paid on Paynet. Every path (notification,
 * order page check, reconcile cron, «Plătește acum») ends here, and the
 * decision is always taken from Paynet's own answer to
 * `GET /api/order/merchant/{Order}`, never from a request body alone.
 */

export type PaynetSyncResult =
  | "paid" // settled now («Comanda achitată» e-mail + staff alert queued)
  | "already_paid"
  | "pending" // not paid (yet)
  | "mismatch" // paid on Paynet, but not the order total: NOT settled, staff note written
  | "not_found"; // not a pending Paynet storefront order / unknown Paynet order

function num(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** «Comanda achitată» e-mail + staff Telegram alert, after the response; only for the call that settled the order. */
export function queuePaidNotifications(publicToken: string): void {
  runAfter(() => notifyShopOrderByToken(publicToken, "paid"));
  runAfter(() => alertShopOrderPaid(publicToken));
}

type OrderRow = {
  id: string;
  orderNumber: number;
  publicToken: string;
  source: string;
  deletedAt: Date | null;
  paymentStatus: string;
  isPaid: boolean;
  paymentProvider: string | null;
  paymentRef: string | null;
  price: { toString(): string } | null;
};

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  publicToken: true,
  source: true,
  deletedAt: true,
  paymentStatus: true,
  isPaid: true,
  paymentProvider: true,
  paymentRef: true,
  price: true,
} as const;

export interface PaynetSyncDeps {
  get?: typeof getPaynetOrder;
  config?: PaynetConfig | null;
}

/**
 * Settles one order from Paynet's answer for `paynetOrder` (default: the
 * Paynet order of `paymentRef`). Paid with exactly the order total →
 * `markShopOrderPaid` (idempotent) + notifications once; another amount →
 * not settled, one history note for staff per Paynet payment.
 */
async function syncRow(o: OrderRow, paynetOrder: number | null, deps: PaynetSyncDeps): Promise<PaynetSyncResult> {
  if (o.source !== "shop" || o.deletedAt || o.paymentProvider !== "paynet") return "not_found";
  if (o.paymentStatus === "paid" || o.isPaid) return "already_paid";
  const cfg = deps.config === undefined ? paynetConfig() : deps.config;
  if (!cfg) return "pending";
  const n = paynetOrder ?? parsePaynetRef(o.paymentRef)?.paynetOrder ?? null;
  if (n == null || parsePaynetOrderNumber(n, cfg.orderBase)?.orderNumber !== o.orderNumber) return "not_found";

  const p: PaynetPayment | null = await (deps.get ?? getPaynetOrder)(cfg, n);
  if (!p) return "not_found";
  if (p.order !== n || (p.merchantCode && p.merchantCode !== cfg.merchantCode)) return "not_found";
  if (!isPaynetPaid(p)) return "pending";

  const ref = formatPaynetRef(n, p.paymentId);
  const due = toBani(num(o.price));
  const paid = p.amount.paidAmount ?? 0;
  if (paid !== due) {
    await notePaynetMismatch(o, ref, paid, due);
    return "mismatch";
  }
  const r = await markShopOrderPaid(o.publicToken, "paynet", ref);
  if (r === "paid") {
    queuePaidNotifications(o.publicToken);
    return "paid";
  }
  return r === "already_paid" ? "already_paid" : "not_found";
}

/** One `payment_mismatch` history entry per Paynet payment (the cron / order page may see it again). */
async function notePaynetMismatch(o: OrderRow, ref: string, paidBani: number, dueBani: number): Promise<void> {
  console.error(`[paynet] order ${o.orderNumber}: paid ${paidBani} bani on ${ref}, order total ${dueBani} bani — not settled`);
  const seen = await prisma.orderLog.findFirst({
    where: { orderId: o.id, action: "payment_mismatch", newValue: ref },
    select: { id: true },
  });
  if (seen) return;
  await prisma.orderLog.create({
    data: {
      orderId: o.id,
      userId: "client",
      action: "payment_mismatch",
      field: "isPaid",
      oldValue: String(dueBani / 100),
      newValue: ref,
      metadata: { paymentProvider: "paynet", paymentRef: ref, paidMdl: paidBani / 100, totalMdl: dueBani / 100 },
    },
  });
}

/** Settle by the order's public token (order page check). */
export async function syncPaynetOrderByToken(token: string, deps: PaynetSyncDeps = {}): Promise<PaynetSyncResult> {
  if (!token || token.length > 64) return "not_found";
  const o = await prisma.order.findUnique({ where: { publicToken: token }, select: ORDER_SELECT });
  return o ? syncRow(o, null, deps) : "not_found";
}

/** Settle by the order id (reconcile cron). */
export async function syncPaynetOrderById(id: string, deps: PaynetSyncDeps = {}): Promise<PaynetSyncResult> {
  const o = await prisma.order.findUnique({ where: { id }, select: ORDER_SELECT });
  return o ? syncRow(o, null, deps) : "not_found";
}

/**
 * Settle by a Paynet order number (notification `ExternalID`): our order
 * number is `(Order − base) div 100`; that exact Paynet order is checked,
 * so a late payment of an earlier attempt is found too.
 */
export async function syncPaynetOrderByPaynetOrder(
  paynetOrder: number,
  deps: PaynetSyncDeps = {},
): Promise<{ result: PaynetSyncResult; publicToken: string | null; orderId: string | null }> {
  const cfg = deps.config === undefined ? paynetConfig() : deps.config;
  const parsed = cfg ? parsePaynetOrderNumber(paynetOrder, cfg.orderBase) : null;
  if (!cfg || !parsed) return { result: "not_found", publicToken: null, orderId: null };
  const o = await prisma.order.findUnique({ where: { orderNumber: parsed.orderNumber }, select: ORDER_SELECT });
  if (!o) return { result: "not_found", publicToken: null, orderId: null };
  const result = await syncRow(o, paynetOrder, { ...deps, config: cfg });
  return { result, publicToken: o.publicToken, orderId: o.id };
}

/** Paynet said FAIL: `failed` unless paid (the customer can still pay again from the order page). */
export async function markPaynetOrderFailed(orderId: string): Promise<boolean> {
  const r = await prisma.order.updateMany({
    where: { id: orderId, source: "shop", paymentProvider: "paynet", isPaid: false, paymentStatus: { in: ["pending", "unpaid"] } },
    data: { paymentStatus: "failed" },
  });
  return r.count === 1;
}

/** Pending Paynet storefront orders created since `since` (reconcile cron). */
export async function pendingPaynetOrderIds(since: Date, limit = 200): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: {
      source: "shop",
      deletedAt: null,
      paymentProvider: "paynet",
      isPaid: false,
      paymentStatus: { in: ["pending", "failed"] },
      paymentRef: { startsWith: "paynet:" },
      createdAt: { gte: since },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => r.id);
}
