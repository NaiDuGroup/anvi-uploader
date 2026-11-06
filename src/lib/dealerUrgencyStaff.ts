import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { DEALER_FINISHED_STATUSES } from "@/lib/dealerOrderModify";
import {
  chargedUrgencyFeeMdl,
  DEALER_URGENCY_OFF_COLUMNS,
  priceWithoutUrgencyFee,
  toFeeMdl,
  URGENCY_LOG_ACTIONS,
} from "@/lib/dealerUrgency";

/**
 * Staff side of the dealer «Срочно» fee: waive it (fee → 0, taken off the
 * price) and the money part of a staff 🔥 removal. Both lock the order row
 * (`SELECT … FOR UPDATE`) so they never race a dealer edit of the same order.
 */

interface LockedUrgencyRow {
  id: string;
  status: string;
  price: Prisma.Decimal | null;
  is_paid: boolean;
  is_prio: boolean;
  deleted_at: Date | null;
  urgency_fee: Prisma.Decimal | null;
  urgency_by_dealer_at: Date | null;
}

async function lockUrgencyRow(tx: Prisma.TransactionClient, orderId: string): Promise<LockedUrgencyRow | null> {
  const rows = await tx.$queryRaw<LockedUrgencyRow[]>`
    SELECT id, status, price, is_paid, is_prio, deleted_at, urgency_fee, urgency_by_dealer_at
    FROM orders
    WHERE id = ${orderId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export type WaiveUrgencyErrorCode = "not_found" | "no_dealer_fee" | "paid";

export class WaiveUrgencyError extends Error {
  constructor(readonly code: WaiveUrgencyErrorCode) {
    super(code);
    this.name = "WaiveUrgencyError";
  }
}

/**
 * «Снять доплату»: the dealer's urgency stays (order still 🔥, still marked as
 * the dealer's request) but the fee becomes 0 and leaves the price / debt.
 * Refused on a paid order (the money is already taken) and when there is no
 * dealer fee to waive.
 */
export async function waiveDealerUrgencyFee(params: {
  orderId: string;
  userId: string;
}): Promise<{ price: number | null; waivedFeeMdl: number }> {
  return prisma.$transaction(async (tx) => {
    const row = await lockUrgencyRow(tx, params.orderId);
    if (!row || row.deleted_at) throw new WaiveUrgencyError("not_found");
    const fee = toFeeMdl(row.urgency_fee) ?? 0;
    if (!row.urgency_by_dealer_at || fee <= 0) throw new WaiveUrgencyError("no_dealer_fee");
    if (row.is_paid) throw new WaiveUrgencyError("paid");
    const oldPrice = row.price == null ? null : Number(row.price.toString());
    const nextPrice = priceWithoutUrgencyFee(oldPrice, fee);
    const now = new Date();
    await tx.order.update({
      where: { id: params.orderId },
      data: {
        price: toOrderPriceDecimal(nextPrice),
        urgencyFee: 0,
        urgencyFeeWaivedAt: now,
        urgencyFeeWaivedById: params.userId,
      },
    });
    await tx.orderLog.create({
      data: {
        orderId: params.orderId,
        userId: params.userId,
        action: URGENCY_LOG_ACTIONS.feeWaived,
        field: "price",
        oldValue: oldPrice == null ? null : String(oldPrice),
        newValue: nextPrice == null ? null : String(nextPrice),
        metadata: { feeMdl: fee },
      },
    });
    return { price: nextPrice, waivedFeeMdl: fee };
  });
}

/**
 * Staff turned 🔥 off (explicitly, not the automatic reset on «Выдан») on an
 * order whose urgency the dealer asked for: no urgency, no fee — but only
 * while the order is unpaid and not finished (made / handed over orders keep
 * the fee they were charged; then only `isPrio` goes off). Returns the extra
 * columns and the log row for the same write, or null when nothing changes.
 * A price typed in the same save is stored as typed (the fee is gone).
 */
export async function planStaffUrgencyOffInTx(
  tx: Prisma.TransactionClient,
  params: { orderId: string; userId: string; priceSetInSameSave: boolean },
): Promise<{ data: Prisma.OrderUncheckedUpdateInput; log: Prisma.OrderLogCreateManyInput } | null> {
  const row = await lockUrgencyRow(tx, params.orderId);
  if (!row || !row.urgency_by_dealer_at || row.is_paid) return null;
  if ((DEALER_FINISHED_STATUSES as readonly string[]).includes(row.status)) return null;
  const fee = toFeeMdl(row.urgency_fee) ?? 0;
  const oldPrice = row.price == null ? null : Number(row.price.toString());
  const nextPrice = params.priceSetInSameSave ? oldPrice : priceWithoutUrgencyFee(oldPrice, fee);
  return {
    data: {
      ...DEALER_URGENCY_OFF_COLUMNS,
      ...(params.priceSetInSameSave ? {} : { price: toOrderPriceDecimal(nextPrice) }),
    },
    log: {
      orderId: params.orderId,
      userId: params.userId,
      action: URGENCY_LOG_ACTIONS.staffOff,
      field: "price",
      oldValue: oldPrice == null ? null : String(oldPrice),
      newValue: nextPrice == null ? null : String(nextPrice),
      metadata: { feeMdl: fee, priceKept: params.priceSetInSameSave },
    },
  };
}

/**
 * The dealer urgency fee still charged on the order, read under the row lock
 * (so a concurrent waive / dealer edit cannot slip between). Staff price
 * writes add it: the staff price is the goods price ({@link chargedUrgencyFeeMdl}).
 */
export async function lockChargedUrgencyFeeInTx(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const row = await lockUrgencyRow(tx, orderId);
  if (!row) return 0;
  return chargedUrgencyFeeMdl({ urgencyByDealerAt: row.urgency_by_dealer_at, urgencyFee: row.urgency_fee });
}
