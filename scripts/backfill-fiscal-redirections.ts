/**
 * Backfill FiscalInvoice.redirections from stored rawPayload XML.
 *
 * Usage: npx tsx scripts/backfill-fiscal-redirections.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { parseInvoiceXml } from "../src/lib/efactura/parseInvoiceXml";
import { isNonDeliveryFiscal } from "../src/lib/reconciliation/fiscalFlags";

function extractXml(rawPayload: unknown): string | null {
  if (typeof rawPayload === "string") {
    const t = rawPayload.trim();
    if (t.startsWith("<")) return t;
    try {
      const decoded = JSON.parse(t);
      if (typeof decoded === "string" && decoded.includes("<")) return decoded;
    } catch {
      /* ignore */
    }
    return t.includes("<") ? t : null;
  }
  if (rawPayload && typeof rawPayload === "object") {
    const o = rawPayload as Record<string, unknown>;
    for (const key of ["xml", "Xml", "invoiceXml", "xmlContent", "content"]) {
      if (typeof o[key] === "string" && (o[key] as string).includes("<")) {
        return o[key] as string;
      }
    }
  }
  return null;
}

async function main() {
  const rows = await prisma.fiscalInvoice.findMany({
    where: { rawPayload: { not: Prisma.DbNull } },
    select: {
      id: true,
      seria: true,
      number: true,
      buyerName: true,
      buyerIdno: true,
      totalAmount: true,
      rawPayload: true,
    },
  });

  let updated = 0;
  let nonLivrare = 0;
  const samples: string[] = [];

  for (const row of rows) {
    const xml = extractXml(row.rawPayload);
    if (!xml) continue;
    const parsed = parseInvoiceXml(xml);
    const redirections = parsed.redirections?.trim() || null;
    if (!redirections) continue;

    await prisma.fiscalInvoice.update({
      where: { id: row.id },
      data: { redirections },
    });
    updated++;

    if (isNonDeliveryFiscal(redirections)) {
      nonLivrare++;
      samples.push(
        `${row.seria}${row.number} ${row.buyerName ?? "?"} (${row.buyerIdno}) ${row.totalAmount} [${redirections}]`,
      );
    }
  }

  console.log({ scanned: rows.length, updated, nonLivrare });
  for (const s of samples) console.log("  ", s);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
