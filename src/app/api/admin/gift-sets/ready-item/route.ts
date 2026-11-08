import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { createReadyGiftSetStockItem, loadGiftSetTemplates } from "@/lib/giftSet/giftSetServer";

/**
 * Creates the stock item of a ready set template (thermos set: 6 colour
 * variants, 0 pcs, no cost) — stock comes later by receipt / stocktake.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { templateId?: unknown } | null;
  const templates = await loadGiftSetTemplates();
  const template = templates.find((t) => t.id === body?.templateId && t.kind === "ready");
  if (!template) return NextResponse.json({ error: "Ready set template not found (save the templates first)" }, { status: 404 });
  const res = await createReadyGiftSetStockItem(template);
  return NextResponse.json(res, { status: res.created ? 201 : 200 });
}
