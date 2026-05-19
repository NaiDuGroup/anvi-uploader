import type { InkInventory, Prisma, PrismaClient } from "@prisma/client";
import type { PrintProcess } from "@/lib/printProcess";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";
import { prisma } from "@/lib/prisma";

/**
 * Ink-inventory rows ("tanks") rarely change — they are mutated by
 * stock receipts and order-line ink deductions. The wizard bootstrap
 * and print-economics readers hit the row on every render, which adds
 * a Neon round-trip. Cache the row in-process per print process for a
 * short TTL; mutations call {@link invalidateInkInventory} so live
 * stock numbers are picked up on the next read.
 */
const TTL_MS = 60_000;

interface CacheEntry {
  value: InkInventory;
  expiresAt: number;
}

const cache = new Map<PrintProcess, CacheEntry>();
const inflight = new Map<PrintProcess, Promise<InkInventory>>();

async function loadFromDb(
  tx: Prisma.TransactionClient | PrismaClient,
  printProcess: PrintProcess,
): Promise<InkInventory> {
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

export async function getOrCreateInkInventory(
  tx: Prisma.TransactionClient | PrismaClient,
  printProcess: PrintProcess = DEFAULT_PRINT_PROCESS,
): Promise<InkInventory> {
  // Inside a transaction the caller needs to see its own pending
  // writes; only cache when the global prisma singleton is passed in.
  if (tx !== prisma) {
    return loadFromDb(tx, printProcess);
  }

  const now = Date.now();
  const entry = cache.get(printProcess);
  if (entry && entry.expiresAt > now) return entry.value;

  const pending = inflight.get(printProcess);
  if (pending) return pending;

  const promise = loadFromDb(tx, printProcess)
    .then((value) => {
      cache.set(printProcess, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      inflight.delete(printProcess);
    });
  inflight.set(printProcess, promise);
  return promise;
}

/**
 * Drop cached ink-inventory rows so the next read re-fetches from
 * Neon. Pass a specific print process to invalidate only that tank, or
 * call without arguments to clear every cached entry.
 */
export function invalidateInkInventory(printProcess?: PrintProcess): void {
  if (printProcess) {
    cache.delete(printProcess);
  } else {
    cache.clear();
  }
}
