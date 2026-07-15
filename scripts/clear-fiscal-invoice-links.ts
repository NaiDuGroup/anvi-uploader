/**
 * Clear Cont spre plata links on fiscal invoices (FiscalInvoice.invoiceId).
 * Cont and e-Factura are independent; auto-guess by amount was removed.
 *
 * Usage: npx tsx scripts/clear-fiscal-invoice-links.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await prisma.fiscalInvoice.updateMany({
    where: { invoiceId: { not: null } },
    data: { invoiceId: null },
  });
  console.log(`Cleared invoiceId on ${result.count} fiscal invoice(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
