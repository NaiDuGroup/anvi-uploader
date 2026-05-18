/**
 * Wake up Neon, check migration status, and run prisma migrate deploy
 * only when there are pending migrations.
 *
 * Neon auto-suspends idle computes, and the advisory lock Prisma uses
 * for migrate deploy can time out when Vercel builds are in a different
 * region than the database (e.g., iad1 → eu-central-1).
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("⚠ No DATABASE_URL found, skipping warmup");
  process.exit(0);
}

/* ── 1. Wake up the database ──────────────────────────────────── */

const MAX_WARMUP = 3;
const WARMUP_DELAY_MS = 5_000;

async function warmup(attempt = 1) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✓ Database is awake (attempt ${attempt})`);
    return prisma;
  } catch (err) {
    await prisma.$disconnect().catch(() => {});
    if (attempt < MAX_WARMUP) {
      console.log(
        `⏳ DB not ready (attempt ${attempt}/${MAX_WARMUP}), retrying in ${WARMUP_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, WARMUP_DELAY_MS));
      return warmup(attempt + 1);
    }
    console.error("✗ Could not wake database after", MAX_WARMUP, "attempts");
    throw err;
  }
}

/* ── 2. Check if there are pending migrations ─────────────────── */

async function hasPendingMigrations(prisma) {
  try {
    const applied = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at
    `;
    const appliedNames = new Set(applied.map((r) => r.migration_name));

    const migrationsDir = join(process.cwd(), "prisma", "migrations");
    const localDirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "migration_lock.toml")
      .map((d) => d.name);

    const pending = localDirs.filter((name) => !appliedNames.has(name));
    if (pending.length > 0) {
      console.log(`⚠ ${pending.length} pending migration(s):`, pending.join(", "));
      return true;
    }
    console.log(`✓ All ${appliedNames.size} migrations already applied — skipping deploy`);
    return false;
  } catch {
    console.log("⚠ Could not check migration status, will attempt deploy");
    return true;
  }
}

/* ── 3. Run migrate deploy with retries (only when needed) ───── */

function migrateWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`▶ prisma migrate deploy (attempt ${attempt}/${maxAttempts})...`);
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
      console.log("✓ Migrations applied successfully");
      return;
    } catch {
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

/* ── Main ─────────────────────────────────────────────────────── */

const prisma = await warmup();

if (await hasPendingMigrations(prisma)) {
  migrateWithRetry(3);
}

await prisma.$disconnect().catch(() => {});
