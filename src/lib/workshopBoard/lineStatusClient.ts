import type { SettableLineStatus } from "@/lib/orderStatusFromLines";

/**
 * Browser helpers for the per-line production status on the workshop board
 * (step 2). Lines are addressed by `orderId` + `orderLineId`; the server
 * re-derives each order's status from its lines.
 */

/** Board key of a line: unique across orders (legacy single-line orders all use `orderLineId = "legacy"`). */
export function boardLineKey(orderId: string, orderLineId: string): string {
  return `${orderId}::${orderLineId}`;
}

/** Legacy order without `OrderLine` rows: only the order-level status can be changed. */
export function isLegacyBoardLine(orderLineId: string): boolean {
  return orderLineId === "legacy";
}

export interface LineStatusRequestItem {
  orderId: string;
  lineIds: string[];
}

/**
 * Group lines by order, in first-appearance order, without duplicates. Legacy
 * lines are returned separately (their order has no line to set).
 */
export function groupLinesByOrder(
  lines: readonly { orderId: string; orderLineId: string }[],
): { items: LineStatusRequestItem[]; legacyOrderIds: string[] } {
  const byOrder = new Map<string, string[]>();
  const legacy: string[] = [];
  for (const l of lines) {
    if (isLegacyBoardLine(l.orderLineId)) {
      if (!legacy.includes(l.orderId)) legacy.push(l.orderId);
      continue;
    }
    const list = byOrder.get(l.orderId);
    if (!list) byOrder.set(l.orderId, [l.orderLineId]);
    else if (!list.includes(l.orderLineId)) list.push(l.orderLineId);
  }
  return {
    items: [...byOrder.entries()].map(([orderId, lineIds]) => ({ orderId, lineIds })),
    legacyOrderIds: legacy,
  };
}

/** `PATCH /api/orders/[id]/lines/status` for one order; throws on a non-2xx answer. */
export async function patchOrderLineStatus(
  orderId: string,
  lineIds: readonly string[],
  status: SettableLineStatus,
): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/lines/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lineIds, status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** `PATCH /api/workshop-board/line-status`: several orders in one transaction; throws on a non-2xx answer. */
export async function patchBoardLineStatus(
  items: readonly LineStatusRequestItem[],
  status: SettableLineStatus,
): Promise<void> {
  const res = await fetch(`/api/workshop-board/line-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Mark the given lines PRINTING after a batch (mug sheets / notebook grids)
 * went to print: one call per order, so a failure stays isolated. Legacy
 * orders get the order-level `WORKSHOP_PRINTING` as before. Returns the
 * number of orders updated and failed.
 */
export async function markLinesPrinting(
  lines: readonly { orderId: string; orderLineId: string }[],
  onEach?: (done: number, total: number) => void,
): Promise<{ updated: number; failed: number }> {
  const { items, legacyOrderIds } = groupLinesByOrder(lines);
  const total = items.length + legacyOrderIds.length;
  let done = 0;
  const tick = () => {
    done += 1;
    onEach?.(done, total);
  };
  const settlements = await Promise.allSettled([
    ...items.map(async (it) => {
      try {
        await patchOrderLineStatus(it.orderId, it.lineIds, "PRINTING");
      } finally {
        tick();
      }
    }),
    ...legacyOrderIds.map(async (orderId) => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "WORKSHOP_PRINTING" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } finally {
        tick();
      }
    }),
  ]);
  let updated = 0;
  let failed = 0;
  for (const s of settlements) {
    if (s.status === "fulfilled") updated += 1;
    else failed += 1;
  }
  return { updated, failed };
}
