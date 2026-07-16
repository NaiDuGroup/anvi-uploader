/**
 * One-off: rebuild SALON SLIMS (1021600004437) allocations on prod/local.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_DATABASE_URL=... npx tsx scripts/fix-salon-slims-allocations.ts
 */
import { PrismaClient } from "@prisma/client";
import { applyAllocation } from "../src/lib/reconciliation/autoMatch";
import { suggestHistoricalDocument } from "../src/lib/reconciliation/match";

const BUYER = "1021600004437";

const TX = {
  aaQ43: "7b1d0644-cb37-485c-96fe-327a968400e4", // 780 AAQ4557643
  aaQ41: "50258309-b3f7-40d7-9af7-0d6b6a9e64a8", // 820 AAQ4557641
  eahPay: "eae8cd78-4495-47f6-87b2-e67cef21b04a", // 690 cites EAH
  eanPay: "6b72e658-6e1d-43ac-a5f7-b5d4af3f2427", // 5226 cites EAN
} as const;

async function unmatchTx(
  prisma: PrismaClient,
  txId: string,
): Promise<void> {
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
      const paid = sum._sum.amount ?? 0;
      if (fi.totalAmount == null || Number(paid) < Number(fi.totalAmount)) {
        await db.fiscalInvoice.update({
          where: { id: fiscalInvoiceId },
          data: { paidAt: null },
        });
      }
    }
    await db.bankTransaction.update({
      where: { id: txId },
      data: { matchStatus: "UNMATCHED", historicalDocument: null },
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const eah = await prisma.fiscalInvoice.findFirst({
      where: { buyerIdno: BUYER, seria: "EAH", number: "000507007" },
      select: { id: true, totalAmount: true },
    });
    const ean = await prisma.fiscalInvoice.findFirst({
      where: { buyerIdno: BUYER, seria: "EAN", number: "000367103" },
      select: { id: true, totalAmount: true },
    });
    if (!eah || !ean) {
      throw new Error("Missing EAH/EAN fiscal invoices for SALON SLIMS");
    }

    console.log("Unmatching 4 transactions...");
    for (const id of Object.values(TX)) {
      await unmatchTx(prisma, id);
    }

    console.log("Allocating EAH payment → EAH000507007...");
    await prisma.$transaction((db) =>
      applyAllocation(db, {
        bankTransactionId: TX.eahPay,
        fiscalInvoiceId: eah.id,
        amount: "690.00",
        matchedBy: "MANUAL",
        note: "fix-salon-slims: purpose cites EAH",
      }),
    );

    console.log("Allocating EAN payment → EAN000367103...");
    await prisma.$transaction((db) =>
      applyAllocation(db, {
        bankTransactionId: TX.eanPay,
        fiscalInvoiceId: ean.id,
        amount: "5226.00",
        matchedBy: "MANUAL",
        note: "fix-salon-slims: purpose cites EAN",
      }),
    );

    console.log("Marking AAQ payments HISTORICAL...");
    for (const id of [TX.aaQ43, TX.aaQ41]) {
      const tx = await prisma.bankTransaction.findUniqueOrThrow({
        where: { id },
        select: { purpose: true },
      });
      await prisma.bankTransaction.update({
        where: { id },
        data: {
          matchStatus: "HISTORICAL",
          historicalDocument: suggestHistoricalDocument(tx.purpose),
        },
      });
    }

    const summary = await prisma.bankTransaction.findMany({
      where: { id: { in: Object.values(TX) } },
      select: {
        id: true,
        amount: true,
        matchStatus: true,
        historicalDocument: true,
        allocations: {
          select: {
            amount: true,
            fiscalInvoice: { select: { seria: true, number: true } },
          },
        },
      },
      orderBy: { bookingDate: "asc" },
    });
    console.log(JSON.stringify(summary, null, 2));
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
