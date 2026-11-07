/**
 * Renders the Direction A (photo mockup) samples of the apparel visual
 * prototype into editor-research/apparel-visual/ (gitignored).
 *
 *   npx tsx scripts/apparelPhotoMockups.ts [photoCacheDir]
 *
 * Supplier HD photos are read from `photoCacheDir` when present there
 * (file name = last URL segment), else fetched over HTTP (public, CORS *).
 */
import fs from "node:fs";
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { apparelPrintBox } from "@/lib/studio/apparelMockup";
import { PHOTO_VIEWS, buildFabricMaps, photoUrl, printBoxToPhotoPx, printOnPhoto, recolourPhoto, type PhotoViewCalibration, type Raster, type Rect } from "@/lib/studio/photoMockup";
import { drawSampleDesign, type SampleDesign } from "@/components/shop/studio/apparelDemo/sampleDesigns";

const ROOT: string = path.resolve(__dirname, "..");
const OUT: string = path.join(ROOT, "editor-research/apparel-visual");
const CACHE: string | undefined = process.argv[2];
// The variable Montserrat renders thin in @napi-rs/canvas: a static black face for the samples (the browser demo uses Montserrat 900).
GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/Arial Black.ttf", "SampleBlack");
GlobalFonts.registerFromPath(path.join(ROOT, "src/fonts/montserrat/Montserrat-wght.woff2"), "Montserrat");

async function photo(url: string): Promise<Raster> {
  const local: string | undefined = CACHE ? path.join(CACHE, url.split("/").pop()!) : undefined;
  let buf: Buffer;
  if (local && fs.existsSync(local)) buf = fs.readFileSync(local);
  else buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const img = await loadImage(buf);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height);
  return { width: d.width, height: d.height, data: d.data };
}

function design(kind: SampleDesign, box: Rect, ink: string): Raster {
  // Drawn at ~2× the photo resolution of the box, then sampled bilinearly.
  const w: number = Math.round(box.w * 2);
  const h: number = Math.round(box.h * 2);
  const c = createCanvas(w, h);
  drawSampleDesign(c.getContext("2d") as unknown as CanvasRenderingContext2D, kind, w, h, ink, "SampleBlack");
  const d = c.getContext("2d").getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

function toCanvas(r: Raster) {
  const c = createCanvas(r.width, r.height);
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(r.width, r.height);
  id.data.set(r.data);
  ctx.putImageData(id, 0, 0);
  return c;
}

async function save(name: string, r: Raster, opts: { size?: number; crop?: Rect } = {}): Promise<void> {
  const src = toCanvas(r);
  const crop: Rect = opts.crop ?? { x: 0, y: 0, w: r.width, h: r.height };
  const size: number = opts.size ?? 1400;
  const k: number = size / Math.max(crop.w, crop.h);
  const out = createCanvas(Math.round(crop.w * k), Math.round(crop.h * k));
  const ctx: SKRSContext2D = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  fs.writeFileSync(path.join(OUT, name), out.toBuffer("image/png"));
  console.log("wrote", name);
}

const cache = new Map<string, Promise<Raster>>();
const get = (url: string): Promise<Raster> => {
  if (!cache.has(url)) cache.set(url, photo(url));
  return cache.get(url)!;
};

/** One mockup: the colour photo with the design printed in the cm box. */
async function mockup(cal: PhotoViewCalibration, colour: string | { hex: string }, kind: SampleDesign, cm: { x: number; y: number; w: number; h: number }, ink: string): Promise<{ img: Raster; box: Rect }> {
  const white: Raster = await get(photoUrl(cal, cal.shadeColour));
  const dark: Raster = await get(photoUrl(cal, cal.maskColour));
  const base: Raster =
    typeof colour === "string" ? { ...(await get(photoUrl(cal, colour))) } : recolourPhoto(white, dark, colour.hex);
  const img: Raster = { width: base.width, height: base.height, data: new Uint8ClampedArray(base.data) };
  const box: Rect = printBoxToPhotoPx(cal, cm);
  const pad = 24;
  const maps = buildFabricMaps(white, dark, { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }, { reliefPx: cal.reliefPx });
  printOnPhoto(img, maps, design(kind, box, ink), box, { bow: cal.bow, wrap: cal.wrap });
  return { img, box };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const NAVY = "#14213D";
  const tf = PHOTO_VIEWS["tshirt-front"]!;
  const a4 = apparelPrintBox("tshirt", "front", "front", 21, 29.7);
  for (const [name, c, ink] of [
    ["A-01-dogo-front-white-A4.png", "01", NAVY],
    ["A-02-dogo-front-black-A4.png", "02", "#ffffff"],
    ["A-03-dogo-front-red-A4.png", "60", "#ffffff"],
  ] as const) {
    const { img, box } = await mockup(tf, c, "sunset", a4, ink);
    await save(name, img);
    if (c === "02") await save("A-09-dogo-black-closeup.png", img, { size: 1200, crop: { x: box.x - 50, y: box.y - 30, w: box.w + 100, h: box.h * 0.75 } });
  }
  const back = apparelPrintBox("tshirt", "back", "back", 28, 24);
  await save("A-04-dogo-back-navy-text.png", (await mockup(PHOTO_VIEWS["tshirt-back"]!, "55", "backText", back, "#ffffff")).img);
  const polo = apparelPrintBox("polo", "front", "chest_left", 9, 9);
  const p = await mockup(PHOTO_VIEWS["polo-front"]!, "55", "badge", polo, "#ffffff");
  await save("A-05-austral-polo-navy-left-chest.png", p.img);
  const cap = apparelPrintBox("cap", "front", "front", 9, 5);
  await save("A-06-eris-cap-red-front.png", (await mockup(PHOTO_VIEWS["cap-front"]!, "60", "capLockup", cap, "#ffffff")).img);
  // Bodysuit: a 9 × 9 cm print 3 cm under the neckline.
  await save("A-07-sweet-body-white-front.png", (await mockup(PHOTO_VIEWS["body-front"]!, "01", "babySun", { x: -4.5, y: 3, w: 9, h: 9 }, "#E4572E")).img);
  // Honesty check: recoloured white photo vs the real navy photo, and a colour with no photo.
  const fake = await mockup(tf, { hex: "#001d43" }, "sunset", a4, "#ffffff");
  const real = await mockup(tf, "55", "sunset", a4, "#ffffff");
  const green = await mockup(tf, { hex: "#1F7A4D" }, "sunset", a4, "#ffffff");
  const W: number = fake.img.width;
  const sheet = createCanvas(W * 3, fake.img.height);
  const sctx = sheet.getContext("2d");
  sctx.drawImage(toCanvas(real.img), 0, 0);
  sctx.drawImage(toCanvas(fake.img), W, 0);
  sctx.drawImage(toCanvas(green.img), 2 * W, 0);
  sctx.fillStyle = "#111";
  sctx.font = "700 64px Montserrat";
  sctx.fillText("real navy photo", 40, 80);
  sctx.fillText("white photo recoloured #001d43", W + 40, 80);
  sctx.fillText("recoloured #1F7A4D (no photo)", 2 * W + 40, 80);
  const id = sctx.getImageData(0, 0, sheet.width, sheet.height);
  await save("A-08-recolour-vs-real.png", { width: id.width, height: id.height, data: id.data }, { size: 2100 });
}

void main();
