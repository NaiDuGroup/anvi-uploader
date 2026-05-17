import { Prisma } from "@prisma/client";
import { tryRecordMugStockSale } from "@/lib/mug/mugStockLedger";
import { tryRecordNotebookStockSale } from "@/lib/notebook/notebookStockLedger";
import {
  lfRollLinearMetersForMaterial,
  largeFormatTotalInkMl,
  mugOrderStockQtyForProduct,
  notebookOrderStockQtyForProduct,
} from "@/lib/orderLineStock";
import {
  procurementMetaToJson,
  procurementMetaToList,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import {
  tryDeductLfRollStock,
  tryDeductInkMl,
} from "@/lib/largeFormat/lfRollStockLedger";
import {
  DEFAULT_PRINT_PROCESS,
  parsePrintProcess,
  type PrintProcess,
} from "@/lib/printProcess";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";

type TransactionClient = Prisma.TransactionClient;

type LfAuditLineRow = {
  id: string;
  productType: string;
  largeFormatMaterialId: string | null;
  largeFormatLineData: unknown;
};

function backlogRollLineRow(
  order: { orderLines: LfAuditLineRow[] },
  materialId: string,
): LfAuditLineRow | undefined {
  return order.orderLines.find(
    (l) =>
      l.productType === "large_format_print" &&
      l.largeFormatMaterialId === materialId,
  );
}

function backlogInkSnapshot(order: { orderLines: LfAuditLineRow[] }): {
  inkCostMdl?: number;
  inkSellPriceMdl?: number;
  orderLineId?: string;
} {
  let inkCostMdlSum = 0;
  let inkSellSum = 0;
  let orderLineId: string | undefined;
  for (const l of order.orderLines) {
    if (l.productType !== "large_format_print") continue;
    const d = parseLargeFormatLineData(l.largeFormatLineData);
    if (
      !d ||
      typeof d.inkMlUsed !== "number" ||
      !(d.inkMlUsed > 0)
    ) {
      continue;
    }
    orderLineId ??= l.id;
    if (
      typeof d.inkCostMdl === "number" &&
      Number.isFinite(d.inkCostMdl)
    ) {
      inkCostMdlSum += Math.round(d.inkCostMdl);
    }
    if (
      typeof d.inkSellPriceMdl === "number" &&
      Number.isFinite(d.inkSellPriceMdl)
    ) {
      inkSellSum += Math.round(d.inkSellPriceMdl);
    }
  }
  return {
    ...(inkCostMdlSum > 0 ? { inkCostMdl: inkCostMdlSum } : {}),
    ...(inkSellSum > 0 ? { inkSellPriceMdl: inkSellSum } : {}),
    ...(orderLineId !== undefined ? { orderLineId } : {}),
  };
}

/**
 * After stock receipt, try to reserve catalog qty for open backorders (FIFO by createdAt).
 * Stops at the first order that still cannot be fully deducted (older orders block the queue).
 */
export async function allocateMugProcurementBacklog(
  tx: TransactionClient,
  params: { mugProductId: string; createdById: string | null },
): Promise<void> {
  const { mugProductId, createdById } = params;

  const orders = await tx.order.findMany({
    where: {
      needsProcurement: true,
      deletedAt: null,
      OR: [
        { productType: "mug", mugProductId },
        {
          orderLines: {
            some: { productType: "mug", mugProductId },
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      files: true,
      orderLines: { include: { files: true } },
    },
  });

  for (const order of orders) {
    const qty = mugOrderStockQtyForProduct(order, mugProductId);
    if (qty <= 0) {
      continue;
    }

    const res = await tryRecordMugStockSale(tx, {
      mugProductId,
      quantity: qty,
      orderId: order.id,
      orderNumber: order.orderNumber,
      createdById,
    });

    if (!res.deducted) {
      break;
    }

    const metaList = procurementMetaToList(order.procurementMeta);
    const filtered = metaList.filter(
      (m) => !(m.kind === "mug" && m.productId === mugProductId),
    );
    if (filtered.length === 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: false,
          procurementMeta: Prisma.JsonNull,
        },
      });
    } else {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: true,
          procurementMeta: procurementMetaToJson(
            filtered.length === 1 ? filtered[0]! : filtered,
          ),
        },
      });
    }
  }
}

export async function allocateNotebookProcurementBacklog(
  tx: TransactionClient,
  params: { notebookProductId: string; createdById: string | null },
): Promise<void> {
  const { notebookProductId, createdById } = params;

  const orders = await tx.order.findMany({
    where: {
      needsProcurement: true,
      deletedAt: null,
      OR: [
        { productType: "notebook", notebookProductId },
        {
          orderLines: {
            some: { productType: "notebook", notebookProductId },
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      files: true,
      orderLines: { include: { files: true } },
    },
  });

  for (const order of orders) {
    const qty = notebookOrderStockQtyForProduct(order, notebookProductId);
    if (qty <= 0) {
      continue;
    }

    const res = await tryRecordNotebookStockSale(tx, {
      notebookProductId,
      quantity: qty,
      orderId: order.id,
      orderNumber: order.orderNumber,
      createdById,
    });

    if (!res.deducted) {
      break;
    }

    const metaList = procurementMetaToList(order.procurementMeta);
    const filtered = metaList.filter(
      (m) =>
        !(m.kind === "notebook" && m.productId === notebookProductId),
    );
    if (filtered.length === 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: false,
          procurementMeta: Prisma.JsonNull,
        },
      });
    } else {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: true,
          procurementMeta: procurementMetaToJson(
            filtered.length === 1 ? filtered[0]! : filtered,
          ),
        },
      });
    }
  }
}

/** After roll stock receipt, try to fulfill backlog orders blocked on this material. */
export async function allocateLfRollProcurementBacklog(
  tx: TransactionClient,
  params: { materialId: string },
): Promise<void> {
  const { materialId } = params;

  const orders = await tx.order.findMany({
    where: {
      needsProcurement: true,
      deletedAt: null,
      orderLines: {
        some: {
          productType: "large_format_print",
          largeFormatMaterialId: materialId,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    include: { orderLines: true },
  });

  for (const order of orders) {
    const lm = lfRollLinearMetersForMaterial(order, materialId);
    if (lm <= 0) {
      continue;
    }

    const line = backlogRollLineRow(order, materialId);
    const lf = line ? parseLargeFormatLineData(line.largeFormatLineData) : null;

    const res = await tryDeductLfRollStock(tx, materialId, lm, {
      kind: LF_ROLL_STOCK_KIND.PROCUREMENT_BACKLOG,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderLineId: line?.id,
      materialCostMdl:
        lf && Number.isFinite(lf.materialCost) ? Math.round(lf.materialCost) : null,
      materialSellPriceMdl:
        lf && Number.isFinite(lf.materialSellPrice)
          ? Math.round(lf.materialSellPrice)
          : null,
      createdById: null,
    });
    if (!res.ok) {
      break;
    }

    const metaList = procurementMetaToList(order.procurementMeta);
    const filtered = metaList.filter(
      (m) => !(m.kind === "lf_roll" && m.materialId === materialId),
    );
    if (filtered.length === 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: false,
          procurementMeta: Prisma.JsonNull,
        },
      });
    } else {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: true,
          procurementMeta: procurementMetaToJson(
            filtered.length === 1 ? filtered[0]! : filtered,
          ),
        },
      });
    }
  }
}

function removeInkEntriesForProcess(
  list: OrderProcurementMetaItem[],
  p: PrintProcess,
): OrderProcurementMetaItem[] {
  return list.filter(
    (m) =>
      !(
        m.kind === "ink" &&
        parsePrintProcess(
          m.kind === "ink" ? m.printProcess : undefined,
        ) === p
      ),
  );
}

function inkMetaMatchesProcess(
  m: OrderProcurementMetaItem,
  p: PrintProcess,
): boolean {
  return (
    m.kind === "ink" &&
    parsePrintProcess(
      m.kind === "ink" ? m.printProcess : undefined,
    ) === p
  );
}

/**
 * After ink receipt for `replenishedProcess`, try orders waiting on that ink tank.
 * Today only wide-format roll lines (`large_format_roll`) deduct ml from stock; backlog resolution uses LF line JSON.
 */
export async function allocateInkProcurementBacklog(
  tx: TransactionClient,
  replenishedProcess: PrintProcess,
): Promise<void> {
  if (replenishedProcess !== DEFAULT_PRINT_PROCESS) {
    return;
  }

  const orders = await tx.order.findMany({
    where: { needsProcurement: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { orderLines: true },
  });

  for (const order of orders) {
    const metaList = procurementMetaToList(order.procurementMeta);
    if (!metaList.some((m) => inkMetaMatchesProcess(m, replenishedProcess))) {
      continue;
    }

    const inkNeed = largeFormatTotalInkMl(order);
    if (!(inkNeed > 0)) {
      const filtered = removeInkEntriesForProcess(metaList, replenishedProcess);
      if (filtered.length === 0) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            needsProcurement: false,
            procurementMeta: Prisma.JsonNull,
          },
        });
      } else {
        await tx.order.update({
          where: { id: order.id },
          data: {
            needsProcurement: true,
            procurementMeta: procurementMetaToJson(
              filtered.length === 1 ? filtered[0]! : filtered,
            ),
          },
        });
      }
      continue;
    }

    const snap = backlogInkSnapshot(order);

    const res = await tryDeductInkMl(tx, inkNeed, replenishedProcess, {
      kind: INK_STOCK_KIND.PROCUREMENT_BACKLOG,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderLineId: snap.orderLineId,
      inkCostMdl: snap.inkCostMdl,
      inkSellPriceMdl: snap.inkSellPriceMdl,
      createdById: null,
    });
    if (!res.ok) {
      break;
    }

    const filtered = removeInkEntriesForProcess(metaList, replenishedProcess);
    if (filtered.length === 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: false,
          procurementMeta: Prisma.JsonNull,
        },
      });
    } else {
      await tx.order.update({
        where: { id: order.id },
        data: {
          needsProcurement: true,
          procurementMeta: procurementMetaToJson(
            filtered.length === 1 ? filtered[0]! : filtered,
          ),
        },
      });
    }
  }
}
