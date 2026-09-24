#!/usr/bin/env node
/**
 * Conditional Prisma build step: only run migrate deploy & generate
 * when DATABASE_URL is available. This allows Vercel builds without
 * a database connection to succeed (schema validation requires both
 * DATABASE_URL and DIRECT_DATABASE_URL).
 */

import { execSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_DATABASE_URL;

if (!dbUrl || !directUrl) {
  console.log("⚠ DATABASE_URL or DIRECT_DATABASE_URL not set, skipping Prisma migrate & generate");
  console.log("  (Prisma Client will be generated from committed schema during Next.js build)");
  process.exit(0);
}

console.log("✓ Database credentials found, running Prisma migrate deploy & generate...");

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  execSync("npx prisma generate", { stdio: "inherit" });
  console.log("✓ Prisma migration & client generation complete");
} catch (error) {
  console.error("✗ Prisma build step failed:", error.message);
  process.exit(1);
}
