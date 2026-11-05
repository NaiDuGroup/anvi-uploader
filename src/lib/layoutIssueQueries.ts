import { prisma } from "@/lib/prisma";
import { UNPAID_SHOP_ORDER_WHERE } from "@/lib/shop/orderFlags";

/**
 * Who must fix a «Нужен макет» line, and how many (step 3,
 * `src/lib/layoutIssue.ts`): the studio alert (banner, nav badge) and the
 * cabinet alert (banner on every page, menu badge).
 */

export interface LayoutIssueOrderRef {
  id: string;
  orderNumber: number;
  /** Flagged lines in the order. */
  lineCount: number;
  /** Oldest flag in the order (ISO). */
  since: string | null;
}

/** Orders with a flagged line, oldest flag first (live orders only). */
async function layoutIssueOrders(where: Record<string, unknown>): Promise<LayoutIssueOrderRef[]> {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      orderLines: { some: { productionStatus: "NEEDS_LAYOUT" } },
      ...where,
    },
    select: {
      id: true,
      orderNumber: true,
      orderLines: {
        where: { productionStatus: "NEEDS_LAYOUT" },
        select: { layoutIssueAt: true },
      },
    },
    take: 200,
  });
  return orders
    .map((o) => {
      const times = o.orderLines
        .map((l) => l.layoutIssueAt?.getTime())
        .filter((t): t is number => typeof t === "number");
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        lineCount: o.orderLines.length,
        since: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
      };
    })
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.orderNumber - b.orderNumber);
}

/** The cabinet owner's orders waiting for their new layout. */
export function cabinetLayoutIssueOrders(studioCustomerId: string): Promise<LayoutIssueOrderRef[]> {
  return layoutIssueOrders({ clientId: studioCustomerId, NOT: UNPAID_SHOP_ORDER_WHERE });
}

/** Every live order with a flagged line (studio banner / nav badge; staff see all orders). */
export function staffLayoutIssueOrders(): Promise<LayoutIssueOrderRef[]> {
  return layoutIssueOrders({});
}
