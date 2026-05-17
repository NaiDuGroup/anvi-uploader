import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { tryRecordMugStockSale } from "@/lib/mug/mugStockLedger";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { tryRecordNotebookStockSale } from "@/lib/notebook/notebookStockLedger";
import {
  procurementMetaToJson,
  skuFromMugSnapshot,
  skuFromNotebookSnapshot,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import {
  restoreLfRollStock,
  tryDeductInkMl,
  tryDeductLfRollStock,
} from "@/lib/largeFormat/lfRollStockLedger";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderLines: {
          include: { files: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!order.deletedAt) {
      return NextResponse.json({ error: "Order is not in trash" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { deletedAt: null },
      });

      const procurementIssues: OrderProcurementMetaItem[] = [];

      for (const line of order.orderLines) {
        if (line.productType === "mug" && line.mugProductId) {
          const qty = mugOrderStockQuantityFromFiles(line.files);
          if (qty <= 0) {
            continue;
          }
          const mugRes = await tryRecordMugStockSale(tx, {
            mugProductId: line.mugProductId,
            quantity: qty,
            orderId: order.id,
            orderNumber: order.orderNumber,
            createdById: user.id,
          });
          if (!mugRes.deducted) {
            procurementIssues.push({
              kind: "mug",
              productId: mugRes.mugProductId,
              sku: skuFromMugSnapshot(line.mugProductSnapshot),
              requestedQty: mugRes.requested,
              stockAtOrder: mugRes.available,
            });
          }
        } else if (line.productType === "notebook" && line.notebookProductId) {
          const qty = notebookOrderStockQuantityFromFiles(line.files);
          if (qty <= 0) {
            continue;
          }
          const nbRes = await tryRecordNotebookStockSale(tx, {
            notebookProductId: line.notebookProductId,
            quantity: qty,
            orderId: order.id,
            orderNumber: order.orderNumber,
            createdById: user.id,
          });
          if (!nbRes.deducted) {
            procurementIssues.push({
              kind: "notebook",
              productId: nbRes.notebookProductId,
              sku: skuFromNotebookSnapshot(line.notebookProductSnapshot),
              requestedQty: nbRes.requested,
              stockAtOrder: nbRes.available,
            });
          }
        } else if (line.productType === "large_format_print" && line.largeFormatMaterialId) {
          const lf = parseLargeFormatLineData(line.largeFormatLineData);
          const lm = lf?.calculatedLinearMeters ?? 0;
          const inkMl = lf?.inkMlUsed ?? 0;
          const matId = line.largeFormatMaterialId;

          let rollDeducted = false;
          if (lm > 0) {
            const rollRes = await tryDeductLfRollStock(tx, matId, lm, {
              kind: LF_ROLL_STOCK_KIND.ORDER_SALE,
              orderId: order.id,
              orderNumber: order.orderNumber,
              orderLineId: line.id,
              materialCostMdl: lf && Number.isFinite(lf.materialCost)
                ? Math.round(lf.materialCost)
                : null,
              materialSellPriceMdl:
                lf && Number.isFinite(lf.materialSellPrice)
                  ? Math.round(lf.materialSellPrice)
                  : null,
              createdById: user.id,
            });
            if (!rollRes.ok) {
              procurementIssues.push({
                kind: "lf_roll",
                materialId: matId,
                requestedLinearMeters: rollRes.requested,
                stockAtOrder: rollRes.available,
              });
            } else {
              rollDeducted = true;
            }
          }
          if (inkMl > 0) {
            const inkRes = await tryDeductInkMl(tx, inkMl, DEFAULT_PRINT_PROCESS, {
              kind: INK_STOCK_KIND.ORDER_SALE,
              orderId: order.id,
              orderNumber: order.orderNumber,
              orderLineId: line.id,
              inkCostMdl:
                lf && lf.inkCostMdl != null && Number.isFinite(lf.inkCostMdl)
                  ? Math.round(lf.inkCostMdl)
                  : null,
              inkSellPriceMdl:
                lf &&
                lf.inkSellPriceMdl != null &&
                Number.isFinite(lf.inkSellPriceMdl)
                  ? Math.round(lf.inkSellPriceMdl)
                  : null,
              createdById: user.id,
            });
            if (!inkRes.ok) {
              procurementIssues.push({
                kind: "ink",
                printProcess: DEFAULT_PRINT_PROCESS,
                requestedMl: inkRes.requested,
                stockAtOrder: inkRes.available,
              });
              if (rollDeducted && lm > 0) {
                await restoreLfRollStock(tx, matId, lm);
              }
            }
          }
        }
      }

      const needsProcurement = procurementIssues.length > 0;
      const procurementMeta =
        procurementIssues.length === 0
          ? undefined
          : procurementIssues.length === 1
            ? procurementMetaToJson(procurementIssues[0]!)
            : procurementMetaToJson(procurementIssues);

      if (needsProcurement && procurementMeta) {
        await tx.order.update({
          where: { id },
          data: {
            needsProcurement: true,
            procurementMeta,
          },
        });
      } else {
        await tx.order.update({
          where: { id },
          data: {
            needsProcurement: false,
            procurementMeta: Prisma.JsonNull,
          },
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: id,
          userId: user.id,
          action: "restored",
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to restore order:", error);
    return NextResponse.json(
      { error: "Failed to restore order" },
      { status: 500 },
    );
  }
}
