#!/usr/bin/env node
/**
 * Next.js maps both src/app/admin/(public)/login and src/app/admin/login to /admin/login.
 * Having both causes: "You cannot have two parallel pages that resolve to the same path."
 *
 * If the canonical login exists, we remove the legacy (public) group automatically.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "src/app/admin/(public)");
const canonicalLogin = path.join(root, "src/app/admin/login/page.tsx");

const hasCanonical = fs.existsSync(canonicalLogin);
const hasLegacyGroup = fs.existsSync(publicDir);

if (hasCanonical && hasLegacyGroup) {
  fs.rmSync(publicDir, { recursive: true, force: true });
  console.warn(
    "[admin routes] Removed legacy src/app/admin/(public) — it duplicated /admin/login.",
  );
}

process.exit(0);
