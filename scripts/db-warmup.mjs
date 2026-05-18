/**
 * Wake up a Neon serverless Postgres instance before running migrations.
 * Neon auto-suspends idle computes; the first connection can take 5-15 s.
 * Prisma's advisory-lock timeout is only 10 s, so we warm up the DB first.
 */

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("⚠ No DATABASE_URL found, skipping warmup");
  process.exit(0);
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

async function warmup(attempt = 1) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✓ Database is awake (attempt ${attempt})`);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.log(
        `⏳ DB not ready (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      await prisma.$disconnect().catch(() => {});
      return warmup(attempt + 1);
    }
    console.error("✗ Could not wake database after", MAX_RETRIES, "attempts");
    throw err;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

await warmup();
