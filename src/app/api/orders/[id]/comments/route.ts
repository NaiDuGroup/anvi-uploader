import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const commentSchema = z.object({
  text: z.string().min(1).max(1000),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.deletedAt) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { orderId },
    include: { user: { select: { id: true, name: true, displayName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  await prisma.commentRead.upsert({
    where: { orderId_userId: { orderId, userId: user.id } },
    update: { readAt: new Date() },
    create: { orderId, userId: user.id },
  });

  return NextResponse.json(
    comments.map((c) => ({
      id: c.id,
      text: c.text,
      createdAt: c.createdAt,
      userName: c.user.displayName ?? c.user.name,
      userRole: c.user.role,
      isOwn: c.userId === user.id,
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.deletedAt) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { text } = commentSchema.parse(body);

    const comment = await prisma.comment.create({
      data: { orderId, userId: user.id, text },
      include: { user: { select: { id: true, name: true, displayName: true, role: true } } },
    });

    await prisma.commentRead.upsert({
      where: { orderId_userId: { orderId, userId: user.id } },
      update: { readAt: new Date() },
      create: { orderId, userId: user.id },
    });

    return NextResponse.json(
      {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt,
        userName: comment.user.displayName ?? comment.user.name,
        userRole: comment.user.role,
        isOwn: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create comment:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
