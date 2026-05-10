import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      clientId: user.studioCustomerId!,
      deletedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      productType: true,
      phone: true,
      notes: true,
      price: true,
      isPaid: true,
      createdAt: true,
      mugLayoutData: true,
      mugProductSnapshot: true,
      notebookLayoutData: true,
      notebookProductSnapshot: true,
      publicToken: true,
      files: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          copies: true,
          color: true,
          paperType: true,
          pageCount: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}
