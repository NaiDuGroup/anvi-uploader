import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { toDesignDetailJson } from "@/lib/design/designJson";

const PRODUCT_SELECT = { select: { sku: true, nameRu: true } } as const;

const DESIGN_INCLUDE = {
  mugProduct: PRODUCT_SELECT,
  notebookProduct: PRODUCT_SELECT,
} as const;

/**
 * Duplicate a design — the core personalisation move: copy a finished layout,
 * then change the name/dedication text. The copy starts as a draft with no
 * render, so the editor regenerates artifacts on first save.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const source = await prisma.design.findFirst({
      where: { id, deletedAt: null },
    });
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const created = await prisma.design.create({
      data: {
        title: `${source.title} (копия)`,
        status: "draft",
        targetType: source.targetType,
        mugProductId: source.mugProductId,
        notebookProductId: source.notebookProductId,
        widthCm: new Prisma.Decimal(source.widthCm),
        heightCm: new Prisma.Decimal(source.heightCm),
        dpi: source.dpi,
        canvasWidthPx: source.canvasWidthPx,
        canvasHeightPx: source.canvasHeightPx,
        doc: source.doc as Prisma.InputJsonValue,
        docVersion: source.docVersion,
        tags: source.tags,
        isTemplate: false,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: DESIGN_INCLUDE,
    });

    return NextResponse.json({ item: toDesignDetailJson(created) });
  } catch (e) {
    console.error("POST /api/admin/designs/[id]/duplicate:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
