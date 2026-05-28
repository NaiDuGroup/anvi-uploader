import { NextRequest, NextResponse } from "next/server";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import {
  updateAdminOrderSchema,
  type UpdateAdminOrderInput,
} from "@/lib/validations";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import {
  AdminOrderUpdateError,
  resolveLinesForAdminOrderUpdate,
  syncAdminOrderStructureInTx,
  type AdminOrderScalarPatch,
  type OrderWithLinesAndFiles,
} from "@/lib/adminOrderUpdateHelpers";
import { AdminOrderResolveError } from "@/lib/adminOrderCreateHelpers";
import {
  serializeOrderPrice,
  serializeOrderWithPrice,
} from "@/lib/orderPriceDecimal";

const STUDIO_CLIENT_SELECT = {
  id: true,
  kind: true,
  phone: true,
  personName: true,
  companyName: true,
  companyIdno: true,
} as const;

async function loadAdminOrderDetail(id: string): Promise<OrderWithLinesAndFiles | null> {
  return prisma.order.findFirst({
    where: { id, deletedAt: null },
    include: {
      files: true,
      orderLines: {
        orderBy: { sortOrder: "asc" },
        include: { files: true },
      },
      studioClient: { select: STUDIO_CLIENT_SELECT },
    },
  });
}


export async function GET(
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

  const { id } = await params;
  const order = await loadAdminOrderDetail(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(serializeOrderWithPrice(order));
}

function scalarPatchFromValidated(
  validated: UpdateAdminOrderInput,
  oldOrder: OrderWithLinesAndFiles,
  phone: string,
  clientName: string | null,
  clientId: string | null,
): AdminOrderScalarPatch {
  return {
    phone,
    clientName,
    clientId,
    notes:
      validated.notes !== undefined ? validated.notes : oldOrder.notes,
    price:
      validated.price !== undefined
        ? validated.price
        : serializeOrderPrice(oldOrder.price),
  };
}

export async function PATCH(
  request: NextRequest,
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
    const body = await request.json();
    const validated = updateAdminOrderSchema.parse(body);

    const oldOrder = await loadAdminOrderDetail(id);
    if (!oldOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let nextClientId: string | null =
      validated.clientId !== undefined
        ? validated.clientId
        : oldOrder.clientId;

    let phoneForOrder = validated.phone;
    let clientNameForOrder: string | null =
      validated.clientName !== undefined
        ? validated.clientName
        : oldOrder.clientName;

    if (nextClientId) {
      const c = await prisma.studioCustomer.findUnique({
        where: { id: nextClientId },
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
          {
            error:
              "Linked client must have a phone number of at least 8 characters",
          },
          { status: 400 },
        );
      }
      phoneForOrder = oc.phone;
      clientNameForOrder = oc.clientName ?? null;
      nextClientId = c.id;
    } else {
      const linked = await findClientIdByOrderPhone(validated.phone);
      if (linked) {
        const c = await prisma.studioCustomer.findUnique({
          where: { id: linked },
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
            {
              error:
                "Linked client must have a phone number of at least 8 characters",
            },
            { status: 400 },
          );
        }
        nextClientId = linked;
        phoneForOrder = oc.phone;
        clientNameForOrder = oc.clientName ?? null;
      }
    }

    const resolved = await resolveLinesForAdminOrderUpdate(oldOrder, validated);
    const scalarPatch = scalarPatchFromValidated(
      validated,
      oldOrder,
      phoneForOrder,
      clientNameForOrder,
      nextClientId,
    );

    await prisma.$transaction(
      (tx) =>
        syncAdminOrderStructureInTx(
          tx,
          oldOrder,
          validated,
          resolved,
          user.id,
          scalarPatch,
        ),
      HEAVY_TX_OPTIONS,
    );

    const out = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        files: true,
        orderLines: {
          orderBy: { sortOrder: "asc" },
          include: { files: true },
        },
        studioClient: { select: STUDIO_CLIENT_SELECT },
      },
    });

    return NextResponse.json(serializeOrderWithPrice(out));
  } catch (error) {
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AdminOrderUpdateError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to update admin order:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update order", detail: message },
      { status: 500 },
    );
  }
}
