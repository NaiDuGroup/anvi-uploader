/**
 * Wake up a Neon serverless Postgres instance and run prisma migrate deploy
 * with retries. Neon auto-suspends idle computes; the first connection can
 * take 5-15s which exceeds Prisma's 10s advisory lock timeout.
 */

import { execSync } from "node:child_process";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("⚠ No DATABASE_URL found, skipping warmup");
  process.exit(0);
}

const MAX_WARMUP = 3;
const WARMUP_DELAY_MS = 5_000;

async function warmup(attempt = 1) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✓ Database is awake (attempt ${attempt})`);
  } catch (err) {
    if (attempt < MAX_WARMUP) {
      console.log(
        `⏳ DB not ready (attempt ${attempt}/${MAX_WARMUP}), retrying in ${WARMUP_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, WARMUP_DELAY_MS));
      await prisma.$disconnect().catch(() => {});
      return warmup(attempt + 1);
    }
    console.error("✗ Could not wake database after", MAX_WARMUP, "attempts");
    throw err;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function migrateWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`▶ prisma migrate deploy (attempt ${attempt}/${maxAttempts})...`);
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
      console.log("✓ Migrations applied successfully");
      return;
    } catch (err) {
      if (attempt < maxAttempts) {
        const delaySec = 5 * attempt;
        console.log(`⏳ migrate deploy failed, retrying in ${delaySec}s...`);
        execSync(`sleep ${delaySec}`);
      } else {
        console.error("✗ prisma migrate deploy failed after", maxAttempts, "attempts");
        process.exit(1);
      }
    }
  }
}

await warmup();
migrateWithRetry(3);
