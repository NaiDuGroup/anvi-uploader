#!/usr/bin/env node
/**
 * Conditional Prisma client generation for postinstall.
 * Skips generation when DATABASE_URL or DIRECT_DATABASE_URL is missing,
 * allowing npm install to complete in environments without database credentials.
 */

import { execSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_DATABASE_URL;

if (!dbUrl || !directUrl) {
  console.log("⚠ DATABASE_URL or DIRECT_DATABASE_URL not set, skipping prisma generate in postinstall");
  console.log("  (Run manually with: npm run db:prepare)");
  process.exit(0);
}

try {
  console.log("✓ Database credentials found, generating Prisma Client...");
  execSync("npx prisma generate", { stdio: "inherit" });
} catch (error) {
  console.error("✗ prisma generate failed:", error.message);
  process.exit(1);
}
