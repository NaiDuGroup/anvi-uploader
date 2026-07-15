/**
 * Remove bank_transactions that were imported twice (CSV + EXTRAS TXT) because
 * the old dedupeKey included purpose text that wraps differently across formats.
 *
 * Keeps the best row per business key, rehashes survivors with the stable key,
 * and refreshes fiscalInvoice.paidAt from remaining allocations.
 *
 * Usage: npx tsx scripts/cleanup-duplicate-bank-txs.ts
 */
import { prisma } from "../src/lib/prisma";
import { buildBankTxDedupeKey } from "../src/lib/bankStatement/dedupeKey";

type TxRow = {
  id: string;
  bookingDate: Date;
  direction: string;
  amount: { toString(): string };
  documentNumber: string | null;
  counterpartyIdno: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  matchStatus: string;
  createdAt: Date;
  statementId: string;
  statement: { accountIban: string | null; format: string; fileName: string };
  allocations: { id: string }[];
};

function businessKey(tx: TxRow): string {
  return [
    tx.direction,
    tx.bookingDate.toISOString().slice(0, 10),
    Number(tx.amount.toString()).toFixed(2),
    (tx.documentNumber ?? "").trim(),
    (tx.counterpartyIdno ?? "").trim(),
    (tx.statement.accountIban ?? "").trim().toUpperCase(),
  ].join("|");
}

function score(tx: TxRow): number {
  let s = 0;
  if (tx.allocations.length > 0) s += 1000 + tx.allocations.length;
  if (tx.matchStatus === "MATCHED") s += 100;
  if (tx.matchStatus === "SUGGESTED") s += 10;
  // Prefer original CSV imports over the full extras dump.
  if (tx.statement.format !== "maib_extras_txt") s += 5;
  // Older row wins ties (first import).
  s -= tx.createdAt.getTime() / 1e15;
  return s;
}

async function main() {
  const txs = (await prisma.bankTransaction.findMany({
    select: {
      id: true,
      bookingDate: true,
      direction: true,
      amount: true,
      documentNumber: true,
      counterpartyIdno: true,
      counterpartyIban: true,
      purpose: true,
      matchStatus: true,
      createdAt: true,
      statementId: true,
      statement: { select: { accountIban: true, format: true, fileName: true } },
      allocations: { select: { id: true } },
    },
  })) as unknown as TxRow[];

  const groups = new Map<string, TxRow[]>();
  for (const tx of txs) {
    const k = businessKey(tx);
    const arr = groups.get(k) ?? [];
    arr.push(tx);
    groups.set(k, arr);
  }

  const toDelete: string[] = [];
  const affectedInvoiceIds = new Set<string>();
  let dupGroups = 0;
  let extraAmount = 0;

  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    dupGroups++;
    arr.sort((a, b) => score(b) - score(a));
    const [, ...losers] = arr;
    for (const loser of losers) {
      toDelete.push(loser.id);
      extraAmount += Number(loser.amount.toString());
    }
  }

  console.log({
    total: txs.length,
    dupGroups,
    toDelete: toDelete.length,
    extraAmount: extraAmount.toFixed(2),
  });

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
  } else {
    // Collect invoices linked to allocations we are about to cascade-delete.
    const allocs = await prisma.paymentAllocation.findMany({
      where: { bankTransactionId: { in: toDelete } },
      select: { fiscalInvoiceId: true },
    });
    for (const a of allocs) {
      if (a.fiscalInvoiceId) affectedInvoiceIds.add(a.fiscalInvoiceId);
    }

    // Delete in chunks
    const chunk = 200;
    for (let i = 0; i < toDelete.length; i += chunk) {
      const ids = toDelete.slice(i, i + chunk);
      const r = await prisma.bankTransaction.deleteMany({ where: { id: { in: ids } } });
      console.log(`deleted ${r.count} (${i + r.count}/${toDelete.length})`);
    }
  }

  // Rehash surviving rows so future re-imports hit the unique constraint.
  const survivors = await prisma.bankTransaction.findMany({
    select: {
      id: true,
      bookingDate: true,
      direction: true,
      amount: true,
      documentNumber: true,
      counterpartyIdno: true,
      counterpartyIban: true,
      purpose: true,
      statement: { select: { accountIban: true } },
    },
  });

  let rehashed = 0;
  let collisions = 0;
  const seen = new Map<string, string>();
  for (const tx of survivors) {
    const key = buildBankTxDedupeKey({
      accountIban: tx.statement.accountIban,
      bookingDate: tx.bookingDate,
      direction: tx.direction as "CREDIT" | "DEBIT",
      amount: Number(tx.amount.toString()).toFixed(2),
      documentNumber: tx.documentNumber,
      counterpartyIban: tx.counterpartyIban,
      counterpartyIdno: tx.counterpartyIdno,
      purpose: tx.purpose,
    });
    if (seen.has(key)) {
      collisions++;
      // Still a collision after cleanup — drop this one.
      await prisma.bankTransaction.delete({ where: { id: tx.id } });
      continue;
    }
    seen.set(key, tx.id);
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: { dedupeKey: key },
    });
    rehashed++;
    if (rehashed % 500 === 0) console.log(`rehashed ${rehashed}`);
  }
  console.log({ rehashed, collisionsRemoved: collisions });

  // Refresh statement row counts
  const statements = await prisma.bankStatement.findMany({ select: { id: true } });
  for (const s of statements) {
    const rowCount = await prisma.bankTransaction.count({ where: { statementId: s.id } });
    await prisma.bankStatement.update({ where: { id: s.id }, data: { rowCount } });
  }

  // Refresh paidAt for invoices that lost allocations
  if (affectedInvoiceIds.size > 0) {
    for (const id of affectedInvoiceIds) {
      const [inv, allocated] = await Promise.all([
        prisma.fiscalInvoice.findUnique({
          where: { id },
          select: { totalAmount: true, seria: true, number: true },
        }),
        prisma.paymentAllocation.aggregate({
          where: { fiscalInvoiceId: id },
          _sum: { amount: true },
        }),
      ]);
      if (!inv) continue;
      const paid = Number(allocated._sum.amount ?? 0);
      const total = Number(inv.totalAmount);
      const fullyPaid = paid + 0.005 >= total;
      await prisma.fiscalInvoice.update({
        where: { id },
        data: { paidAt: fullyPaid ? new Date() : null },
      });
    }
    console.log("refreshed paidAt for", affectedInvoiceIds.size, "invoices");
  }

  // Spot-check BACKSTAGEIT
  const idno = "1021600009948";
  const credits = await prisma.bankTransaction.aggregate({
    where: { direction: "CREDIT", counterpartyIdno: idno },
    _sum: { amount: true },
    _count: true,
  });
  const invoiced = await prisma.fiscalInvoice.aggregate({
    where: { buyerIdno: idno },
    _sum: { totalAmount: true },
    _count: true,
  });
  console.log("BACKSTAGEIT after cleanup:", {
    credits: credits._count,
    creditSum: credits._sum.amount?.toString(),
    invoices: invoiced._count,
    invoiceSum: invoiced._sum.totalAmount?.toString(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
