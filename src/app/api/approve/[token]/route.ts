import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import {
  DEFAULT_MUG_HANDLE_COLOR_HEX,
  MUG_BODY_COLOR_HEX,
} from "@/lib/mug/mug3dMaterials";

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
        mugLayoutData: true,
        mugProductSnapshot: true,
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
      const cacheBuster = `v=${layoutFile.id.slice(0, 8)}`;
      if (layoutFile.fileUrl.startsWith("http")) {
        const sep = layoutFile.fileUrl.includes("?") ? "&" : "?";
        layoutImageUrl = `${layoutFile.fileUrl}${sep}${cacheBuster}`;
      } else if (FILE_CDN_PREFIX) {
        layoutImageUrl = `${FILE_CDN_PREFIX}/${layoutFile.fileUrl}?${cacheBuster}`;
      } else {
        layoutImageUrl = `/api/approve/${token}/image?${cacheBuster}`;
      }
    }

    const snapshot = parseMugProductSnapshot(order.mugProductSnapshot);
    const layoutJson = order.mugLayoutData as
      | { mugHandleColorHex?: string }
      | null
      | undefined;
    const legacyHandle =
      typeof layoutJson?.mugHandleColorHex === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(layoutJson.mugHandleColorHex)
        ? layoutJson.mugHandleColorHex
        : null;

    const mugBodyColorHex = snapshot?.bodyColorHex ?? MUG_BODY_COLOR_HEX;
    const mugHandleColorHex =
      snapshot?.handleColorHex ?? legacyHandle ?? DEFAULT_MUG_HANDLE_COLOR_HEX;
    const mugInnerColorHex = snapshot?.innerColorHex ?? mugBodyColorHex;
    const mugRimColorHex = snapshot?.rimColorHex ?? mugBodyColorHex;

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      layoutImageUrl,
      mugBodyColorHex,
      mugHandleColorHex,
      mugInnerColorHex,
      mugRimColorHex,
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
