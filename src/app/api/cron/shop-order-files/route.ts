import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SHOP_ORDER_FILE_PREFIX } from "@/lib/shop/constants";
import { SHOP_ORDER_FILE_MIN_RETENTION_DAYS, shopOrderFilesReleasable } from "@/lib/shop/orderRules";
import { deleteShopOrderFiles } from "@/lib/shop/shopFiles";

const BATCH = 200;
/** `metaStatus` is nullable: a plain `not: "missing"` would skip NULL rows. */
const NOT_PURGED = { OR: [{ metaStatus: null }, { metaStatus: { not: "missing" } }] };

/**
 * Daily: delete the `shop-orders/` copies of storefront order files once the
 * order is done (DELIVERED / in trash) or abandoned unpaid — see
 * `shopOrderFilesReleasable`. The File rows stay, marked `metaStatus='missing'`.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - SHOP_ORDER_FILE_MIN_RETENTION_DAYS * 86_400_000);
    const candidates = await prisma.order.findMany({
      where: {
        source: "shop",
        createdAt: { lt: cutoff },
        files: { some: { fileUrl: { startsWith: SHOP_ORDER_FILE_PREFIX }, ...NOT_PURGED } },
      },
      select: {
        id: true,
        source: true,
        status: true,
        paymentStatus: true,
        isPaid: true,
        createdAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    const releasable = candidates.filter((o) => shopOrderFilesReleasable(o, now)).map((o) => o.id);
    if (releasable.length === 0) return NextResponse.json({ ok: true, orders: 0, files: 0 });

    const files = await prisma.file.findMany({
      where: {
        orderId: { in: releasable },
        fileUrl: { startsWith: SHOP_ORDER_FILE_PREFIX },
        ...NOT_PURGED,
      },
      select: { id: true, fileUrl: true },
    });
    await deleteShopOrderFiles(files.map((f) => f.fileUrl));
    await prisma.file.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { metaStatus: "missing" },
    });
    return NextResponse.json({ ok: true, orders: releasable.length, files: files.length });
  } catch (error) {
    console.error("[shop-order-files] cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes routes with GET; POST stays for manual runs. */
export { POST as GET };
