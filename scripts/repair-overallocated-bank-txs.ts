/**
 * Unmatch bank CREDITS whose allocations exceed the payment amount, then
 * re-run auto-match (requires the alloc-cap fix in autoMatch.ts).
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_DATABASE_URL=... npx tsx scripts/repair-overallocated-bank-txs.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { runAutoMatch } from "../src/lib/reconciliation/autoMatch";

const ZERO = new Prisma.Decimal(0);

async function unmatchTx(prisma: PrismaClient, txId: string): Promise<void> {
  const allocations = await prisma.paymentAllocation.findMany({
    where: { bankTransactionId: txId },
    select: { fiscalInvoiceId: true },
  });
  const fiscalIds = [
    ...new Set(
      allocations
        .map((a) => a.fiscalInvoiceId)
        .filter((v): v is string => !!v),
    ),
  ];

  await prisma.$transaction(async (db) => {
    await db.paymentAllocation.deleteMany({ where: { bankTransactionId: txId } });
    for (const fiscalInvoiceId of fiscalIds) {
      const fi = await db.fiscalInvoice.findUnique({
        where: { id: fiscalInvoiceId },
        select: { id: true, totalAmount: true, paidAt: true },
      });
      if (!fi?.paidAt) continue;
      const sum = await db.paymentAllocation.aggregate({
        where: { fiscalInvoiceId },
        _sum: { amount: true },
      });
      const paid = sum._sum.amount ?? ZERO;
      if (fi.totalAmount == null || paid.lessThan(fi.totalAmount)) {
        await db.fiscalInvoice.update({
          where: { id: fiscalInvoiceId },
          data: { paidAt: null },
        });
      }
    }
    await db.bankTransaction.update({
      where: { id: txId },
      data: {
        matchStatus: "UNMATCHED",
        historicalDocument: null,
      },
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; amount: Prisma.Decimal; alloc_sum: Prisma.Decimal }>
    >`
      SELECT bt.id, bt.amount,
             COALESCE(SUM(pa.amount), 0) AS alloc_sum
      FROM bank_transactions bt
      JOIN payment_allocations pa ON pa.bank_transaction_id = bt.id
      WHERE bt.direction = 'CREDIT'
      GROUP BY bt.id
      HAVING COALESCE(SUM(pa.amount), 0) > bt.amount + 0.005
      ORDER BY (COALESCE(SUM(pa.amount), 0) - bt.amount) DESC
    `;

    // Also reset the PRUT 5000 leftover that shows a false overpayment.
    const extraIds = ["e072e4ab-fb17-4de3-921a-e9a0a419bad8"];
    const ids = [...new Set([...rows.map((r) => r.id), ...extraIds])];

    console.log(`Over-allocated txs: ${rows.length}; total to unmatch: ${ids.length}`);
    for (const r of rows) {
      console.log(
        `  ${r.id} amount=${r.amount} alloc=${r.alloc_sum} over=${new Prisma.Decimal(r.alloc_sum).minus(r.amount)}`,
      );
    }

    for (const id of ids) {
      console.log(`Unmatching ${id}...`);
      await unmatchTx(prisma, id);
    }

    console.log("Running auto-match...");
    const result = await runAutoMatch({ autoApply: true });
    console.log(result);

    const still = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT bt.id
        FROM bank_transactions bt
        JOIN payment_allocations pa ON pa.bank_transaction_id = bt.id
        WHERE bt.direction = 'CREDIT'
        GROUP BY bt.id
        HAVING COALESCE(SUM(pa.amount), 0) > bt.amount + 0.005
      ) t
    `;
    console.log("Still over-allocated:", Number(still[0]?.n ?? 0));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
