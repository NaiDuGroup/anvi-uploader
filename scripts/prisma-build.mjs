#!/usr/bin/env node
/**
 * Conditional Prisma build step: migrate deploy & generate when DATABASE_URL
 * is available. Tolerates unreachable databases (e.g., Vercel preview with
 * production DATABASE_URL but no preview DB access) by skipping migrate and
 * continuing with generate.
 */

import { execSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_DATABASE_URL;

if (!dbUrl || !directUrl) {
  console.log("⚠ DATABASE_URL or DIRECT_DATABASE_URL not set, skipping Prisma migrate & generate");
  console.log("  (Prisma Client will be generated from committed schema during Next.js build)");
  process.exit(0);
}

console.log("✓ Database credentials found, attempting Prisma migrate deploy...");

// Try migrate deploy, but tolerate connection failures.
try {
  execSync("npx prisma migrate deploy", { stdio: "pipe" });
  console.log("✓ Prisma migrations applied successfully");
} catch (error) {
  const stdout = error.stdout?.toString() || "";
  const stderr = error.stderr?.toString() || "";
  const output = stdout + stderr;
  
  const isConnectionError =
    output.includes("Can't reach database server") ||
    output.includes("P1001") ||
    output.includes("ECONNREFUSED") ||
    output.includes("ETIMEDOUT") ||
    output.includes("Connection refused") ||
    output.includes("timed out");

  if (isConnectionError) {
    console.log("⚠ Database unreachable, skipping migrations (continuing build)");
  } else {
    console.error("✗ Prisma migrate deploy failed (non-connection error)");
    console.error(output);
    process.exit(1);
  }
}

// Always try to generate Prisma Client (works offline from schema).
try {
  execSync("npx prisma generate", { stdio: "inherit" });
  console.log("✓ Prisma Client generated successfully");
} catch (error) {
  console.error("✗ Prisma generate failed:", error.message);
  process.exit(1);
}
