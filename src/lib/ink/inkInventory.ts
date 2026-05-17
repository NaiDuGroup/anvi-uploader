import type { Prisma, PrismaClient } from "@prisma/client";
import type { PrintProcess } from "@/lib/printProcess";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";

export async function getOrCreateInkInventory(
  tx: Prisma.TransactionClient | PrismaClient,
  printProcess: PrintProcess = DEFAULT_PRINT_PROCESS,
) {
  const existing = await tx.inkInventory.findUnique({
    where: { id: printProcess },
  });
  if (existing) return existing;
  return tx.inkInventory.create({
    data: {
      id: printProcess,
      stockMl: 0,
      avgCostPerMl: 0,
    },
  });
}
