/**
 * One-shot import of full-period MAIB EXTRAS TXT (and optional card caret CSV)
 * into bank_statements / bank_transactions, then run auto-match.
 *
 * Usage:
 *   npx tsx scripts/import-maib-extras.ts
 */
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { parseStatement, type StatementFormat } from "../src/lib/bankStatement";
import { getOrCreateCompanyProfile } from "../src/lib/invoice/companyProfile";
import { runAutoMatch } from "../src/lib/reconciliation/autoMatch";

type ImportSpec = {
  path: string;
  format: StatementFormat;
  fileName: string;
};

const FILES: ImportSpec[] = [
  {
    path: "/Users/anvi/Downloads/Extras cont curent .txt",
    format: "maib_extras_txt",
    fileName: "extras-cont-curent-2023-2026.txt",
  },
  {
    path: "/Users/anvi/Downloads/Extras cont .txt",
    format: "maib_extras_txt",
    fileName: "extras-cont-card-2023-2025.txt",
  },
  // card2026.txt overlaps existing K1/K2 card CSVs (same NDOC/date/amount);
  // skip it — dedupeKey can diverge when purpose/IBAN normalization differs.
];

async function importOne(spec: ImportSpec, ourFiscalCode: string, userId: string | null) {
  const content = readFileSync(spec.path, "utf8");
  const parsed = parseStatement(spec.format, content, { ourFiscalCode });

  const headerBad = parsed.warnings.some((w) => w.line === 1);
  if (parsed.transactions.length === 0 && headerBad) {
    throw new Error(`${spec.fileName}: unrecognized format — ${parsed.warnings[0]?.message}`);
  }

  const credits = parsed.transactions.filter((t) => t.direction === "CREDIT").length;
  console.log(
    `\n=== ${spec.fileName} (${spec.format}) ===\n` +
      `IBAN: ${parsed.accountIban}\n` +
      `Period: ${parsed.periodFrom?.toISOString().slice(0, 10)} → ${parsed.periodTo?.toISOString().slice(0, 10)}\n` +
      `Parsed: ${parsed.transactions.length} (credits: ${credits}), warnings: ${parsed.warnings.length}`,
  );

  const statement = await prisma.bankStatement.create({
    data: {
      fileName: spec.fileName,
      format: spec.format,
      accountIban: parsed.accountIban,
      openingBalance: parsed.openingBalance,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      currency: parsed.currency,
      status: "PARSED",
      rowCount: parsed.transactions.length,
      errorReport:
        parsed.warnings.length > 0
          ? (parsed.warnings.slice(0, 50) as unknown as Prisma.InputJsonValue)
          : undefined,
      uploadedById: userId,
    },
  });

  const inserted = await prisma.bankTransaction.createMany({
    data: parsed.transactions.map((tx) => ({
      statementId: statement.id,
      bookingDate: tx.bookingDate,
      valueDate: tx.valueDate,
      direction: tx.direction,
      amount: tx.amount,
      currency: tx.currency,
      counterpartyName: tx.counterpartyName,
      counterpartyIdno: tx.counterpartyIdno,
      counterpartyIban: tx.counterpartyIban,
      purpose: tx.purpose,
      documentNumber: tx.documentNumber,
      bankRef: tx.bankRef,
      txTypeCode: tx.txTypeCode,
      dedupeKey: tx.dedupeKey,
    })),
    skipDuplicates: true,
  });

  console.log(
    `Statement ${statement.id}: inserted ${inserted.count}, ` +
      `duplicates skipped ${parsed.transactions.length - inserted.count}`,
  );

  // Spot-check key counterparties in this batch
  for (const idno of ["1024600060562", "1003600029104"] as const) {
    const n = await prisma.bankTransaction.count({
      where: { statementId: statement.id, counterpartyIdno: idno, direction: "CREDIT" },
    });
    if (n > 0) console.log(`  credits for ${idno}: ${n}`);
  }

  return { statementId: statement.id, inserted: inserted.count, parsed: parsed.transactions.length };
}

async function main() {
  const profile = await getOrCreateCompanyProfile();
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
  });

  const results = [];
  for (const spec of FILES) {
    results.push(await importOne(spec, profile.fiscalCode, admin?.id ?? null));
  }

  console.log("\n=== Auto-match ===");
  const match = await runAutoMatch({ autoApply: true });
  console.log(JSON.stringify(match, null, 2));

  // Verify GOLDEN YARD / PRUT credit totals in DB
  for (const [name, idno] of [
    ["GOLDEN YARD", "1024600060562"],
    ["PRUT", "1003600029104"],
  ] as const) {
    const credits = await prisma.bankTransaction.findMany({
      where: { counterpartyIdno: idno, direction: "CREDIT" },
      select: { amount: true, bookingDate: true, purpose: true, statement: { select: { fileName: true } } },
      orderBy: { bookingDate: "asc" },
    });
    const total = credits.reduce((s, c) => s + Number(c.amount), 0);
    console.log(`\n${name} (${idno}): ${credits.length} credits, total ${total.toFixed(2)}`);
    for (const c of credits.slice(-8)) {
      console.log(
        `  ${c.bookingDate.toISOString().slice(0, 10)} ${c.amount} [${c.statement.fileName}] ${(c.purpose ?? "").slice(0, 70)}`,
      );
    }
  }

  console.log("\nDone.", results);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
