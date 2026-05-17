import type { AccountingSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_ID = "default";

export async function getOrCreateAccountingSettings(): Promise<AccountingSettings> {
  const existing = await prisma.accountingSettings.findUnique({
    where: { id: DEFAULT_ID },
  });
  if (existing) return existing;
  return prisma.accountingSettings.create({
    data: { id: DEFAULT_ID, productionCosts: {} },
  });
}
