import type { AccountingSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_ID = "default";

/**
 * Accounting settings rarely change — they are mutated only by the
 * superadmin via `/api/admin/accounting/settings` PATCH. Every order
 * wizard render and every print-economics fetch re-read the row from
 * Neon, contributing to the `/admin/orders/new` waterfall. We cache
 * the row in-process for a short TTL so warm Lambdas serve it from
 * memory; the PATCH route invalidates the cache after each upsert.
 */
const TTL_MS = 60_000;

interface CacheEntry {
  value: AccountingSettings;
  expiresAt: number;
}

let cached: CacheEntry | null = null;
let inflight: Promise<AccountingSettings> | null = null;

async function loadFromDb(): Promise<AccountingSettings> {
  const existing = await prisma.accountingSettings.findUnique({
    where: { id: DEFAULT_ID },
  });
  if (existing) return existing;
  return prisma.accountingSettings.create({
    data: { id: DEFAULT_ID, productionCosts: {} },
  });
}

export async function getOrCreateAccountingSettings(): Promise<AccountingSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inflight) return inflight;

  inflight = loadFromDb()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Drop the cached accounting settings; call this whenever the row is
 * mutated so subsequent reads pick up the latest values immediately
 * instead of waiting for the TTL to expire.
 */
export function invalidateAccountingSettings(): void {
  cached = null;
}
