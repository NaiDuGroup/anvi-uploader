/**
 * Regenerate favicon / PWA PNGs from public/logo.png (square outputs, cover + centre).
 * Source is often RGB without alpha (white outside the disc); we composite a circular
 * mask so tab icons do not show a white square on dark browser chrome.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const source = path.join(root, "public", "logo.png");

/** @type {Array<{ out: string; size: number }>} */
const TARGETS = [
  { out: path.join(root, "public", "favicon-16x16.png"), size: 16 },
  { out: path.join(root, "public", "favicon-32x32.png"), size: 32 },
  { out: path.join(root, "public", "apple-touch-icon.png"), size: 180 },
  { out: path.join(root, "public", "icon-192.png"), size: 192 },
  { out: path.join(root, "public", "icon-512.png"), size: 512 },
];

function circleMaskSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(0.5, size / 2 - 0.5);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>` +
      `</svg>`,
  );
}

async function main() {
  const input = sharp(source);
  for (const { out, size } of TARGETS) {
    await input
      .clone()
      .resize(size, size, { fit: "cover", position: "centre" })
      .ensureAlpha()
      .composite([{ input: circleMaskSvg(size), blend: "dest-in" }])
      .png()
      .toFile(out);
    console.log("wrote", path.relative(root, out));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
