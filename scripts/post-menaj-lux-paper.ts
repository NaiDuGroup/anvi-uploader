/**
 * Posts S.C. «MENAJ LUX» S.R.L. SRA3 C2S paper (billed per kg) into the A4+
 * sheet papers: one SRA3 sheet = 2 A4+ (22.5 × 32 cm), sheets per kg from the
 * paper weight (105 g → 132.2751 … 350 g → 39.6825).
 *
 * Default plan: only the latest invoice line per paper (the owner counts the
 * rest in the stocktake); `--all` posts every C2S line. Lines that the
 * purchases screen marked «ignored» are re-opened and posted through the same
 * code as the screen (`unpostPurchaseLine` + `postPurchaseLine`), which also
 * remembers the supplier rule (one manual confirmation per line).
 *
 * Idempotent: posted lines are skipped. FEDRIGONI self-adhesive lines are
 * never touched.
 *
 * Usage:
 *   npx tsx scripts/post-menaj-lux-paper.ts                 # dry run, DATABASE_URL from .env
 *   npx tsx scripts/post-menaj-lux-paper.ts --apply         # write
 *   npx tsx scripts/post-menaj-lux-paper.ts --all [--apply] # every C2S line, not just the latest
 *   npx tsx scripts/post-menaj-lux-paper.ts --prod [--apply]   # DB from .env.prod (owner's OK only)
 */
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";

const SUPPLIER_IDNO = "1006600037216";

/** Latest Menaj Lux invoice per paper weight (owner's decision, 2026-11-05). */
const LATEST_LINES: ReadonlyArray<{ invoice: string; gsm: number }> = [
  { invoice: "EBF000928985", gsm: 105 },
  { invoice: "EBI000731248", gsm: 150 },
  { invoice: "EBM000565080", gsm: 200 },
  { invoice: "EBK000310327", gsm: 250 },
  { invoice: "EBM000565080", gsm: 300 },
  { invoice: "EBM000565080", gsm: 350 },
];

type Options = { apply: boolean; prod: boolean; all: boolean };

function parseOptions(argv: readonly string[]): Options {
  const known = new Set(["--apply", "--prod", "--all"]);
  const unknown: string[] = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(" ")}`);
  return { apply: argv.includes("--apply"), prod: argv.includes("--prod"), all: argv.includes("--all") };
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
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`;
}

async function main(): Promise<void> {
  const options: Options = parseOptions(process.argv.slice(2));
  const host: string = loadEnvironment(options.prod);
  const { prisma } = await import("../src/lib/prisma");
  const { postPurchaseLine, unpostPurchaseLine } = await import("../src/lib/purchasing/postPurchaseLine");
  const { invoiceLineReceiptCost, purchaseCostsIncludeVat } = await import(
    "../src/lib/purchasing/purchaseCostBasis"
  );
  const { parsePaperGsm, sheetsPerKilogram, isKilogramUnit } = await import("../src/lib/purchasing/suggestMapping");
  const { PurchaseLineStatus, StockTargetKind, stockQuantityFromInvoice } = await import(
    "../src/lib/purchasing/types"
  );

  console.log(`Database: ${host}`);
  console.log(
    `Plan: ${options.all ? "every C2S paper line" : "latest line per paper"}${options.apply ? "" : " (dry run — add --apply to write)"}`,
  );

  const costsIncludeVat: boolean = await purchaseCostsIncludeVat();
  const papers = await prisma.sheetPaper.findMany({
    where: { stockVariantId: { not: null } },
    select: { id: true, name: true, gsm: true, sheetWidthCm: true, sheetHeightCm: true, stockVariantId: true },
  });
  const paperForGsm = (gsm: number) => {
    const matches = papers.filter((p) => (p.gsm ?? parsePaperGsm(p.name)) === gsm && /^A4\+/i.test(p.name));
    return matches.length === 1 ? matches[0]! : null;
  };

  const lines = await prisma.purchaseInvoiceLine.findMany({
    where: { invoice: { supplierIdno: SUPPLIER_IDNO } },
    include: { invoice: { select: { seria: true, number: true, deliveryDate: true, issueDate: true } } },
  });
  const invoiceNo = (l: (typeof lines)[number]): string => `${l.invoice.seria}${l.invoice.number}`;
  const isPaperLine = (l: (typeof lines)[number]): boolean =>
    !/fedrigoni/i.test(l.name) && /\bc2s\b/i.test(l.name) && isKilogramUnit(l.unit);

  const selected = lines
    .filter(isPaperLine)
    .filter(
      (l) =>
        options.all ||
        LATEST_LINES.some((t) => t.invoice === invoiceNo(l) && t.gsm === parsePaperGsm(l.name)),
    )
    .sort(
      (a, b) =>
        (a.invoice.deliveryDate ?? a.invoice.issueDate ?? new Date(0)).getTime() -
          (b.invoice.deliveryDate ?? b.invoice.issueDate ?? new Date(0)).getTime() || a.position - b.position,
    );
  if (!options.all && selected.length !== LATEST_LINES.length) {
    throw new Error(`Expected ${LATEST_LINES.length} latest lines, found ${selected.length}`);
  }

  let failures = 0;
  for (const line of selected) {
    const gsm: number | null = parsePaperGsm(line.name);
    const paper = gsm != null ? paperForGsm(gsm) : null;
    const label = `${invoiceNo(line)} #${line.position} ${line.name}`;
    if (!paper?.stockVariantId) {
      console.log(`  ! ${label}: no single A4+ ${gsm ?? "?"}gr paper linked to stock — skipped`);
      failures += 1;
      continue;
    }
    const factor: number | null = sheetsPerKilogram(line.name, line.unit, {
      gsm: paper.gsm,
      widthCm: Number(paper.sheetWidthCm),
      heightCm: Number(paper.sheetHeightCm),
    });
    if (factor === null) {
      console.log(`  ! ${label}: cannot work out sheets per kg — skipped`);
      failures += 1;
      continue;
    }
    const kg: number = Number(line.quantity);
    const sheets: number = stockQuantityFromInvoice(StockTargetKind.StockVariant, kg, factor, "sheets");
    const cost: number = invoiceLineReceiptCost(
      { totalExVat: Number(line.totalExVat), total: Number(line.total) },
      costsIncludeVat,
    );
    const plan = `${label} → ${paper.name}: ${kg} kg × ${factor} = ${sheets} sheets, ${cost.toFixed(2)} MDL${costsIncludeVat ? " incl. VAT" : " ex VAT"} (${(cost / sheets).toFixed(4)}/sheet)`;

    if (line.status === PurchaseLineStatus.Posted) {
      console.log(`  = ${plan} — already posted (${line.postedKind}), skipped`);
      continue;
    }
    if (!options.apply) {
      console.log(`  ~ ${plan}${line.status === PurchaseLineStatus.Ignored ? " [re-open ignored]" : ""}`);
      continue;
    }
    try {
      if (line.status === PurchaseLineStatus.Ignored) {
        await unpostPurchaseLine({ lineId: line.id, createdById: null });
      }
      const result = await postPurchaseLine({
        lineId: line.id,
        kind: StockTargetKind.StockVariant,
        targetId: paper.stockVariantId,
        unitsPerInvoiceUnit: factor,
        createdById: null,
        auto: false,
        costsIncludeVat,
      });
      console.log(`  + ${plan} — posted ${result.quantity} sheets, ${result.costMdl.toFixed(2)} MDL`);
    } catch (err) {
      failures += 1;
      console.log(`  ! ${plan} — FAILED: ${err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}`.trim() : String(err)}`);
    }
  }

  await prisma.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
