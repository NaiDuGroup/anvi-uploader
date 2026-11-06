import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveDealerUrgencyOffer, type DealerUrgencyOffer } from "@/lib/dealerUrgency";

type Db = Prisma.TransactionClient | typeof prisma;

/** Global «Доплата за срочность (дилеры)» (singleton company profile; no row = 0). */
export async function getGlobalDealerUrgencyFeeMdl(db: Db = prisma): Promise<number> {
  const row = await db.companyProfile.findFirst({
    orderBy: { createdAt: "asc" },
    select: { dealerUrgencyFeeMdl: true },
  });
  return row ? Number(row.dealerUrgencyFeeMdl.toString()) : 0;
}

/**
 * The «Срочно» offer for this client, read from the database (never from the
 * request): their card's override, else the global setting.
 */
export async function loadDealerUrgencyOffer(db: Db, studioCustomerId: string): Promise<DealerUrgencyOffer> {
  const [customer, globalFeeMdl] = await Promise.all([
    db.studioCustomer.findUnique({
      where: { id: studioCustomerId },
      select: { isDealer: true, urgencyFeeMdl: true, urgencyDisabled: true },
    }),
    getGlobalDealerUrgencyFeeMdl(db),
  ]);
  return resolveDealerUrgencyOffer({ globalFeeMdl }, customer);
}
