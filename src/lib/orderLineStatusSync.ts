import type { Prisma } from "@prisma/client";
import {
  lineStatusForOrderStatus,
  orderStatusKeepsLineStatuses,
  type LineProductionStatus,
} from "@/lib/orderLineProductionStatus";

/**
 * Keeps `OrderLine.productionStatus` in sync with `Order.status` (step 1 of
 * the per-line production status; see `src/lib/orderLineProductionStatus.ts`).
 *
 * Every write of `Order.status` goes through one of these:
 * - {@link orderLinesStatusSyncWrite}: nested write merged into the same
 *   `order.update({ data })` (Prisma runs it in one transaction). There is no
 *   bulk `order.updateMany` of `status` today; a new one must sync its lines
 *   in the same transaction too;
 * - {@link newLineProductionFields}: lines created on an existing order.
 *
 * An order going to ISSUE leaves its lines as they are.
 */

/** `productionStatus` of a line created on an order whose status is `orderStatus`. */
export function newLineProductionFields(orderStatus: string): { productionStatus: LineProductionStatus } {
  return { productionStatus: lineStatusForOrderStatus(orderStatus) };
}

export interface OrderLinesStatusSyncWrite {
  orderLines?: {
    updateMany: {
      where: Prisma.OrderLineScalarWhereInput;
      data: Prisma.OrderLineUncheckedUpdateManyWithoutOrderInput;
    };
  };
}

/**
 * Nested `orderLines` write to spread into an `order.update({ data })` that
 * may set `status`. Empty when no status is written (`undefined`), or the
 * order goes to ISSUE. Only lines whose status actually changes get a new
 * `productionStatusAt`.
 */
export function orderLinesStatusSyncWrite(
  newOrderStatus: unknown,
  at: Date = new Date(),
): OrderLinesStatusSyncWrite {
  if (typeof newOrderStatus !== "string" || orderStatusKeepsLineStatuses(newOrderStatus)) return {};
  const productionStatus = lineStatusForOrderStatus(newOrderStatus);
  return {
    orderLines: {
      updateMany: {
        where: { productionStatus: { not: productionStatus } },
        data: { productionStatus, productionStatusAt: at },
      },
    },
  };
}
