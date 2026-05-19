import { prisma } from "./prisma";

/**
 * In-process TTL cache for the "needs procurement, created today" counter.
 *
 * The number drives the procurement badge in the admin orders header. It
 * changes only when a new order is created (or someone toggles
 * `needsProcurement`), neither of which happens on the polling cadence
 * the admin page uses for `/api/orders` (every 10 s). Counting on every
 * poll is therefore a wasted DB round-trip.
 *
 * We cache the count for 60 s per process (per role variant). On Vercel each
 * warm Lambda gets its own copy; cold calls pay one extra round-trip on the
 * first call and reuse it for subsequent invocations within the TTL.
 */
const PROCUREMENT_TODAY_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  count: number;
  loading?: Promise<number>;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(role: string): string {
  return role === "workshop" ? "workshop" : "default";
}

async function loadCount(role: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.order.count({
    where: {
      deletedAt: null,
      needsProcurement: true,
      createdAt: { gte: startOfDay },
      ...(role === "workshop" ? { isWorkshop: true } : {}),
    },
  });
}

/**
 * Returns the cached procurement-today count for the given role,
 * refreshing in the background once per `PROCUREMENT_TODAY_TTL_MS`.
 *
 * Multiple concurrent callers within the same warm process share a
 * single in-flight count via the `loading` promise.
 */
export async function getProcurementTodayCount(role: string): Promise<number> {
  const key = cacheKey(role);
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.count;
  }
  if (entry?.loading) {
    return entry.loading;
  }

  const previousCount = entry?.count ?? 0;
  const loading = loadCount(role)
    .then((count) => {
      cache.set(key, { expiresAt: Date.now() + PROCUREMENT_TODAY_TTL_MS, count });
      return count;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, {
    expiresAt: now,
    count: previousCount,
    loading,
  });
  return loading;
}

/**
 * Test / admin-tooling helper.
 */
export function invalidateProcurementTodayCache(): void {
  cache.clear();
}
