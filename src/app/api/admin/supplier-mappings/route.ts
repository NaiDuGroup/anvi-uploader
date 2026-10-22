import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import { listSupplierMappings } from "@/lib/purchasing/purchaseQueries";
import { listStockTargetOptions } from "@/lib/purchasing/stockTargets";
import { prisma } from "@/lib/prisma";

/** Remembered «supplier line name → stock item» rules (+ picker options). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !canManagePurchases(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const [mappings, targets] = await Promise.all([
      listSupplierMappings(),
      listStockTargetOptions(prisma),
    ]);
    return NextResponse.json({ mappings, targets });
  } catch (error) {
    console.error("supplier mappings list:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
