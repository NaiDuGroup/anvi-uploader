import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStockManager, stockRoute } from "@/lib/stock/unified/apiRoute";
import { loadPrintersResponse } from "@/lib/stock/unified/printerAdminJson";

/** GET: printers with their slots, loaded variants and unit costs, plus loadable consumables per role. */
export async function GET() {
  return stockRoute("GET /api/admin/stock/printers", async () => {
    await requireStockManager();
    return NextResponse.json(await loadPrintersResponse(prisma));
  });
}
