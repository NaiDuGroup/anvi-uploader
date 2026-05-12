import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
import {
  InsufficientMugStockError,
  recordMugStockSale,
} from "@/lib/mug/mugStockLedger";
import { resolveNotebookProductForOrder } from "@/lib/notebook/resolveNotebookProductForOrder";
import {
  notebookProductToSnapshot,
  otherNotebookProductSnapshot,
} from "@/lib/notebook/notebookProductSnapshot";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import {
  InsufficientNotebookStockError,
  recordNotebookStockSale,
} from "@/lib/notebook/notebookStockLedger";
import { pickProductPrice } from "@/lib/pricing";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
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

    // Logged-in customer? Authoritative contact info comes from their
    // StudioCustomer card; we ignore any phone the client tries to override.
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

    const isMug = validated.productType === "mug";
    const isNotebook = validated.productType === "notebook";

    let mugExtras: {
      mugProductId: string | null;
      mugProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    let notebookExtras: {
      notebookProductId: string | null;
      notebookProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

    let resolvedPrice: number | undefined;

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
          { sellPrice: p.sellPrice, dealerPrice: p.dealerPrice },
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
          { sellPrice: p.sellPrice, dealerPrice: p.dealerPrice },
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
        ? mugOrderStockQuantityFromFiles(validated.files)
        : 0;

    const notebookProductIdForStock =
      isNotebook && notebookExtras && !validated.notebookOther
        ? notebookExtras.notebookProductId
        : null;
    const notebookStockQty =
      notebookProductIdForStock != null
        ? notebookOrderStockQuantityFromFiles(validated.files)
        : 0;

    // Anonymous submissions use the schema default NEW.
    // Cabinet dealers go straight to workshop; cabinet retail stays NEW for studio handling.
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
          ...(typeof resolvedPrice === "number" ? { price: resolvedPrice } : {}),
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

      if (mugProductIdForStock && mugStockQty > 0) {
        await recordMugStockSale(tx, {
          mugProductId: mugProductIdForStock,
          quantity: mugStockQty,
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: customer?.id ?? null,
        });
      }

      if (notebookProductIdForStock && notebookStockQty > 0) {
        await recordNotebookStockSale(tx, {
          notebookProductId: notebookProductIdForStock,
          quantity: notebookStockQty,
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: customer?.id ?? null,
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: o.id,
          // Anonymous public submissions keep the legacy "client" sentinel.
          // Cabinet (logged-in customer) submissions are attributed to the
          // user id so admins can see who triggered the order.
          userId: customer?.id ?? "client",
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
    if (error instanceof InsufficientNotebookStockError) {
      return NextResponse.json(
        {
          error: "insufficient_stock",
          requested: error.requested,
          available: error.available,
          notebookProductId: error.notebookProductId,
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
