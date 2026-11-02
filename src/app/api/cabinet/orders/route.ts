import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import { serializeOrderWithPrice, toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import { dealerWizardOrderSchema, type AdminOrderLineInput } from "@/lib/validations";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  expandToOneFilePerLine,
  OrderLineLimitError,
} from "@/lib/adminOrderCreateHelpers";
import { findArtworkLargerThanOrdered } from "@/lib/files/serverArtworkCheck";
import { createOrderWithResolvedLines, resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { dealerLineTotalsMdl, dealerOrderTotalMdl } from "@/lib/orderCreate/dealerLinePrices";

/**
 * Customer-facing orders list. Always scoped to the logged-in customer's
 * StudioCustomer (`clientId`). We never look at the order's stored phone
 * number for ownership — that field is mutable by the studio. The
 * `studioCustomerId` link is set at creation time by the cabinet flow.
 */
export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: {
      clientId: user.studioCustomerId!,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      productType: true,
      price: true,
      isPaid: true,
      createdAt: true,
      mugProductSnapshot: true,
      notebookProductSnapshot: true,
      penProductSnapshot: true,
      publicToken: true,
      files: {
        select: {
          id: true,
          fileName: true,
          paperType: true,
        },
      },
    },
  });

  const unreadMap = await getUnreadClientMessageCountMap(
    orders.map((o) => o.id),
    user.id,
    "customer",
  );

  return NextResponse.json({
    orders: orders.map((o) => ({
      ...serializeOrderWithPrice(o),
      unreadMessageCount: unreadMap.get(o.id) ?? 0,
    })),
  });
}

/**
 * Order from the dealer cabinet's order wizard (same positions as the staff
 * wizard: DTF, UV, sublimation, stock items, large format, sheets, …).
 *
 * The contact is the logged-in dealer, every line is priced on the server at
 * the dealer tier, and the order goes straight to the workshop like other
 * dealer cabinet orders. `dryRun: true` only prices the lines (the confirm
 * step shows that total before the files are uploaded).
 */
export async function POST(request: NextRequest) {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.studioCustomer.isDealer !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const validated = dealerWizardOrderSchema.parse(await request.json());

    const contact = orderContactFromStudioCustomer(user.studioCustomer);
    if (!contact.phone || contact.phone.length < 8) {
      return NextResponse.json(
        { error: "Your portal account has no valid phone. Please contact the studio." },
        { status: 400 },
      );
    }

    const lineInputs: AdminOrderLineInput[] = expandToOneFilePerLine(
      validated.lines.map((line) => ({ ...line, customerType: "dealer" as const })),
    );

    if (!validated.dryRun) {
      // Price follows the declared size: refuse artwork that prints bigger than that.
      const tooLarge = await findArtworkLargerThanOrdered(lineInputs);
      if (tooLarge) {
        return NextResponse.json(
          { error: `Artwork ${tooLarge} is larger than the ordered size`, code: "artwork_larger_than_ordered" },
          { status: 422 },
        );
      }
    }

    const { resolved, lfLineTotalsMdl } = await resolveOrderLines(lineInputs);
    const lineTotals = await dealerLineTotalsMdl(resolved, lfLineTotalsMdl);
    const total = dealerOrderTotalMdl(lineTotals);

    if (validated.dryRun) {
      return NextResponse.json({ lineTotalsMdl: lineTotals, totalMdl: total });
    }

    const orderProductType = computeOrderProductTypeForAdmin(resolved);
    const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);

    const order = await createOrderWithResolvedLines({
      order: {
        phone: contact.phone,
        ...(contact.clientName ? { clientName: contact.clientName } : {}),
        clientId: user.studioCustomerId ?? undefined,
        notes: validated.notes?.trim() || undefined,
        ...(total != null ? { price: toOrderPriceDecimal(total) ?? undefined } : {}),
        ...denorm,
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: user.id,
        sentToWorkshopBy: user.id,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      resolved,
      actorId: user.id,
    });

    return NextResponse.json(serializeOrderWithPrice(order), { status: 201 });
  } catch (error) {
    if (error instanceof OrderLineLimitError) {
      return NextResponse.json({ error: "Too many positions", code: error.code }, { status: 400 });
    }
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ error: error.message, code: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }
    console.error("Failed to create dealer wizard order:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
