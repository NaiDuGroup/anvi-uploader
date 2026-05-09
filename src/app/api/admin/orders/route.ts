import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminOrderSchema } from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { nanoid } from "nanoid";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import { resolveMugProductForOrder } from "@/lib/mug/resolveMugProductForOrder";
import { mugProductToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import {
  InsufficientMugStockError,
  recordMugStockSale,
} from "@/lib/mug/mugStockLedger";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: only admin can create orders" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const validated = createAdminOrderSchema.parse(body);

    let clientId: string | null | undefined = validated.clientId ?? undefined;
    let phoneForOrder = validated.phone;
    let clientNameForOrder: string | null | undefined = validated.clientName;

    if (clientId) {
      const c = await prisma.studioCustomer.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          kind: true,
          phone: true,
          personName: true,
          companyName: true,
        },
      });
      if (!c) {
        return NextResponse.json({ error: "Client not found" }, { status: 400 });
      }
      const oc = orderContactFromStudioCustomer(c);
      if (oc.phone.length < 8) {
        return NextResponse.json(
          { error: "Linked client must have a phone number of at least 8 characters" },
          { status: 400 },
        );
      }
      phoneForOrder = oc.phone;
      clientNameForOrder = oc.clientName ?? undefined;
    } else {
      const linked = await findClientIdByOrderPhone(validated.phone);
      if (linked) clientId = linked;
    }

    const isMug = validated.productType === "mug";

    let mugExtras: {
      mugProductId: string | null;
      mugProductSnapshot: Prisma.InputJsonValue;
    } | undefined;

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
          phone: phoneForOrder,
          clientName: clientNameForOrder,
          clientId: clientId ?? undefined,
          notes: validated.notes,
          price: validated.price ?? undefined,
          productType: validated.productType,
          mugLayoutData: isMug && validated.mugLayoutData
            ? (validated.mugLayoutData as unknown as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          ...mugExtras,
          status: isMug ? "PENDING_APPROVAL" : "SENT_TO_WORKSHOP",
          isWorkshop: !isMug,
          createdBy: user.id,
          sentToWorkshopBy: isMug ? undefined : user.id,
          assignedTo: user.id,
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
          createdById: user.id,
        });
      }

      await tx.orderLog.create({
        data: {
          orderId: o.id,
          userId: user.id,
          action: "order_created",
        },
      });

      return o;
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Failed to create admin order:", error);
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
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create order", detail: message },
      { status: 500 },
    );
  }
}
