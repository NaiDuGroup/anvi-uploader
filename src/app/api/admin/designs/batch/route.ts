import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { toDesignListItemJson } from "@/lib/design/designJson";

const MAX_BATCH = 50;

const PRODUCT_SELECT = { select: { sku: true, nameRu: true } } as const;

/**
 * Fetch several designs by id, in the order requested. Used by the order
 * wizard when it is opened with `?designs=id1,id2,...` from the library.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_BATCH);

    if (ids.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const rows = await prisma.design.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { mugProduct: PRODUCT_SELECT, notebookProduct: PRODUCT_SELECT },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rows)[number] => !!r)
      .map(toDesignListItemJson);

    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/admin/designs/batch:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
