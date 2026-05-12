import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * After `prisma generate`, the old singleton on `globalThis` can still be the
 * previous PrismaClient shape (missing delegates), which causes
 * `undefined.findFirst` / `undefined.findMany`. Recreate when any expected delegate is missing.
 */
function studioCustomerReady(p: PrismaClient): boolean {
  const sc = (p as unknown as { studioCustomer?: { findFirst?: unknown } })
    .studioCustomer;
  return sc != null && typeof sc.findFirst === "function";
}

function mugProductReady(p: PrismaClient): boolean {
  const mp = (p as unknown as { mugProduct?: { findMany?: unknown; fields?: Record<string, unknown> } }).mugProduct;
  if (mp == null || typeof mp.findMany !== "function") return false;
  // Field-level freshness check — catches the case where `prisma generate` ran
  // on disk but the dev server still has the old client cached in memory.
  return mp.fields != null && "printWidthCm" in mp.fields;
}

function mugStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { mugStockMovement?: { create?: unknown } })
    .mugStockMovement;
  return m != null && typeof m.create === "function";
}

function notebookProductReady(p: PrismaClient): boolean {
  const np = (p as unknown as { notebookProduct?: { findMany?: unknown; fields?: Record<string, unknown> } })
    .notebookProduct;
  if (np == null || typeof np.findMany !== "function") return false;
  return np.fields != null && "printWidthCm" in np.fields;
}

function notebookStockMovementReady(p: PrismaClient): boolean {
  const m = (p as unknown as { notebookStockMovement?: { create?: unknown } })
    .notebookStockMovement;
  return m != null && typeof m.create === "function";
}

/**
 * Matches current `schema.prisma` (`File` has no `order_item_id`). A cached
 * PrismaClient from a generate that still had `File.orderItemId` keeps selecting
 * that column → DB error once the column is dropped.
 *
 * When you restore `OrderItem` / `File.orderItemId` in schema, flip this check
 * to require `"orderItemId" in f.fields` or remove `fileModelMatchesSchema`.
 */
function fileModelMatchesSchema(p: PrismaClient): boolean {
  const f = (
    p as unknown as {
      file?: { fields?: Record<string, unknown> };
    }
  ).file;
  return (
    f != null &&
    f.fields != null &&
    typeof f.fields === "object" &&
    !("orderItemId" in f.fields)
  );
}

function prismaSingletonReady(p: PrismaClient): boolean {
  return (
    studioCustomerReady(p) &&
    mugProductReady(p) &&
    mugStockMovementReady(p) &&
    notebookProductReady(p) &&
    notebookStockMovementReady(p) &&
    fileModelMatchesSchema(p)
  );
}

function resolvePrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && prismaSingletonReady(existing)) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
  }
  const fresh = new PrismaClient();
  if (!prismaSingletonReady(fresh)) {
    void fresh.$disconnect().catch(() => {});
    const msg =
      "Prisma client is outdated (missing models). Run `npx prisma generate`, then restart the dev server.";
    console.error(`[prisma] ${msg}`);
    throw new Error(msg);
  }
  globalForPrisma.prisma = fresh;
  return fresh;
}

/**
 * Proxy so every access runs `resolvePrismaClient()` — fixes stale global
 * singleton in dev without requiring a manual server restart after generate.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    void receiver;
    const p = resolvePrismaClient();
    const value = Reflect.get(p, prop, p);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(p);
    }
    return value;
  },
});
