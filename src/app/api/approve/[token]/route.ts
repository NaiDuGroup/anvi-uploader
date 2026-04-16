import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const FILE_CDN_PREFIX = process.env.R2_PUBLIC_URL ?? "";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        productType: true,
        approvalFeedback: true,
        expiresAt: true,
        createdAt: true,
        deletedAt: true,
        files: { select: { id: true, fileUrl: true, fileName: true } },
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (new Date() > order.expiresAt) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    if (order.productType !== "mug") {
      return NextResponse.json({ error: "not_a_mug_order" }, { status: 400 });
    }

    const layoutFile = order.files[0];
    let layoutImageUrl: string | null = null;
    if (layoutFile) {
      if (layoutFile.fileUrl.startsWith("http")) {
        layoutImageUrl = layoutFile.fileUrl;
      } else if (FILE_CDN_PREFIX) {
        layoutImageUrl = `${FILE_CDN_PREFIX}/${layoutFile.fileUrl}`;
      } else {
        layoutImageUrl = `/api/approve/${token}/image`;
      }
    }

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      layoutImageUrl,
      approvalFeedback: order.approvalFeedback,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error("GET /api/approve/[token]:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const actionSchema = z.object({
  action: z.enum(["approve", "request_changes"]),
  feedback: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { action, feedback } = actionSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        status: true,
        productType: true,
        expiresAt: true,
        createdBy: true,
        deletedAt: true,
      },
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (new Date() > order.expiresAt) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }

    if (order.productType !== "mug") {
      return NextResponse.json({ error: "not_a_mug_order" }, { status: 400 });
    }

    if (order.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "not_pending", currentStatus: order.status },
        { status: 409 },
      );
    }

    if (action === "approve") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "SENT_TO_WORKSHOP",
          isWorkshop: true,
          sentToWorkshopBy: order.createdBy ?? undefined,
        },
      });

      await prisma.orderLog.create({
        data: {
          orderId: order.id,
          userId: "client",
          action: "status_changed",
          field: "status",
          oldValue: "PENDING_APPROVAL",
          newValue: "SENT_TO_WORKSHOP",
        },
      });

      return NextResponse.json({ success: true, action: "approved" });
    }

    // request_changes
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "CHANGES_REQUESTED",
        approvalFeedback: feedback?.trim() || null,
      },
    });

    await prisma.orderLog.create({
      data: {
        orderId: order.id,
        userId: "client",
        action: "status_changed",
        field: "status",
        oldValue: "PENDING_APPROVAL",
        newValue: "CHANGES_REQUESTED",
      },
    });

    return NextResponse.json({ success: true, action: "changes_requested" });
  } catch (error) {
    console.error("POST /api/approve/[token]:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
