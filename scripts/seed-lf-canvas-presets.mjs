/**
 * One-off seed: add size presets for canvas material ("Panza din bumbac" / similar).
 * Retail and dealer prices are identical for the initial rollout.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-lf-canvas-presets.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRESETS = [
  { widthCm: 21, heightCm: 30, priceMdl: 310 },
  { widthCm: 30, heightCm: 42, priceMdl: 390 },
  { widthCm: 60, heightCm: 42, priceMdl: 540 },
  { widthCm: 50, heightCm: 70, priceMdl: 610 },
  { widthCm: 60, heightCm: 80, priceMdl: 690 },
  { widthCm: 60, heightCm: 90, priceMdl: 740 },
  { widthCm: 80, heightCm: 100, priceMdl: 1140 },
  { widthCm: 90, heightCm: 120, priceMdl: 1300 },
];

/** Match common canvas material names case-insensitively. */
const CANVAS_NAME_REGEX = /panza|panz[ăa]|canvas/i;

async function main() {
  const materials = await prisma.largeFormatMaterial.findMany({
    orderBy: { name: "asc" },
  });
  console.log(`Found ${materials.length} LF materials.`);

  const canvas = materials.find((m) => CANVAS_NAME_REGEX.test(m.name));
  if (!canvas) {
    console.error("No canvas material found. Materials:");
    for (const m of materials) console.error(`  - ${m.name} (${m.id})`);
    process.exit(1);
  }
  console.log(`Target canvas material: "${canvas.name}" (${canvas.id})`);

  let createdCount = 0;
  let skippedCount = 0;
  for (let i = 0; i < PRESETS.length; i++) {
    const p = PRESETS[i];
    const existing = await prisma.lfMaterialSizePreset.findFirst({
      where: { materialId: canvas.id, widthCm: p.widthCm, heightCm: p.heightCm },
    });
    if (existing) {
      console.log(`  - SKIP ${p.widthCm}x${p.heightCm} (already exists)`);
      skippedCount++;
      continue;
    }
    await prisma.lfMaterialSizePreset.create({
      data: {
        materialId: canvas.id,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        retailPriceMdl: p.priceMdl,
        dealerPriceMdl: p.priceMdl,
        sortOrder: i,
        isActive: true,
      },
    });
    console.log(`  + ${p.widthCm}x${p.heightCm} = ${p.priceMdl} MDL (retail+dealer)`);
    createdCount++;
  }

  console.log(`\nDone. Created: ${createdCount}, skipped: ${skippedCount}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
