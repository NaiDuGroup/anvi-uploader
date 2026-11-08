import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { validateGiftSetTemplates, type GiftSetTemplate } from "@/lib/giftSet/giftSet";
import { loadGiftSetTemplates, saveGiftSetTemplates } from "@/lib/giftSet/giftSetServer";

/** Stock facts the settings show next to each template: is the box / ready item in stock. */
async function stockStatus(templates: GiftSetTemplate[]) {
  const boxSkus = templates.map((t) => t.boxSku).filter((s): s is string => Boolean(s));
  const readySkus = templates.map((t) => t.readyItemSku).filter((s): s is string => Boolean(s));
  const [boxes, items] = await Promise.all([
    prisma.stockVariant.findMany({
      where: { sku: { in: boxSkus } },
      select: { sku: true, label: true, stockQuantity: true, item: { select: { nameRu: true } } },
    }),
    prisma.stockItem.findMany({
      where: { sku: { in: readySkus } },
      select: { sku: true, nameRu: true, variants: { where: { isActive: true }, select: { id: true } } },
    }),
  ]);
  return {
    boxes: Object.fromEntries(
      boxes.map((b) => [b.sku, { name: [b.item.nameRu, b.label].filter(Boolean).join(" / "), stock: Number(b.stockQuantity.toString()) }]),
    ),
    readyItems: Object.fromEntries(items.map((i) => [i.sku, { name: i.nameRu, variants: i.variants.length }])),
  };
}

async function guard() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isSuperAdmin(user.role)) return { error: NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 }) };
  return { user };
}

/** «Шаблоны наборов» (superadmin): templates + stock status of boxes / ready items. */
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const templates = await loadGiftSetTemplates();
  return NextResponse.json({ templates, stock: await stockStatus(templates) });
}

/** Replace the templates (validated; the order wizard reads them on its next load). */
export async function PUT(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { templates?: unknown } | null;
  const res = validateGiftSetTemplates(body?.templates);
  if (!res.ok) return NextResponse.json({ error: "Validation failed", errors: res.errors }, { status: 400 });
  await saveGiftSetTemplates(res.templates);
  return NextResponse.json({ templates: res.templates, stock: await stockStatus(res.templates) });
}
