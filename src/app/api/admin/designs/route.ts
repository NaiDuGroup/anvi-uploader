import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { emptyDesignDoc, type DesignDoc } from "@/lib/design/doc";
import {
  createDesignSchema,
  resolveDesignGeometry,
  toDesignDetailJson,
  toDesignListItemJson,
} from "@/lib/design/designJson";

const PRODUCT_SELECT = { select: { sku: true, nameRu: true } } as const;

const DESIGN_INCLUDE = {
  mugProduct: PRODUCT_SELECT,
  notebookProduct: PRODUCT_SELECT,
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const status = sp.get("status")?.trim() ?? "";
    const tag = sp.get("tag")?.trim().toLowerCase() ?? "";
    const templatesOnly = sp.get("templates") === "1";

    const rows = await prisma.design.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : { status: { not: "archived" } }),
        ...(templatesOnly ? { isTemplate: true } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: DESIGN_INCLUDE,
      orderBy: { updatedAt: "desc" },
      take: 300,
    });

    const tagRows = await prisma.design.findMany({
      where: { deletedAt: null },
      select: { tags: true },
      take: 500,
    });
    const allTags = [...new Set(tagRows.flatMap((r) => r.tags))].sort();

    return NextResponse.json({
      items: rows.map(toDesignListItemJson),
      tags: allTags,
    });
  } catch (e) {
    console.error("GET /api/admin/designs:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createDesignSchema.parse(await request.json());

    let widthCm: number;
    let heightCm: number;
    let dpi: number;
    let doc: DesignDoc = body.doc ?? emptyDesignDoc();
    let mugProductId = body.mugProductId ?? null;
    let notebookProductId = body.notebookProductId ?? null;
    let targetType = body.targetType;

    if (body.fromDesignId) {
      // "New from design": inherit geometry + document verbatim.
      const source = await prisma.design.findFirst({
        where: { id: body.fromDesignId, deletedAt: null },
      });
      if (!source) {
        return NextResponse.json({ error: "source_not_found" }, { status: 404 });
      }
      widthCm = Number(source.widthCm);
      heightCm = Number(source.heightCm);
      dpi = source.dpi;
      doc = body.doc ?? (source.doc as unknown as DesignDoc);
      mugProductId = source.mugProductId;
      notebookProductId = source.notebookProductId;
      targetType = source.targetType as typeof targetType;
    } else if (targetType === "mug") {
      const product = await prisma.mugProduct.findUnique({
        where: { id: mugProductId! },
      });
      if (!product) {
        return NextResponse.json({ error: "product_not_found" }, { status: 404 });
      }
      widthCm = Number(product.printWidthCm);
      heightCm = Number(product.printHeightCm);
      dpi = product.printDpi;
      notebookProductId = null;
    } else if (targetType === "notebook") {
      const product = await prisma.notebookProduct.findUnique({
        where: { id: notebookProductId! },
      });
      if (!product) {
        return NextResponse.json({ error: "product_not_found" }, { status: 404 });
      }
      widthCm = Number(product.printWidthCm);
      heightCm = Number(product.printHeightCm);
      dpi = product.printDpi;
      mugProductId = null;
    } else {
      widthCm = body.widthCm!;
      heightCm = body.heightCm!;
      dpi = body.dpi ?? 300;
      mugProductId = null;
      notebookProductId = null;
    }

    const geometry = resolveDesignGeometry({ widthCm, heightCm, dpi });

    const created = await prisma.design.create({
      data: {
        title: body.title.trim(),
        targetType,
        mugProductId,
        notebookProductId,
        widthCm: new Prisma.Decimal(widthCm.toFixed(2)),
        heightCm: new Prisma.Decimal(heightCm.toFixed(2)),
        dpi,
        canvasWidthPx: geometry.canvasWidthPx,
        canvasHeightPx: geometry.canvasHeightPx,
        doc: doc as unknown as Prisma.InputJsonValue,
        isTemplate: body.isTemplate ?? false,
        tags: (body.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: DESIGN_INCLUDE,
    });

    return NextResponse.json({ item: toDesignDetailJson(created) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/designs:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
