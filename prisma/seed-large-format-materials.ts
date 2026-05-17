/**
 * Каталог материалов широкого формата — строки из внутренней таблицы (п.м./Д/К).
 * Run: `npm run db:seed:lf-materials`
 *
 * Расшифровка колонок таблицы:
 * - п.м. → себестоимость материала за погонный метр (MDL)
 * - Д → цена материала дилеру за п.м. (у строк фото: 2× от п.м.)
 * - К → розничная цена материала за п.м. (3× от п.м.)
 * Для «Бумага» дополнительно: +ПВ / ПК = печать дилер / печать клиент за п.м.
 * Для остальных позиций печать: те же коэффициенты к п.м., что у бумаги (85/59 и 100/59).
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function dec(s: string): Prisma.Decimal {
  return new Prisma.Decimal(s);
}

/** Бумага в таблице: себестоимость 59, печать дилер 85, печать клиент 100. */
const PAPER_COST = 59;
const PAPER_PRINT_DEALER = 85;
const PAPER_PRINT_RETAIL = 100;

function printDealerFromCost(materialCostPerLm: number): number {
  return Math.round((materialCostPerLm * PAPER_PRINT_DEALER) / PAPER_COST);
}

function printRetailFromCost(materialCostPerLm: number): number {
  return Math.round((materialCostPerLm * PAPER_PRINT_RETAIL) / PAPER_COST);
}

/** ID старых демо-строк (18 шт.) — удаляем лишние после перехода на 5 позиций из таблицы. */
const REMOVED_LEGACY_DEMO_IDS = [
  "a1111111-1111-4111-8111-111111111106",
  "a1111111-1111-4111-8111-111111111107",
  "a1111111-1111-4111-8111-111111111108",
  "a1111111-1111-4111-8111-111111111109",
  "a1111111-1111-4111-8111-111111111110",
  "a1111111-1111-4111-8111-111111111111",
  "a1111111-1111-4111-8111-111111111112",
  "a1111111-1111-4111-8111-111111111113",
  "a1111111-1111-4111-8111-111111111114",
  "a1111111-1111-4111-8111-111111111115",
  "a1111111-1111-4111-8111-111111111116",
  "a1111111-1111-4111-8111-111111111117",
  "a1111111-1111-4111-8111-111111111118",
] as const;

const MATERIALS: Array<{
  id: string;
  name: string;
  rollWidthMeters: Prisma.Decimal;
  rollLengthMeters: Prisma.Decimal;
  costPerLinearMeter: number;
  dealerPricePerLinearMeter: number;
  retailPricePerLinearMeter: number;
  dealerPrintPricePerLinearMeter: number;
  retailPrintPricePerLinearMeter: number;
  isActive: boolean;
  sortOrder: number;
}> = [
  {
    id: "a1111111-1111-4111-8111-111111111101",
    name: "ORACAL / самоклейка — рулон 1,27×33 м",
    rollWidthMeters: dec("1.270"),
    rollLengthMeters: dec("33.000"),
    costPerLinearMeter: 46,
    dealerPricePerLinearMeter: 92,
    retailPricePerLinearMeter: 138,
    dealerPrintPricePerLinearMeter: printDealerFromCost(46),
    retailPrintPricePerLinearMeter: printRetailFromCost(46),
    isActive: true,
    sortOrder: 10,
  },
  {
    id: "a1111111-1111-4111-8111-111111111102",
    name: "Холст — рулон 1,07×98 м",
    rollWidthMeters: dec("1.070"),
    rollLengthMeters: dec("98.000"),
    costPerLinearMeter: 115,
    dealerPricePerLinearMeter: 230,
    retailPricePerLinearMeter: 345,
    dealerPrintPricePerLinearMeter: printDealerFromCost(115),
    retailPrintPricePerLinearMeter: printRetailFromCost(115),
    isActive: true,
    sortOrder: 20,
  },
  {
    id: "a1111111-1111-4111-8111-111111111103",
    name: "Бумага — рулон 1,07×50 м (печать +ПВ/ПК из таблицы)",
    rollWidthMeters: dec("1.070"),
    rollLengthMeters: dec("50.000"),
    costPerLinearMeter: 59,
    dealerPricePerLinearMeter: 118,
    retailPricePerLinearMeter: 177,
    dealerPrintPricePerLinearMeter: PAPER_PRINT_DEALER,
    retailPrintPricePerLinearMeter: PAPER_PRINT_RETAIL,
    isActive: true,
    sortOrder: 30,
  },
  {
    id: "a1111111-1111-4111-8111-111111111104",
    name: "Баннер roll-up — рулон 1,07×55 м",
    rollWidthMeters: dec("1.070"),
    rollLengthMeters: dec("55.000"),
    costPerLinearMeter: 65,
    dealerPricePerLinearMeter: 130,
    retailPricePerLinearMeter: 195,
    dealerPrintPricePerLinearMeter: printDealerFromCost(65),
    retailPrintPricePerLinearMeter: printRetailFromCost(65),
    isActive: true,
    sortOrder: 40,
  },
  {
    id: "a1111111-1111-4111-8111-111111111105",
    name: "Баннер — рулон 1,37×30 м",
    rollWidthMeters: dec("1.370"),
    rollLengthMeters: dec("30.000"),
    costPerLinearMeter: 46,
    dealerPricePerLinearMeter: 92,
    retailPricePerLinearMeter: 138,
    dealerPrintPricePerLinearMeter: printDealerFromCost(46),
    retailPrintPricePerLinearMeter: printRetailFromCost(46),
    isActive: true,
    sortOrder: 50,
  },
];

const MATERIALS_WITH_FINAL = MATERIALS.map((m) => ({
  ...m,
  finalRetailPricePerLinearMeter:
    m.retailPricePerLinearMeter + m.retailPrintPricePerLinearMeter,
  finalDealerPricePerLinearMeter:
    m.dealerPricePerLinearMeter + m.dealerPrintPricePerLinearMeter,
}));

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (
    process.env.ALLOW_LF_SEED !== "YES" &&
    !/localhost|127\.0\.0\.1/.test(url)
  ) {
    throw new Error(
      `Refusing LF materials seed against non-local DATABASE_URL (${url.replace(/:[^:@/]+@/, ":***@")}). Set ALLOW_LF_SEED=YES to override.`,
    );
  }

  for (const row of MATERIALS_WITH_FINAL) {
    const { id, ...update } = row;
    await prisma.largeFormatMaterial.upsert({
      where: { id },
      create: row,
      update,
    });
  }

  const removed = await prisma.largeFormatMaterial.deleteMany({
    where: { id: { in: [...REMOVED_LEGACY_DEMO_IDS] } },
  });

  console.log(
    `Upserted ${MATERIALS_WITH_FINAL.length} large-format materials from studio table; removed ${removed.count} legacy demo rows.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
