/**
 * Runs the e-Factura sync (sales + incoming supplier invoices) from this
 * machine and writes into the production database. SFS answers Vercel's IPs
 * with nginx 403, so until a Moldovan relay exists this is the way to pull
 * invoices: run it from a Moldovan network.
 *
 * e-Factura credentials come from `.env`; the target database from `.env.prod`.
 *
 * Usage: npm run efactura:sync:local -- [--days=90] [--no-sales] [--no-purchases]
 */
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";

const TARGET_ENV_FILE = ".env.prod";
const DEFAULT_PURCHASE_LOOKBACK_DAYS = 90;
const ENRICH_CHUNK_LIMIT = 50;
const MAX_ENRICH_CHUNKS = 40;
const MAX_PURCHASE_ROUNDS = 20;
const KEEP_ALIVE_INTERVAL_MS = 60_000;

type Options = { purchaseDays: number; sales: boolean; purchases: boolean };

function parseOptions(argv: readonly string[]): Options {
  const daysArg: string | undefined = argv.find((a) => a.startsWith("--days="));
  const days: number = daysArg ? Number(daysArg.slice("--days=".length)) : DEFAULT_PURCHASE_LOOKBACK_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > 730) {
    throw new Error(`--days must be an integer between 1 and 730, got "${daysArg}"`);
  }
  return {
    purchaseDays: days,
    sales: !argv.includes("--no-sales"),
    purchases: !argv.includes("--no-purchases"),
  };
}

function loadEnvironment(): string {
  config({ path: ".env", quiet: true });
  const target: Record<string, string> = parse(readFileSync(TARGET_ENV_FILE));
  const url: string | undefined = target.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is missing in ${TARGET_ENV_FILE}`);
  process.env.DATABASE_URL = url;
  process.env.DIRECT_DATABASE_URL = target.DIRECT_DATABASE_URL || url;
  return new URL(url).host;
}

async function syncSales(): Promise<void> {
  const { syncFiscalInvoices, enrichFiscalInvoiceDetails } = await import("../src/lib/efactura/sync");
  const { runAutoMatch } = await import("../src/lib/reconciliation/autoMatch");

  console.log("Sales: discovering invoices…");
  const sync = await syncFiscalInvoices();
  console.log("Sales: sync", sync);

  let processed = 0;
  let remaining = 0;
  for (let i = 0; i < MAX_ENRICH_CHUNKS; i++) {
    const enrich = await enrichFiscalInvoiceDetails({ limit: ENRICH_CHUNK_LIMIT });
    processed += enrich.processed;
    remaining = enrich.remaining;
    console.log(`Sales: details ${processed} loaded, ${remaining} remaining`);
    if (enrich.remaining <= 0 || enrich.processed === 0) break;
  }

  const match = await runAutoMatch({ autoApply: true });
  console.log("Sales: bank auto-match", match);
}

async function syncPurchases(lookbackDays: number): Promise<void> {
  const { syncPurchaseInvoices } = await import("../src/lib/purchasing/syncPurchaseInvoices");
  for (let round = 1; round <= MAX_PURCHASE_ROUNDS; round++) {
    const result = await syncPurchaseInvoices({ lookbackDays });
    console.log(`Purchases: round ${round}`, result);
    const finished: boolean = result.remainingDetails === 0 && result.failedDetails === 0;
    if (result.skipped || finished || result.imported === 0) return;
  }
}

async function main(): Promise<void> {
  const options: Options = parseOptions(process.argv.slice(2));
  const host: string = loadEnvironment();
  console.log(`Target database: ${host}`);

  const { isEFacturaLive } = await import("../src/lib/efactura");
  if (!isEFacturaLive()) {
    throw new Error("EFACTURA_MODE=live and EFACTURA_USERNAME/PASSWORD must be set in .env");
  }

  const { prisma } = await import("../src/lib/prisma");
  // SFS calls can run for many minutes; Neon suspends idle computes after ~5 min and drops the connection.
  const keepAlive: NodeJS.Timeout = setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch((error: unknown) => console.warn("DB keep-alive failed:", error));
  }, KEEP_ALIVE_INTERVAL_MS);

  try {
    if (options.sales) await syncSales();
    if (options.purchases) await syncPurchases(options.purchaseDays);
  } finally {
    clearInterval(keepAlive);
    await prisma.$disconnect();
  }
  console.log("Done.");
}

main().catch((error: unknown) => {
  console.error("e-Factura local sync failed:", error);
  process.exit(1);
});
