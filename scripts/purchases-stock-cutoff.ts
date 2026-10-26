/**
 * Stock cut-off: marks open purchase-invoice lines dated before the inventory
 * day as ignored, so only invoices from that day on are posted into stock
 * (the inventory count sets the opening balance).
 *
 * Unlike «ignore» in the purchases screen, no supplier mapping is written —
 * the same item names keep posting normally after the cut-off. A marked line
 * can be re-opened from the purchases screen like any ignored line.
 *
 * The line date is the delivery date, else the issue date (as for receipts).
 * Safe to re-run: October invoices that arrive in November are picked up then.
 *
 * Usage:
 *   npm run purchases:cutoff -- --before=2026-11-01            # dry run, local DB
 *   npm run purchases:cutoff -- --before=2026-11-01 --apply    # write, local DB
 *   npm run purchases:cutoff -- --before=2026-11-01 --prod --apply   # write, DB from .env.prod
 */
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";

type Options = { before: Date; apply: boolean; prod: boolean };

function parseOptions(argv: readonly string[]): Options {
  const arg: string | undefined = argv.find((a) => a.startsWith("--before="));
  const raw: string = arg?.slice("--before=".length) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`--before=YYYY-MM-DD is required, got "${raw}"`);
  }
  const before = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(before.getTime())) throw new Error(`Invalid date "${raw}"`);
  return { before, apply: argv.includes("--apply"), prod: argv.includes("--prod") };
}

function loadEnvironment(prod: boolean): string {
  config({ path: ".env", quiet: true });
  if (prod) {
    const target: Record<string, string> = parse(readFileSync(".env.prod"));
    if (!target.DATABASE_URL) throw new Error("DATABASE_URL is missing in .env.prod");
    process.env.DATABASE_URL = target.DATABASE_URL;
    process.env.DIRECT_DATABASE_URL = target.DIRECT_DATABASE_URL || target.DATABASE_URL;
  }
  const url: string | undefined = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new URL(url).host;
}

async function main(): Promise<void> {
  const options: Options = parseOptions(process.argv.slice(2));
  const host: string = loadEnvironment(options.prod);
  const { prisma } = await import("../src/lib/prisma");
  const { refreshInvoiceStatus } = await import("../src/lib/purchasing/postPurchaseLine");
  const { PurchaseLineStatus, StockTargetKind } = await import("../src/lib/purchasing/types");

  const day: string = options.before.toISOString().slice(0, 10);
  console.log(`Database: ${host}`);
  console.log(`Cut-off: lines dated before ${day}${options.apply ? "" : " (dry run — add --apply to write)"}`);

  const openStatuses: string[] = [PurchaseLineStatus.Unmatched, PurchaseLineStatus.Suggested];
  const candidates = await prisma.purchaseInvoiceLine.findMany({
    where: {
      status: { in: openStatuses },
      invoice: {
        OR: [
          { deliveryDate: { lt: options.before } },
          { deliveryDate: null, issueDate: { lt: options.before } },
        ],
      },
    },
    select: { id: true, invoiceId: true, totalExVat: true },
  });
  const undated: number = await prisma.purchaseInvoiceLine.count({
    where: { status: { in: openStatuses }, invoice: { deliveryDate: null, issueDate: null } },
  });

  const invoiceIds: string[] = [...new Set(candidates.map((l) => l.invoiceId))];
  const sum: number = candidates.reduce((s, l) => s + Number(l.totalExVat), 0);
  console.log(`Open lines to mark: ${candidates.length} in ${invoiceIds.length} invoices, ${sum.toFixed(2)} MDL ex VAT`);
  if (undated > 0) console.log(`Skipped: ${undated} open lines on invoices without any date`);

  if (!options.apply || candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  const ids: string[] = candidates.map((l) => l.id);
  await prisma.$transaction(
    async (tx) => {
      await tx.purchaseInvoiceLine.updateMany({
        // Status re-checked so a line posted meanwhile is left alone.
        where: { id: { in: ids }, status: { in: openStatuses } },
        data: {
          status: PurchaseLineStatus.Ignored,
          postedKind: StockTargetKind.Ignore,
          postedTargetId: null,
          postedQuantity: 0,
          postedCostMdl: 0,
          postedAt: now,
          postedAuto: false,
        },
      });
      for (const invoiceId of invoiceIds) await refreshInvoiceStatus(tx, invoiceId);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const left: number = await prisma.purchaseInvoiceLine.count({
    where: { status: { in: openStatuses }, id: { in: ids } },
  });
  console.log(`Marked ${ids.length - left} lines as ignored; invoice statuses refreshed.`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
