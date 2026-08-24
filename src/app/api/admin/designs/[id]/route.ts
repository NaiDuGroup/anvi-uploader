import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  toDesignDetailJson,
  updateDesignSchema,
} from "@/lib/design/designJson";

const PRODUCT_SELECT = { select: { sku: true, nameRu: true } } as const;

const DESIGN_INCLUDE = {
  mugProduct: PRODUCT_SELECT,
  notebookProduct: PRODUCT_SELECT,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const row = await prisma.design.findFirst({
      where: { id, deletedAt: null },
      include: DESIGN_INCLUDE,
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ item: toDesignDetailJson(row) });
  } catch (e) {
    console.error("GET /api/admin/designs/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = updateDesignSchema.parse(await request.json());

    const existing = await prisma.design.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // `renderKey` always arrives together with a fresh render, so stamp the
    // render timestamp in the same write.
    const renderFields = body.renderKey
      ? {
          renderKey: body.renderKey,
          ...(body.thumbKey ? { thumbKey: body.thumbKey } : {}),
          renderedAt: new Date(),
        }
      : {};

    const updated = await prisma.design.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.doc !== undefined
          ? { doc: body.doc as unknown as Prisma.InputJsonValue }
          : {}),
        ...(body.isTemplate !== undefined ? { isTemplate: body.isTemplate } : {}),
        ...(body.tags !== undefined
          ? { tags: body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) }
          : {}),
        ...renderFields,
        updatedBy: user.id,
      },
      include: DESIGN_INCLUDE,
    });

    return NextResponse.json({ item: toDesignDetailJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/designs/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.design.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Soft delete keeps `order_lines.design_id` references meaningful.
    await prisma.design.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/designs/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
