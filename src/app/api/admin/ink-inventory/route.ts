import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { getOrCreateInkInventory } from "@/lib/ink/inkInventory";
import { PRINT_PROCESSES } from "@/lib/printProcess";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tanks = await Promise.all(
    PRINT_PROCESSES.map((id) => getOrCreateInkInventory(prisma, id)),
  );

  return NextResponse.json({
    tanks: tanks.map((inv) => ({
      printProcess: inv.id,
      stockMl: Number(inv.stockMl),
      avgCostPerMlMdl: Number(inv.avgCostPerMl),
      updatedAt: inv.updatedAt.toISOString(),
    })),
  });
}
