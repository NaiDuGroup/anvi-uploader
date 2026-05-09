import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validations";
import type { OrderStatus } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { normalizeOrderPageLimit } from "@/lib/orderPagination";
import { nanoid } from "nanoid";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { resolveMugProductForOrder } from "@/lib/mug/resolveMugProductForOrder";
import { mugProductToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import {
  InsufficientMugStockError,
  recordMugStockSale,
} from "@/lib/mug/mugStockLedger";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusesParam = searchParams.get("statuses")?.trim() ?? "";

    const limitRaw = searchParams.get("limit");
    const result = await fetchOrdersData(user, {
      page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
      limit: normalizeOrderPageLimit(
        limitRaw !== null ? parseInt(limitRaw, 10) : undefined,
      ),
      search: searchParams.get("search") ?? "",
      onlyMine: searchParams.get("onlyMine") === "true",
      hideDelivered: searchParams.get("hideDelivered") === "true",
      statuses: statusesParam ? statusesParam.split(",") as OrderStatus[] : [],
      dateFrom: searchParams.get("dateFrom") ?? "",
      dateTo: searchParams.get("dateTo") ?? "",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createOrderSchema.parse(body);

    const linkedClientId = await findClientIdByOrderPhone(validated.phone);

    const isMug = validated.productType === "mug";

    let mugExtras: {
      mugProductId: string | null;
      mugProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    let retailPrice: number | undefined;

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
        if (p.sellPrice != null) {
          retailPrice = p.sellPrice;
        }
      }
    }

    const mugProductIdForStock =
      isMug && mugExtras && !validated.mugOther ? mugExtras.mugProductId : null;
    const stockQty =
      mugProductIdForStock != null
        ? mugOrderStockQuantityFromFiles(validated.files)
        : 0;

    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          phone: validated.phone,
          notes: validated.notes,
          productType: validated.productType,
          mugLayoutData: isMug && validated.mugLayoutData
            ? (validated.mugLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          ...mugExtras,
          ...(typeof retailPrice === "number" ? { price: retailPrice } : {}),
          clientId: linkedClientId ?? undefined,
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          files: {
            create: validated.files.map((file) => ({
              fileName: file.fileName,
              fileUrl: file.fileUrl,
              copies: file.copies,
              color: file.color,
              paperType: file.paperType,
              pageCount: file.pageCount,
            })),
          },
        },
        include: { files: true },
      });

      if (mugProductIdForStock && stockQty > 0) {
        await recordMugStockSale(tx, {
          mugProductId: mugProductIdForStock,
          quantity: stockQty,
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: null,
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: o.id,
          userId: "client",
          action: "order_created",
        },
      });

      return o;
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create order:", error);
    if (error instanceof InsufficientMugStockError) {
      return NextResponse.json(
        {
          error: "insufficient_stock",
          requested: error.requested,
          available: error.available,
          mugProductId: error.mugProductId,
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
