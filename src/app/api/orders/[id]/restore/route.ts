import { sidesMultiplier } from "@/lib/businessCard/businessCardConstants";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { consumeMugLineStock, returnMugStockForOrder } from "@/lib/mug/mugOrderStock";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import {
  consumeNotebookLineStock,
  returnNotebookStockForOrder,
} from "@/lib/notebook/notebookOrderStock";
import { penOrderStockQuantityFromFiles } from "@/lib/pen/penOrderStockQuantity";
import { consumePenLineStock, returnPenStockForOrder } from "@/lib/pen/penOrderStock";
import {
  procurementMetaToJson,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import {
  consumePrinterUse,
  returnPrinterConsumablesForOrder,
} from "@/lib/stock/unified/printers";
import {
  returnMaterialStockForOrder,
  takeMaterialLineStock,
} from "@/lib/stock/unified/materialOrderStock";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import { parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { deductDtfLineStock } from "@/lib/dtf/dtfOrderStock";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { deductUvLineStock, returnUvStockForOrder } from "@/lib/uv/uvOrderStock";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import {
  consumeMugPrintStock,
  deductSublimationLineStock,
  returnSublimationStockForOrder,
} from "@/lib/sublimation/sublimationOrderStock";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";

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

      // Printer consumables are taken afresh below; settle anything the order
      // still holds first (e.g. ink of an old order deleted while it waited
      // for procurement) so it is never held twice.
      await returnPrinterConsumablesForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      // Same for rolls / paper and mugs / pens / notebooks: never hold them twice.
      await returnMaterialStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      await returnMugStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      await returnPenStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      await returnNotebookStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      await returnUvStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });
      await returnSublimationStockForOrder(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdById: user.id,
      });

      for (const line of order.orderLines) {
        // Printed mugs take Epson paper / tape / ink by the current `mugs` norm.
        if (line.productType === "mug") {
          await consumeMugPrintStock(tx, {
            quantity: mugOrderStockQuantityFromFiles(line.files),
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
        }
        if (line.productType === "mug" && line.stockVariantId) {
          const variantId: string = line.stockVariantId;
          const issue = await consumeMugLineStock(tx, {
            variantId,
            quantity: mugOrderStockQuantityFromFiles(line.files),
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
            snapshot: line.mugProductSnapshot,
          });
          if (issue) {
            procurementIssues.push(issue);
          }
        } else if (line.productType === "notebook" && line.stockVariantId) {
          const variantId: string = line.stockVariantId;
          const issue = await consumeNotebookLineStock(tx, {
            variantId,
            quantity: notebookOrderStockQuantityFromFiles(line.files),
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
            snapshot: line.notebookProductSnapshot,
          });
          if (issue) {
            procurementIssues.push(issue);
          }
        } else if (line.productType === "pen" && line.stockVariantId) {
          const variantId: string = line.stockVariantId;
          const issue = await consumePenLineStock(tx, {
            variantId,
            quantity: penOrderStockQuantityFromFiles(line.files),
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
            snapshot: line.penProductSnapshot,
          });
          if (issue) {
            procurementIssues.push(issue);
          }
        } else if (line.productType === "large_format_print" && line.largeFormatMaterialId) {
          const lf = parseLargeFormatLineData(line.largeFormatLineData);
          const lm = lf?.calculatedLinearMeters ?? 0;
          const inkMl = lf?.inkMlUsed ?? 0;
          const matId = line.largeFormatMaterialId;

          // Roll metres from the roll's unified variant; short → `lf_roll` entry.
          const rollIssue = await takeMaterialLineStock(tx, {
            kind: "roll",
            materialId: matId,
            quantity: lm,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
          if (rollIssue) {
            procurementIssues.push(rollIssue);
          }
          // Ink never blocks the order (the colours may go below zero).
          await consumePrinterUse(tx, {
            printerCode: PrinterCode.LargeFormat,
            role: PrinterSlotRole.Ink,
            amount: inkMl,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
        } else if (line.productType === "dtf_apparel") {
          const dtf = parseDtfLineData(line.dtfLineData);
          if (!dtf) {
            continue;
          }
          const issues = await deductDtfLineStock(tx, dtf, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
          procurementIssues.push(...issues);
        } else if (line.productType === "sublimation_print") {
          const subl = parseSublimationLineData(line.sublimationLineData);
          if (!subl) {
            continue;
          }
          const issues = await deductSublimationLineStock(tx, subl, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
          procurementIssues.push(...issues);
        } else if (line.productType === "uv_print") {
          const uv = parseUvLineData(line.uvLineData);
          if (!uv) {
            continue;
          }
          const issues = await deductUvLineStock(tx, uv, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
          procurementIssues.push(...issues);
        } else if (isSheetProductType(line.productType) && line.sheetPaperId) {
          const bc = parseBusinessCardLineData(line.businessCardLineData);
          const sheets = bc?.sheetsUsed ?? 0;
          if (sheets <= 0) {
            continue;
          }
          // Paper sheets from the paper's unified variant; short → `sheet_paper` entry.
          const paperIssue = await takeMaterialLineStock(tx, {
            kind: "sheet",
            materialId: line.sheetPaperId,
            quantity: sheets,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
          if (paperIssue) {
            procurementIssues.push(paperIssue);
          }
          await consumePrinterUse(tx, {
            printerCode: PrinterCode.Ricoh,
            role: PrinterSlotRole.Toner,
            // Toner per printed side: the cartridge yield is quoted per page.
            amount: sheets * (bc ? sidesMultiplier(bc.sides) : 1),
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            createdById: user.id,
          });
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
