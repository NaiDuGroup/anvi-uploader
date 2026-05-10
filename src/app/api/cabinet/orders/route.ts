import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";

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

  return NextResponse.json({ orders });
}
