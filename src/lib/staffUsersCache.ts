import { prisma } from "./prisma";

/**
 * In-process TTL cache for staff-user display names.
 *
 * `fetchOrdersData` previously issued a `prisma.user.findMany({ where: { id: { in: userIds } } })`
 * AFTER the main `Promise.all` batch — a sequential round-trip to Neon on
 * every `/api/orders` call. The total set of staff (admin / superadmin /
 * workshop) is small (single-digit count today) and changes rarely, so we
 * load all of them at once and reuse the result for `STAFF_USERS_TTL_MS`.
 *
 * The cache lives per Node.js process. On Vercel each warm Lambda keeps its
 * own copy; cold invocations pay one extra round-trip on the first call and
 * then reuse it for subsequent invocations within the TTL.
 *
 * The cache covers `assignedTo`, `createdBy`, and `sentToWorkshopBy` lookups.
 * Customer-portal users (`role = "customer"`) are intentionally excluded —
 * their names never appear in admin order rows.
 */
const STAFF_USERS_TTL_MS = 60_000;

interface StaffUsersCacheEntry {
  expiresAt: number;
  map: Map<string, string>;
  loading?: Promise<Map<string, string>>;
}

let cache: StaffUsersCacheEntry | null = null;

async function loadStaffUsersMap(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { role: { not: "customer" } },
    select: { id: true, name: true, displayName: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.id, u.displayName ?? u.name);
  }
  return map;
}

/**
 * Returns a cached `Map<userId, displayName>` covering all staff users.
 * Multiple concurrent callers within the same warm process share a single
 * in-flight `findMany` via the `loading` promise.
 */
export async function getStaffUsersMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.map;
  }
  if (cache?.loading) {
    return cache.loading;
  }

  const previousMap = cache?.map ?? new Map<string, string>();
  const loading = loadStaffUsersMap()
    .then((map) => {
      cache = { expiresAt: Date.now() + STAFF_USERS_TTL_MS, map };
      return map;
    })
    .catch((err) => {
      cache = null;
      throw err;
    });

  cache = {
    expiresAt: now,
    map: previousMap,
    loading,
  };
  return loading;
}

/**
 * Test / admin-tooling helper: drop the cache so the next read goes to the DB.
 */
export function invalidateStaffUsersCache(): void {
  cache = null;
}
