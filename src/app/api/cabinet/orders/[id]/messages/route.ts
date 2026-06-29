import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import {
  clientMessageSchema,
  clientMessageUserInclude,
  serializeClientMessage,
} from "@/lib/clientMessages";
import { z } from "zod";

/**
 * Cabinet (customer) side of the client-message channel. The customer can only
 * read/post on orders they own (`Order.clientId === user.studioCustomerId`).
 */
async function findOwnedOrder(orderId: string, studioCustomerId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, clientId: studioCustomerId, deletedAt: null },
    select: { id: true },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;
  const order = await findOwnedOrder(orderId, user.studioCustomerId!);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await prisma.clientMessage.findMany({
    where: { orderId },
    include: clientMessageUserInclude,
    orderBy: { createdAt: "asc" },
  });

  await prisma.clientMessageRead.upsert({
    where: { orderId_userId: { orderId, userId: user.id } },
    update: { readAt: new Date() },
    create: { orderId, userId: user.id },
  });

  return NextResponse.json(
    messages.map((m) => serializeClientMessage(m, user.id)),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;
  const order = await findOwnedOrder(orderId, user.studioCustomerId!);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { text } = clientMessageSchema.parse(body);

    const message = await prisma.clientMessage.create({
      data: { orderId, userId: user.id, text },
      include: clientMessageUserInclude,
    });

    await prisma.clientMessageRead.upsert({
      where: { orderId_userId: { orderId, userId: user.id } },
      update: { readAt: new Date() },
      create: { orderId, userId: user.id },
    });

    return NextResponse.json(serializeClientMessage(message, user.id), {
      status: 201,
    });
  } catch (error) {
    console.error("Failed to create client message:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
}
