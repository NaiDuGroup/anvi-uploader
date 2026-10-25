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
import {
  NO_DESIGN_PRODUCT,
  designProductBinding,
  withDesignProduct,
  withDesignProducts,
  type DesignProductColumns,
} from "@/lib/design/designProduct";
import { loadMugVariant, mugVariantFields } from "@/lib/mug/mugVariant";
import { loadNotebookVariant, notebookVariantFields } from "@/lib/notebook/notebookVariant";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const tag = sp.get("tag")?.trim().toLowerCase() ?? "";

    const rows = await prisma.design.findMany({
      where: {
        deletedAt: null,
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
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
      items: (await withDesignProducts(prisma, rows)).map(toDesignListItemJson),
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
    let binding: DesignProductColumns = NO_DESIGN_PRODUCT;
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
      // Same product as the source.
      binding = { stockVariantId: source.stockVariantId };
      targetType = source.targetType as typeof targetType;
    } else if (targetType === "mug") {
      // `mugProductId` is the mug variant id (a legacy mug id still resolves).
      const variant = await loadMugVariant(prisma, body.mugProductId);
      if (!variant) {
        return NextResponse.json({ error: "product_not_found" }, { status: 404 });
      }
      const product = mugVariantFields(variant);
      widthCm = product.printWidthCm;
      heightCm = product.printHeightCm;
      dpi = product.printDpi;
      binding = await designProductBinding(prisma, "mug", variant.id);
    } else if (targetType === "notebook") {
      // `notebookProductId` is the notebook variant id (a legacy notebook id still resolves).
      const variant = await loadNotebookVariant(prisma, body.notebookProductId);
      if (!variant) {
        return NextResponse.json({ error: "product_not_found" }, { status: 404 });
      }
      const product = notebookVariantFields(variant);
      widthCm = product.printWidthCm;
      heightCm = product.printHeightCm;
      dpi = product.printDpi;
      binding = await designProductBinding(prisma, "notebook", variant.id);
    } else {
      widthCm = body.widthCm!;
      heightCm = body.heightCm!;
      dpi = body.dpi ?? 300;
    }

    const geometry = resolveDesignGeometry({ widthCm, heightCm, dpi });

    const created = await prisma.design.create({
      data: {
        title: body.title.trim(),
        targetType,
        stockVariantId: binding.stockVariantId,
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
    });

    return NextResponse.json({ item: toDesignDetailJson(await withDesignProduct(prisma, created)) });
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
