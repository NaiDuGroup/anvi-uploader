import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * After `prisma generate`, the old singleton on `globalThis` can still be the
 * previous PrismaClient shape (missing `studioCustomer`), which causes
 * `undefined.findFirst`. Recreate when the delegate is missing.
 */
function studioCustomerReady(p: PrismaClient): boolean {
  const sc = (p as unknown as { studioCustomer?: { findFirst?: unknown } })
    .studioCustomer;
  return sc != null && typeof sc.findFirst === "function";
}

function resolvePrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && studioCustomerReady(existing)) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
  }
  const fresh = new PrismaClient();
  if (!studioCustomerReady(fresh)) {
    void fresh.$disconnect().catch(() => {});
    const msg =
      "Prisma client is missing model `studioCustomer` (StudioCustomer). Run `npx prisma generate`, then restart the dev server.";
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
