import { NextRequest, NextResponse } from "next/server";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validations";
import type { OrderStatus } from "@/lib/validations";
import { getSessionUser, getMaybeCustomerUser } from "@/lib/auth";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { normalizeOrderPageLimit } from "@/lib/orderPagination";
import { nanoid } from "nanoid";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { resolveMugProductForOrder } from "@/lib/mug/resolveMugProductForOrder";
import { mugProductToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { tryRecordMugStockSale } from "@/lib/mug/mugStockLedger";
import { resolveNotebookProductForOrder } from "@/lib/notebook/resolveNotebookProductForOrder";
import {
  notebookProductToSnapshot,
  otherNotebookProductSnapshot,
} from "@/lib/notebook/notebookProductSnapshot";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { tryRecordNotebookStockSale } from "@/lib/notebook/notebookStockLedger";
import { pickProductPrice } from "@/lib/pricing";
import {
  procurementMetaToJson,
  skuFromMugSnapshot,
  skuFromNotebookSnapshot,
} from "@/lib/orderProcurement";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import {
  serializeOrderWithPrice,
  toOrderPriceDecimal,
} from "@/lib/orderPriceDecimal";
import { round2 } from "@/lib/money";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  deductStockForAdminOrderLines,
  resolveAdminOrderLineProducts,
  resolveLargeFormatLine,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";
import type { AdminOrderLineInput, CabinetOrderLineInput } from "@/lib/validations";
import type {
  LargeFormatCustomerType,
  LargeFormatLineData,
} from "@/lib/largeFormat/types";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const handlerStartedAt = Date.now();

  const user = await getSessionUser();
  if (!user) {
    const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const totalMs = Date.now() - handlerStartedAt;
    unauthorized.headers.set("Server-Timing", `ordersHandler;dur=${totalMs.toFixed(1)}`);
    unauthorized.headers.set("X-Orders-Server-Time-Ms", totalMs.toFixed(1));
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusesParam = searchParams.get("statuses")?.trim() ?? "";

    const limitRaw = searchParams.get("limit");
    const fetchStartedAt = Date.now();
    const result = await fetchOrdersData(user, {
      page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
      limit: normalizeOrderPageLimit(
        limitRaw !== null ? parseInt(limitRaw, 10) : undefined,
      ),
      search: searchParams.get("search") ?? "",
      onlyMine: searchParams.get("onlyMine") === "true",
      hideDelivered: searchParams.get("hideDelivered") === "true",
      needsProcurementOnly: searchParams.get("needsProcurement") === "true",
      statuses: statusesParam ? statusesParam.split(",") as OrderStatus[] : [],
      dateFrom: searchParams.get("dateFrom") ?? "",
      dateTo: searchParams.get("dateTo") ?? "",
      includeWorkshop: searchParams.get("includeWorkshop") !== "false",
    });
    const fetchMs = Date.now() - fetchStartedAt;
    const totalMs = Date.now() - handlerStartedAt;
    const { _timings, ...resultBody } = result;
    const response = NextResponse.json(resultBody);
    const timingParts = [
      `fetchOrdersData;dur=${fetchMs.toFixed(1)}`,
      `ordersHandler;dur=${totalMs.toFixed(1)}`,
    ];
    if (_timings) {
      for (const [label, ms] of Object.entries(_timings)) {
        timingParts.push(`${label};dur=${ms.toFixed(1)}`);
      }
    }
    response.headers.set("Server-Timing", timingParts.join(","));
    response.headers.set("X-Orders-Server-Time-Ms", totalMs.toFixed(1));
    return response;
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    const totalMs = Date.now() - handlerStartedAt;
    const detail =
      error instanceof Error
        ? { message: error.message, name: error.name }
        : { message: String(error) };
    const failed = NextResponse.json(
      { error: "Failed to fetch orders", detail },
      { status: 500 },
    );
    failed.headers.set("Server-Timing", `ordersHandler;dur=${totalMs.toFixed(1)}`);
    failed.headers.set("X-Orders-Server-Time-Ms", totalMs.toFixed(1));
    return failed;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createOrderSchema.parse(body);

    const customer = await getMaybeCustomerUser();
    const isLoggedInCustomer = customer !== null;
    const isDealer = customer?.studioCustomer?.isDealer === true;

    let phone: string | undefined;
    let clientId: string | null | undefined;
    let clientName: string | null | undefined;

    if (customer && customer.studioCustomer) {
      const contact = orderContactFromStudioCustomer(customer.studioCustomer);
      if (!contact.phone || contact.phone.length < 8) {
        return NextResponse.json(
          { error: "Your portal account has no valid phone. Please contact the studio." },
          { status: 400 },
        );
      }
      phone = contact.phone;
      clientId = customer.studioCustomerId;
      clientName = contact.clientName;
    } else {
      if (!validated.phone) {
        return NextResponse.json(
          { error: "Phone number is required" },
          { status: 400 },
        );
      }
      phone = validated.phone;
      clientId = await findClientIdByOrderPhone(validated.phone);
      clientName = undefined;
    }

    if (validated.lines && validated.lines.length > 0) {
      // Multi-position orders are a cabinet feature: the session provides the
      // contact and the pricing tier, so anonymous callers are rejected.
      if (!customer || !customer.studioCustomer) {
        return NextResponse.json(
          { error: "Multi-position orders require login", code: "lines_require_login" },
          { status: 401 },
        );
      }
      return await createCabinetMultiLineOrder({
        lines: validated.lines,
        notes: validated.notes,
        customerId: customer.id,
        isDealer,
        phone: phone!,
        clientId: clientId ?? undefined,
        clientName: clientName ?? undefined,
      });
    }

    // Flat single-position body: schema guarantees `files` is present here.
    const flatFiles = validated.files!;

    const isMug = validated.productType === "mug";
    const isNotebook = validated.productType === "notebook";
    const isLargeFormat = validated.productType === "large_format_print";

    let mugExtras: {
      mugProductId: string | null;
      mugProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    let notebookExtras: {
      notebookProductId: string | null;
      notebookProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    let largeFormatExtras: {
      largeFormatMaterialId: string;
      largeFormatLineData: Prisma.InputJsonValue;
    } | undefined;

    /** Single resolved LF line, reused for both persistence and stock deduction. */
    let lfResolvedLine: ResolvedAdminOrderLine | undefined;

    let resolvedPrice: number | undefined;

    if (isLargeFormat) {
      // Large-format ordering from the public endpoint is logged-in only: the
      // tier (retail/dealer) and price are derived server-side from the session.
      if (!isLoggedInCustomer || !customer) {
        return NextResponse.json(
          { error: "Large format requires login", code: "large_format_requires_login" },
          { status: 400 },
        );
      }
      const customerType: LargeFormatCustomerType = isDealer ? "dealer" : "retail";
      try {
        const lf = await resolveLargeFormatLine({
          largeFormatMaterialId: validated.largeFormatMaterialId!,
          printWidthCm: validated.printWidthCm!,
          printHeightCm: validated.printHeightCm!,
          quantity: validated.quantity!,
          customerType,
          lfSizePresetId: validated.lfSizePresetId ?? null,
        });
        largeFormatExtras = {
          largeFormatMaterialId: lf.largeFormatMaterialId,
          largeFormatLineData: lf.largeFormatLineData as unknown as Prisma.InputJsonValue,
        };
        lfResolvedLine = {
          input: {
            productType: "large_format_print",
            largeFormatMaterialId: validated.largeFormatMaterialId!,
            printWidthCm: validated.printWidthCm!,
            printHeightCm: validated.printHeightCm!,
            quantity: validated.quantity!,
            customerType,
            lfSizePresetId: validated.lfSizePresetId ?? null,
            files: flatFiles,
          },
          largeFormatExtras,
        };
        resolvedPrice = lf.totalSellPriceMdl;
      } catch (err) {
        if (err instanceof AdminOrderResolveError) {
          return NextResponse.json(
            { error: "Failed to price large format line", code: err.message },
            { status: 400 },
          );
        }
        throw err;
      }
    }

    if (isMug) {
      if (validated.mugOther) {
        mugExtras = {
          mugProductId: null,
          mugProductSnapshot: otherMugProductSnapshot() as unknown as Prisma.InputJsonValue,
        };
      } else {
        const p = await resolveMugProductForOrder(validated.mugProductId!);
        if (!p) {
          return NextResponse.json({ error: "Invalid mug product" }, { status: 400 });
        }
        mugExtras = {
          mugProductId: p.id,
          mugProductSnapshot: mugProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
        };
        const tier = pickProductPrice(
          {
            sellPrice: p.sellPrice == null ? null : Number(p.sellPrice.toString()),
            dealerPrice:
              p.dealerPrice == null ? null : Number(p.dealerPrice.toString()),
          },
          isDealer,
        );
        if (tier.displayPrice != null) {
          resolvedPrice = tier.displayPrice;
        }
      }
    }

    if (isNotebook) {
      if (validated.notebookOther) {
        notebookExtras = {
          notebookProductId: null,
          notebookProductSnapshot:
            otherNotebookProductSnapshot() as unknown as Prisma.InputJsonValue,
        };
      } else {
        const p = await resolveNotebookProductForOrder(validated.notebookProductId!);
        if (!p) {
          return NextResponse.json(
            { error: "Invalid notebook product" },
            { status: 400 },
          );
        }
        notebookExtras = {
          notebookProductId: p.id,
          notebookProductSnapshot:
            notebookProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
        };
        const tier = pickProductPrice(
          {
            sellPrice: p.sellPrice == null ? null : Number(p.sellPrice.toString()),
            dealerPrice:
              p.dealerPrice == null ? null : Number(p.dealerPrice.toString()),
          },
          isDealer,
        );
        if (tier.displayPrice != null) {
          resolvedPrice = tier.displayPrice;
        }
      }
    }

    const mugProductIdForStock =
      isMug && mugExtras && !validated.mugOther ? mugExtras.mugProductId : null;
    const mugStockQty =
      mugProductIdForStock != null
        ? mugOrderStockQuantityFromFiles(flatFiles)
        : 0;

    const notebookProductIdForStock =
      isNotebook && notebookExtras && !validated.notebookOther
        ? notebookExtras.notebookProductId
        : null;
    const notebookStockQty =
      notebookProductIdForStock != null
        ? notebookOrderStockQuantityFromFiles(flatFiles)
        : 0;

    if (typeof resolvedPrice === "number") {
      if (isMug && mugProductIdForStock != null) {
        resolvedPrice = round2(resolvedPrice * mugStockQty);
      } else if (isNotebook && notebookProductIdForStock != null) {
        resolvedPrice = round2(resolvedPrice * notebookStockQty);
      } else {
        resolvedPrice = round2(resolvedPrice);
      }
    }

    let orderStatusOverride: OrderStatus | undefined;
    let isWorkshopOverride: boolean | undefined;
    if (isLoggedInCustomer) {
      if (isDealer) {
        orderStatusOverride = "SENT_TO_WORKSHOP";
        isWorkshopOverride = true;
      } else {
        orderStatusOverride = "NEW";
        isWorkshopOverride = false;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          phone,
          notes: validated.notes,
          productType: validated.productType,
          mugLayoutData: isMug && validated.mugLayoutData
            ? (validated.mugLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          ...mugExtras,
          notebookLayoutData: isNotebook && validated.notebookLayoutData
            ? (validated.notebookLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          ...notebookExtras,
          ...(typeof resolvedPrice === "number"
            ? { price: toOrderPriceDecimal(resolvedPrice) ?? undefined }
            : {}),
          ...(orderStatusOverride ? { status: orderStatusOverride } : {}),
          ...(isWorkshopOverride !== undefined ? { isWorkshop: isWorkshopOverride } : {}),
          ...(clientName ? { clientName } : {}),
          ...(customer
            ? {
                createdBy: customer.id,
                ...(isDealer ? { sentToWorkshopBy: customer.id } : {}),
              }
            : {}),
          clientId: clientId ?? undefined,
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.orderLine.create({
        data: {
          orderId: o.id,
          sortOrder: 0,
          productType: validated.productType,
          ...(isMug
            ? {
                mugLayoutData: validated.mugLayoutData
                  ? (validated.mugLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
                  : undefined,
                mugProductId: mugExtras?.mugProductId ?? null,
                mugProductSnapshot: mugExtras?.mugProductSnapshot,
              }
            : {}),
          ...(isNotebook
            ? {
                notebookLayoutData: validated.notebookLayoutData
                  ? (validated.notebookLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
                  : undefined,
                notebookProductId: notebookExtras?.notebookProductId ?? null,
                notebookProductSnapshot: notebookExtras?.notebookProductSnapshot,
              }
            : {}),
          ...(isLargeFormat && largeFormatExtras
            ? {
                largeFormatMaterialId: largeFormatExtras.largeFormatMaterialId,
                largeFormatLineData: largeFormatExtras.largeFormatLineData,
              }
            : {}),
          files: {
            create: flatFiles.map((file) => ({
              orderId: o.id,
              fileName: file.fileName,
              fileUrl: file.fileUrl,
              copies: file.copies,
              color: file.color,
              paperType: file.paperType,
              pageCount: file.pageCount,
            })),
          },
        },
      });

      let needsProcurement = false;
      let procurementMeta: Prisma.InputJsonValue | undefined;

      if (mugProductIdForStock && mugStockQty > 0) {
        const mugRes = await tryRecordMugStockSale(tx, {
          mugProductId: mugProductIdForStock,
          quantity: mugStockQty,
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: customer?.id ?? null,
        });
        if (!mugRes.deducted) {
          needsProcurement = true;
          procurementMeta = procurementMetaToJson({
            kind: "mug",
            productId: mugRes.mugProductId,
            sku: skuFromMugSnapshot(mugExtras?.mugProductSnapshot),
            requestedQty: mugRes.requested,
            stockAtOrder: mugRes.available,
          });
        }
      } else if (notebookProductIdForStock && notebookStockQty > 0) {
        const nbRes = await tryRecordNotebookStockSale(tx, {
          notebookProductId: notebookProductIdForStock,
          quantity: notebookStockQty,
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: customer?.id ?? null,
        });
        if (!nbRes.deducted) {
          needsProcurement = true;
          procurementMeta = procurementMetaToJson({
            kind: "notebook",
            productId: nbRes.notebookProductId,
            sku: skuFromNotebookSnapshot(notebookExtras?.notebookProductSnapshot),
            requestedQty: nbRes.requested,
            stockAtOrder: nbRes.available,
          });
        }
      } else if (isLargeFormat && lfResolvedLine && customer) {
        // Reuse the admin roll + ink deduction pipeline. It reads the persisted
        // largeFormatLineData (linear meters, ink ml) and soft-fails into
        // procurement metadata when roll/ink stock is insufficient.
        const lfStock = await deductStockForAdminOrderLines(tx, {
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: customer.id,
          resolved: [lfResolvedLine],
        });
        needsProcurement = lfStock.needsProcurement;
        procurementMeta = lfStock.procurementMeta;
      }

      let out = await tx.order.findUniqueOrThrow({
        where: { id: o.id },
        include: {
          files: true,
          orderLines: {
            orderBy: { sortOrder: "asc" },
            include: { files: true },
          },
        },
      });

      if (needsProcurement && procurementMeta) {
        out = await tx.order.update({
          where: { id: o.id },
          data: {
            needsProcurement: true,
            procurementMeta,
          },
          include: {
            files: true,
            orderLines: {
              orderBy: { sortOrder: "asc" },
              include: { files: true },
            },
          },
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: out.id,
          userId: customer?.id ?? "client",
          action: "order_created",
        },
      });

      return out;
    }, HEAVY_TX_OPTIONS);

    return NextResponse.json(serializeOrderWithPrice(order), { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create order", detail },
      { status: 500 }
    );
  }
}

/**
 * Cabinet multi-position order: N `OrderLine`s in one order, resolved through
 * the shared admin pipeline. The retail/dealer tier is always derived from
 * the session (never accepted from the client). Auto-price is the sum of the
 * priceable lines (catalog mug/notebook SKUs × quantity, large format); when
 * any line has no catalog price (paper, "Other" SKU) the order price is left
 * unset for the studio to fill in.
 */
async function createCabinetMultiLineOrder(params: {
  lines: CabinetOrderLineInput[];
  notes: string | undefined;
  customerId: string;
  isDealer: boolean;
  phone: string;
  clientId: string | undefined;
  clientName: string | undefined;
}): Promise<NextResponse> {
  const customerType: LargeFormatCustomerType = params.isDealer ? "dealer" : "retail";

  const resolved: ResolvedAdminOrderLine[] = [];
  let priceSum = 0;
  let allLinesPriced = true;

  try {
    for (const line of params.lines) {
      const adminLine: AdminOrderLineInput = {
        ...line,
        customerType:
          line.productType === "large_format_print" ? customerType : undefined,
      };
      const r = await resolveAdminOrderLineProducts(adminLine);
      resolved.push(r);

      if (line.productType === "mug" && !line.mugOther && line.mugProductId) {
        const p = await resolveMugProductForOrder(line.mugProductId);
        const tier = p
          ? pickProductPrice(
              {
                sellPrice: p.sellPrice == null ? null : Number(p.sellPrice.toString()),
                dealerPrice:
                  p.dealerPrice == null ? null : Number(p.dealerPrice.toString()),
              },
              params.isDealer,
            )
          : null;
        const qty = mugOrderStockQuantityFromFiles(line.files);
        if (tier?.displayPrice != null && qty > 0) {
          priceSum += tier.displayPrice * qty;
        } else {
          allLinesPriced = false;
        }
      } else if (
        line.productType === "notebook" &&
        !line.notebookOther &&
        line.notebookProductId
      ) {
        const p = await resolveNotebookProductForOrder(line.notebookProductId);
        const tier = p
          ? pickProductPrice(
              {
                sellPrice: p.sellPrice == null ? null : Number(p.sellPrice.toString()),
                dealerPrice:
                  p.dealerPrice == null ? null : Number(p.dealerPrice.toString()),
              },
              params.isDealer,
            )
          : null;
        const qty = notebookOrderStockQuantityFromFiles(line.files);
        if (tier?.displayPrice != null && qty > 0) {
          priceSum += tier.displayPrice * qty;
        } else {
          allLinesPriced = false;
        }
      } else if (line.productType === "large_format_print") {
        const data = r.largeFormatExtras!
          .largeFormatLineData as unknown as LargeFormatLineData;
        priceSum += data.totalSellPrice;
      } else {
        allLinesPriced = false;
      }
    }
  } catch (err) {
    if (err instanceof AdminOrderResolveError) {
      return NextResponse.json(
        { error: "Failed to resolve order line", code: err.message },
        { status: 400 },
      );
    }
    throw err;
  }

  const orderProductType = computeOrderProductTypeForAdmin(resolved);
  const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);
  const resolvedPrice = allLinesPriced && priceSum > 0 ? round2(priceSum) : undefined;

  const orderStatusOverride: OrderStatus = params.isDealer ? "SENT_TO_WORKSHOP" : "NEW";

  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        phone: params.phone,
        notes: params.notes,
        ...denorm,
        ...(typeof resolvedPrice === "number"
          ? { price: toOrderPriceDecimal(resolvedPrice) ?? undefined }
          : {}),
        status: orderStatusOverride,
        isWorkshop: params.isDealer,
        createdBy: params.customerId,
        ...(params.isDealer ? { sentToWorkshopBy: params.customerId } : {}),
        ...(params.clientName ? { clientName: params.clientName } : {}),
        clientId: params.clientId,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]!;
      const li = r.input;
      await tx.orderLine.create({
        data: {
          orderId: o.id,
          sortOrder: i,
          productType: li.productType,
          mugLayoutData:
            li.productType === "mug" && li.mugLayoutData != null
              ? (li.mugLayoutData as unknown as Prisma.InputJsonValue)
              : undefined,
          mugProductId: r.mugExtras?.mugProductId ?? undefined,
          mugProductSnapshot: r.mugExtras?.mugProductSnapshot ?? undefined,
          notebookLayoutData:
            li.productType === "notebook" && li.notebookLayoutData != null
              ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
              : undefined,
          notebookProductId: r.notebookExtras?.notebookProductId ?? undefined,
          notebookProductSnapshot:
            r.notebookExtras?.notebookProductSnapshot ?? undefined,
          largeFormatMaterialId:
            li.productType === "large_format_print"
              ? r.largeFormatExtras?.largeFormatMaterialId
              : undefined,
          largeFormatLineData:
            li.productType === "large_format_print"
              ? r.largeFormatExtras?.largeFormatLineData
              : undefined,
          files: {
            create: li.files.map((file) => ({
              orderId: o.id,
              fileName: file.fileName,
              fileUrl: file.fileUrl,
              copies: file.copies,
              color: file.color,
              paperType: file.paperType,
              pageCount: file.pageCount,
            })),
          },
        },
      });
    }

    const stockRes = await deductStockForAdminOrderLines(tx, {
      orderId: o.id,
      orderNumber: o.orderNumber,
      createdById: params.customerId,
      resolved,
    });

    let out = await tx.order.findUniqueOrThrow({
      where: { id: o.id },
      include: {
        files: true,
        orderLines: {
          orderBy: { sortOrder: "asc" },
          include: { files: true },
        },
      },
    });

    if (stockRes.needsProcurement && stockRes.procurementMeta) {
      out = await tx.order.update({
        where: { id: o.id },
        data: {
          needsProcurement: true,
          procurementMeta: stockRes.procurementMeta,
        },
        include: {
          files: true,
          orderLines: {
            orderBy: { sortOrder: "asc" },
            include: { files: true },
          },
        },
      });
    }

    await tx.orderLog.create({
      data: {
        orderId: out.id,
        userId: params.customerId,
        action: "order_created",
      },
    });

    return out;
  }, HEAVY_TX_OPTIONS);

  return NextResponse.json(serializeOrderWithPrice(order), { status: 201 });
}
