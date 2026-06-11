/**
 * Upload the notebook GLB to the R2 catalog bucket (permanent storage).
 *
 * Usage (with production R2 credentials):
 *
 *   R2_ACCOUNT_ID=<id> \
 *   R2_ACCESS_KEY_ID=<key> \
 *   R2_SECRET_ACCESS_KEY=<secret> \
 *   R2_CATALOG_BUCKET_NAME=anvi-catalog \
 *   node scripts/upload-glb-to-catalog.mjs [path-to-glb]
 *
 * If no path is given, defaults to public/notebook_hardcover_with_strap_A5_v3.1_Cycles.glb
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const DEFAULT_LOCAL_PATH = join(
  process.cwd(),
  "public",
  "notebook_hardcover_with_strap_A5_v3.1_Cycles.glb",
);

const localPath = process.argv[2] || DEFAULT_LOCAL_PATH;
const destKey =
  "catalog/3d-models/notebook_hardcover_with_strap_A5_v3.1_Cycles.glb";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket =
  process.env.R2_CATALOG_BUCKET_NAME ||
  process.env.R2_BUCKET_NAME ||
  "anvi-catalog";

if (!accountId || accountId === "local-dev") {
  console.error(
    "✗ Set R2_ACCOUNT_ID to your production Cloudflare account ID (not local-dev).",
  );
  process.exit(1);
}
if (!accessKeyId || !secretAccessKey) {
  console.error("✗ Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId, secretAccessKey },
});

console.log(`▶ Reading ${localPath}…`);
const body = readFileSync(localPath);
console.log(`  ${(body.byteLength / 1024 / 1024).toFixed(1)} MB`);

console.log(`▶ Uploading to bucket "${bucket}" key "${destKey}"…`);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: destKey,
    Body: body,
    ContentType: "model/gltf-binary",
  }),
);

console.log("✓ Upload complete.");
console.log();
console.log("Next steps:");
console.log(
  "  1. Set NEXT_PUBLIC_NOTEBOOK_GLB_URL on your hosting platform to:",
);
console.log(
  `     https://<R2_CATALOG_PUBLIC_URL>/${destKey}`,
);
console.log("  2. Redeploy the app so the new env var takes effect.");
