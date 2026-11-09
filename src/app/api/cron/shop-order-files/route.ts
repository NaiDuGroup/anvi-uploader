import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pruneShopLoginTokens } from "@/lib/shop/account/customers";
import { SHOP_ORDER_FILE_PREFIX } from "@/lib/shop/constants";
import { SHOP_ON_DELIVERY_PROVIDER } from "@/lib/shop/orderFlags";
import {
  SHOP_ORDER_FILE_MIN_RETENTION_DAYS,
  shopKeysSafeToDelete,
  shopOrderFilesReleasable,
} from "@/lib/shop/orderRules";
import { deleteShopOrderFiles } from "@/lib/shop/shopFiles";

const BATCH = 200;
/** `metaStatus` is nullable: a plain `not: "missing"` would skip NULL rows. */
const NOT_PURGED = { OR: [{ metaStatus: null }, { metaStatus: { not: "missing" } }] };

/**
 * Daily: delete the `shop-orders/` copies of storefront order files once the
 * order is done (DELIVERED / in trash) or abandoned unpaid — see
 * `shopOrderFilesReleasable` (account orders: only unpaid after 30 days; their
 * delivered orders keep the files for «Repetă comanda»). The File rows stay,
 * marked `metaStatus='missing'`; an object another kept order still uses
 * (a repeated order reuses the key) is not deleted.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    // Housekeeping: expired storefront login tokens.
    await pruneShopLoginTokens(now.getTime()).catch((e: unknown) => console.error("[shop-order-files] token prune failed:", e));
    const cutoff = new Date(now.getTime() - SHOP_ORDER_FILE_MIN_RETENTION_DAYS * 86_400_000);
    const candidates = await prisma.order.findMany({
      where: {
        source: "shop",
        createdAt: { lt: cutoff },
        files: { some: { fileUrl: { startsWith: SHOP_ORDER_FILE_PREFIX }, ...NOT_PURGED } },
        // Paid account orders keep their files: never candidates (they would fill the batch).
        // Pay-on-delivery account orders are worked on unpaid: they keep their files too.
        OR: [
          { shopCustomerId: null },
          {
            isPaid: false,
            paymentStatus: { not: "paid" },
            OR: [{ paymentProvider: null }, { paymentProvider: { not: SHOP_ON_DELIVERY_PROVIDER } }],
          },
        ],
      },
      select: {
        id: true,
        source: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        isPaid: true,
        createdAt: true,
        deletedAt: true,
        shopCustomerId: true,
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
    const keys = [...new Set(files.map((f) => f.fileUrl))];
    const others = keys.length
      ? await prisma.file.findMany({
          where: { fileUrl: { in: keys }, orderId: { notIn: releasable }, ...NOT_PURGED },
          select: { fileUrl: true },
        })
      : [];
    const deletable = shopKeysSafeToDelete(keys, new Set(others.map((f) => f.fileUrl)));
    await deleteShopOrderFiles(deletable);
    await prisma.file.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { metaStatus: "missing" },
    });
    return NextResponse.json({ ok: true, orders: releasable.length, files: files.length, objects: deletable.length });
  } catch (error) {
    console.error("[shop-order-files] cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes routes with GET; POST stays for manual runs. */
export { POST as GET };
