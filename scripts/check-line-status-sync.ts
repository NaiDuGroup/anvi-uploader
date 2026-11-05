/**
 * Read-only invariant check: does every order line's `productionStatus` match
 * `lineStatusForOrderStatus(order.status)`? ISSUE orders are skipped; trashed
 * (soft-deleted) orders are checked too. Runs in a READ ONLY transaction and
 * never writes.
 *
 * Usage:
 *   npx tsx scripts/check-line-status-sync.ts            # DATABASE_URL from .env
 *   npx tsx scripts/check-line-status-sync.ts --json     # machine-readable
 *   npx tsx --env-file=<file> scripts/check-line-status-sync.ts   # another DB (e.g. prod), read-only
 *
 * Exit code 0: no mismatches; 1: mismatches found (listed); 2: error.
 */
import { prisma } from "../src/lib/prisma";
import { checkLineStatusSync } from "../src/lib/orderLineStatusCheck";

const MAX_LISTED = 50;

async function main() {
  const json = process.argv.includes("--json");
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host || "?";
    } catch {
      return "?";
    }
  })();
  const res = await checkLineStatusSync(prisma);
  if (json) {
    console.log(JSON.stringify({ host, ...res }, null, 2));
  } else {
    console.log(
      `[${host}] orders checked: ${res.ordersChecked}, lines: ${res.linesChecked}, ISSUE orders skipped: ${res.ordersSkipped}`,
    );
    console.log(`mismatched orders: ${res.mismatches.length}`);
    for (const m of res.mismatches.slice(0, MAX_LISTED)) {
      const lines = m.lines.map((l) => `#${l.sortOrder + 1}=${l.productionStatus}`).join(", ");
      console.log(
        `  order ${m.orderNumber}${m.deleted ? " (trash)" : ""} status=${m.orderStatus} expected=${m.expected}: ${lines}`,
      );
    }
    if (res.mismatches.length > MAX_LISTED) console.log(`  … and ${res.mismatches.length - MAX_LISTED} more`);
  }
  process.exitCode = res.mismatches.length > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
