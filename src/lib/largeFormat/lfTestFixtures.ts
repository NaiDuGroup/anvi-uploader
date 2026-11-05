import { Prisma } from "@prisma/client";

/**
 * Test fixture: the 12 wide-format rolls of production (2026-11-05, read
 * only) with their average cost per running metre and the size presets of
 * canvas and photo paper 200 g, plus a tiny in-memory `largeFormatMaterial`
 * / `lfMaterialSizePreset` delegate for the resolvers. Test-only.
 */

interface Roll {
  id: string;
  name: string;
  roll: string;
  printable: string;
  avgCost: number;
  sortOrder: number;
}

const ROLLS: Roll[] = [
  { id: "66b19d4e-cc8e-44b2-a292-07f80df27fff", name: "BANNER MATT 1.37*50m", roll: "1.370", printable: "1.320", avgCost: 52.3983, sortOrder: 0 },
  { id: "3c8aef0b-cf0a-4306-9257-3d08b4a42f30", name: "BANNER Roll Up MATT 1.07*30m", roll: "1.070", printable: "1.020", avgCost: 58.8667, sortOrder: 0 },
  {
    id: "0b57808c-23ee-40ff-88c8-e4e6be03a7f2",
    name: "Banner pentru Roll Up 1.27*30m Matt (38,1 m2)",
    roll: "1.270",
    printable: "1.220",
    avgCost: 69.8667,
    sortOrder: 0,
  },
  { id: "7fda3cba-9100-45c9-ba02-7a0f8ee06a9f", name: "ORACAL GLOSS 1.27*50m", roll: "1.270", printable: "1.220", avgCost: 42.02, sortOrder: 0 },
  { id: "aaba4bef-e81c-4699-9ea8-4779ca335bea", name: "ORACAL MATT 1.05*50", roll: "1.050", printable: "1.010", avgCost: 36.64, sortOrder: 0 },
  { id: "ed16fe76-a20d-4182-89b6-979877f9f1f1", name: "ORACAL MATT 1.27*50m", roll: "1.270", printable: "1.220", avgCost: 44.3176, sortOrder: 0 },
  { id: "8e8f6d35-f73e-4f42-8077-e76230ae879d", name: "ORACAL MATT 1.62*50m", roll: "1.620", printable: "1.570", avgCost: 56.52, sortOrder: 0 },
  { id: "76ec9a13-8579-455a-9814-cd9c2f19e810", name: "PAPER 100G 0.91*50m", roll: "0.910", printable: "0.860", avgCost: 12, sortOrder: 0 },
  { id: "1b5d8d87-fcd7-4787-8c0c-89abddbf5a76", name: "PAPER 80G 0.61*100m", roll: "0.610", printable: "0.560", avgCost: 4.5, sortOrder: 0 },
  { id: "c5d82456-f57d-46eb-b02e-f4c06f9e4a25", name: "PHOTO PAPER 200G 1.07*75m", roll: "1.070", printable: "1.020", avgCost: 58.561, sortOrder: 0 },
  { id: "bece2488-e560-499f-ab67-227e809a0367", name: "PHOTO PAPER 230g 1.27*30m", roll: "1.270", printable: "1.220", avgCost: 74.9333, sortOrder: 0 },
  { id: "e5d742b7-d480-455e-8160-4f9f00f11a13", name: "Panza din bumbac 1.07*20m", roll: "1.070", printable: "1.020", avgCost: 116.6656, sortOrder: 0 },
];

export const LF_TEST_ROLL_ID = Object.fromEntries(ROLLS.map((r) => [r.name, r.id])) as Record<string, string>;

const PHOTO = "c5d82456-f57d-46eb-b02e-f4c06f9e4a25";
const CANVAS = "e5d742b7-d480-455e-8160-4f9f00f11a13";

/** [materialId, w, h, retail] — production presets. */
const PRESETS: [string, number, number, number][] = [
  [PHOTO, 25, 38, 40],
  [PHOTO, 30, 40, 70],
  [PHOTO, 30, 42, 70],
  [PHOTO, 30, 45, 70],
  [PHOTO, 40, 60, 130],
  [PHOTO, 50, 70, 160],
  [PHOTO, 60, 80, 220],
  [PHOTO, 60, 90, 250],
  [PHOTO, 90, 120, 370],
  [CANVAS, 21, 30, 310],
  [CANVAS, 30, 42, 390],
  [CANVAS, 60, 42, 540],
  [CANVAS, 50, 70, 610],
  [CANVAS, 60, 80, 690],
  [CANVAS, 60, 90, 740],
  [CANVAS, 80, 100, 1140],
  [CANVAS, 90, 120, 1300],
];

export const LF_TEST_PRESETS = PRESETS.map(([materialId, widthCm, heightCm, retailPriceMdl], i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  materialId,
  widthCm,
  heightCm,
  retailPriceMdl,
  dealerPriceMdl: retailPriceMdl,
  sortOrder: i,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}));

function row(r: Roll) {
  return {
    id: r.id,
    name: r.name,
    stockVariantId: `v-${r.id}`,
    rollWidthMeters: new Prisma.Decimal(r.roll),
    printableWidthMeters: new Prisma.Decimal(r.printable),
    rollLengthMeters: null,
    dealerPricePerLinearMeter: 0,
    retailPricePerLinearMeter: 0,
    dealerPrintPricePerLinearMeter: 0,
    retailPrintPricePerLinearMeter: 0,
    finalRetailPricePerLinearMeter: 0,
    finalDealerPricePerLinearMeter: 0,
    manualFinalRetailPricePerLinearMeter: null,
    manualFinalDealerPricePerLinearMeter: null,
    isActive: true,
    sortOrder: r.sortOrder,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stockVariant: {
      id: `v-${r.id}`,
      sku: `ROLL-${r.id.slice(0, 8).toUpperCase()}`,
      stockQuantity: new Prisma.Decimal(50),
      avgCost: new Prisma.Decimal(r.avgCost),
      purchaseCost: new Prisma.Decimal(0),
    },
    sizePresets: LF_TEST_PRESETS.filter((p) => p.materialId === r.id),
  };
}

type Where = { id?: string | { in: string[] }; isActive?: boolean } | undefined;

function matches(r: ReturnType<typeof row>, where: Where): boolean {
  if (!where) return true;
  if (where.isActive != null && r.isActive !== where.isActive) return false;
  if (typeof where.id === "string" && r.id !== where.id) return false;
  if (where.id && typeof where.id === "object" && !where.id.in.includes(r.id)) return false;
  return true;
}

/** Fake Prisma delegates for the 12 rolls (sorted by roll width like the real query). */
export function lfTestDb() {
  const rows = ROLLS.map(row).sort((a, b) => Number(a.rollWidthMeters) - Number(b.rollWidthMeters));
  return {
    largeFormatMaterial: {
      findMany: async (args: { where?: Where } = {}) => rows.filter((r) => matches(r, args.where)),
      findUnique: async (args: { where: { id: string } }) => rows.find((r) => r.id === args.where.id) ?? null,
    },
    lfMaterialSizePreset: {
      findUnique: async (args: { where: { id: string } }) => LF_TEST_PRESETS.find((p) => p.id === args.where.id) ?? null,
    },
  };
}

/** Production settings «Настройки производства» (2026-11-05). */
export const LF_TEST_PRODUCTION_COSTS = {
  lfMinimumLineTotalMdl: 100,
  lfDealerMarkupMultiplier: 2.7,
  lfRetailMarkupMultiplier: 4,
  inkMlPerSqmLargeFormatRoll: 30,
  lfInkDealerMarkupMultiplier: 2.7,
  lfInkRetailMarkupMultiplier: 4,
};

/** LF ink, lei per ml (blended slot cost ≈ plan C.1). */
export const LF_TEST_INK_PER_ML = 0.617;
