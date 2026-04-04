import { prisma } from "@/lib/prisma";
import { normalizedPhoneForDb } from "@/lib/studioClient";

/** Returns first matching studio client for auto-linking orders by phone. */
export async function findClientIdByOrderPhone(
  phone: string,
): Promise<string | null> {
  const norm = normalizedPhoneForDb(phone);
  if (!norm) return null;
  const row = await prisma.studioCustomer.findFirst({
    where: { phoneNormalized: norm },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return row?.id ?? null;
}
