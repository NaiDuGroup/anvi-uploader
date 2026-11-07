/**
 * Sticker paper for «Наклейки на листе» (sticker_sheet lines):
 *
 * 1. Creates the sheet paper «A3+ самоклейка Fedrigoni» (32 × 45 cm, the
 *    «Листовая бумага» stock item / variant linked to it) unless it exists.
 * 2. Posts ONLY the latest S.C. «MENAJ LUX» invoice line of
 *    «69.3002 Hartie FEDRIGONI autoadeziv 45x64 (250 foi)» — EBI000731248
 *    (2026-05-29, 1250 foi) — at 2 A3+ per foi (one 45×64 sheet cut in half),
 *    through the purchases screen's own code, which also remembers the
 *    supplier rule so later invoices of this paper are matched to it.
 *    The 4 older lines (EBD000671237, EBE000367803, EBF000928985,
 *    EBG000926297) are left alone (owner's decision 2026-11-07).
 *
 * Idempotent. Dry run by default.
 *
 * Usage:
 *   npx tsx scripts/post-menaj-lux-sticker-paper.ts                  # dry run, DATABASE_URL from .env
 *   npx tsx scripts/post-menaj-lux-sticker-paper.ts --apply          # write
 *   npx tsx scripts/post-menaj-lux-sticker-paper.ts --prod [--apply] # DB from .env.prod
 */
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";

const SUPPLIER_IDNO = "1006600037216";
const LATEST_INVOICE = "EBI000731248";
const LINE_NAME = /69\.3002.*fedrigoni.*autoadeziv.*45x64/i;
const PAPER_NAME = "A3+ самоклейка Fedrigoni";
const A3_PER_FOI = 2;

type Options = { apply: boolean; prod: boolean };

function parseOptions(argv: readonly string[]): Options {
  const known = new Set(["--apply", "--prod"]);
  const unknown: string[] = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(" ")}`);
  return { apply: argv.includes("--apply"), prod: argv.includes("--prod") };
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
  const { invoiceLineReceiptCost, purchaseCostsIncludeVat } = await import("../src/lib/purchasing/purchaseCostBasis");
  const { PurchaseLineStatus, StockTargetKind } = await import("../src/lib/purchasing/types");
  const {
    createMaterialStockVariant,
    LEGACY_COST_COLUMN_PLACEHOLDER,
    SHEET_PAPER_CATEGORY_CODE,
    SHEET_PAPER_LEGACY_KIND,
    sheetPaperStockAttributes,
  } = await import("../src/lib/stock/unified/materials");
  const { isStickerSheetPaper, STICKER_SHEET_DEFAULTS } = await import("../src/lib/stickerSheet/stickerSheet");

  console.log(`Database: ${host}${options.apply ? "" : " (dry run — add --apply to write)"}`);

  // 1. Paper + stock variant.
  const papers = await prisma.sheetPaper.findMany({
    select: { id: true, name: true, stockVariantId: true, isActive: true },
  });
  let paper = papers.find((p) => isStickerSheetPaper(p)) ?? null;
  if (paper) {
    console.log(`  = paper exists: ${paper.name} (${paper.id}), variant ${paper.stockVariantId ?? "—"}`);
    if (!paper.stockVariantId) throw new Error("Sticker paper has no stock variant");
  } else if (!options.apply) {
    console.log(`  ~ would create paper «${PAPER_NAME}» 32 × 45 cm (retail 50 / dealer 24 per sheet) + stock variant`);
  } else {
    const retail = STICKER_SHEET_DEFAULTS.retailTiers[0]!.pricePerSheetMdl;
    paper = await prisma.$transaction(async (tx) => {
      const created = await tx.sheetPaper.create({
        data: {
          name: PAPER_NAME,
          gsm: null,
          sheetWidthCm: "32",
          sheetHeightCm: "45",
          costPerSheet: LEGACY_COST_COLUMN_PLACEHOLDER,
          retailPricePerSheet: retail,
          dealerPricePerSheet: STICKER_SHEET_DEFAULTS.dealerPricePerSheetMdl,
          isActive: true,
          sortOrder: 100,
        },
        select: { id: true },
      });
      const stockVariantId: string = await createMaterialStockVariant(tx, {
        categoryCode: SHEET_PAPER_CATEGORY_CODE,
        legacyKind: SHEET_PAPER_LEGACY_KIND,
        legacyId: created.id,
        skuPrefix: "PAPER",
        name: PAPER_NAME,
        isActive: true,
        sortOrder: 100,
        attributes: sheetPaperStockAttributes({ sheetWidthCm: "32", sheetHeightCm: "45", gsm: null }),
        purchaseCost: 0,
      });
      return tx.sheetPaper.update({
        where: { id: created.id },
        data: { stockVariantId },
        select: { id: true, name: true, stockVariantId: true, isActive: true },
      });
    });
    console.log(`  + created paper ${paper.name} (${paper.id}), variant ${paper.stockVariantId}`);
  }

  // 2. The latest invoice line only.
  const lines = await prisma.purchaseInvoiceLine.findMany({
    where: { invoice: { supplierIdno: SUPPLIER_IDNO } },
    include: { invoice: { select: { seria: true, number: true, issueDate: true } } },
  });
  const sticker = lines.filter((l) => LINE_NAME.test(l.name));
  for (const l of sticker) {
    const no = `${l.invoice.seria}${l.invoice.number}`;
    console.log(`    ${no} ${l.invoice.issueDate?.toISOString().slice(0, 10)} ${l.quantity} ${l.unit} ${l.totalExVat} ex VAT — ${l.status}${no === LATEST_INVOICE ? "  ← post" : ""}`);
  }
  const target = sticker.filter((l) => `${l.invoice.seria}${l.invoice.number}` === LATEST_INVOICE);
  if (target.length !== 1) throw new Error(`Expected one ${LATEST_INVOICE} sticker line, found ${target.length}`);
  const line = target[0]!;

  const costsIncludeVat: boolean = await purchaseCostsIncludeVat();
  const qty: number = Number(line.quantity) * A3_PER_FOI;
  const cost: number = invoiceLineReceiptCost(
    { totalExVat: Number(line.totalExVat), total: Number(line.total) },
    costsIncludeVat,
  );
  const plan = `${LATEST_INVOICE} ${line.quantity} foi × ${A3_PER_FOI} = ${qty} A3+, ${cost.toFixed(2)} MDL${costsIncludeVat ? " incl. VAT" : " ex VAT"} (${(cost / qty).toFixed(4)}/A3+)`;
  if (line.status === PurchaseLineStatus.Posted) {
    console.log(`  = ${plan} — already posted, skipped`);
  } else if (!options.apply || !paper?.stockVariantId) {
    console.log(`  ~ ${plan}${line.status === PurchaseLineStatus.Ignored ? " [re-open ignored]" : ""}`);
  } else {
    // A line the purchases screen marked «ignored» is re-opened first (as the screen does).
    if (line.status === PurchaseLineStatus.Ignored) {
      await unpostPurchaseLine({ lineId: line.id, createdById: null });
    }
    const result = await postPurchaseLine({
      lineId: line.id,
      kind: StockTargetKind.StockVariant,
      targetId: paper.stockVariantId,
      unitsPerInvoiceUnit: A3_PER_FOI,
      createdById: null,
      auto: false,
      costsIncludeVat,
    });
    console.log(`  + ${plan} — posted ${result.quantity} A3+, ${result.costMdl.toFixed(2)} MDL`);
  }

  if (paper?.stockVariantId) {
    const v = await prisma.stockVariant.findUnique({
      where: { id: paper.stockVariantId },
      select: { sku: true, stockQuantity: true, avgCost: true },
    });
    console.log(`  stock: ${v?.sku} qty ${v?.stockQuantity?.toString()} avg ${v?.avgCost?.toString() ?? "—"}`);
  }
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
