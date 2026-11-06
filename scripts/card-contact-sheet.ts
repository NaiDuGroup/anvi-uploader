/**
 * Business-card templates contact sheet (dev tool, no network, no DB):
 * every front with its matching back, drawn with the same sample details,
 * then every back alone — to judge the template set side by side.
 *
 *   npx tsx scripts/card-contact-sheet.ts [out.png] [set] [logo colour] [look]
 *
 * `set`: full (default) | short (name, title, phone, email only) | nologo |
 * long (long Romanian name, long Russian title, landline) | empty (samples).
 * `logo colour` (e.g. `#e8772e`): a one-colour round logo (white letters,
 * transparent around) instead of the two-colour terracotta one.
 * `look`: gallery (default: samples shown, as the gallery draws them) | print
 * (exactly what is printed: untouched samples left out).
 */
import { writeFileSync } from "node:fs";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { buildCardDoc, matchingBack } from "../src/lib/studio/cardBuild";
import { nodeMeasure, registerCardFonts, renderCardSide } from "../src/lib/studio/cardTestKit";
import type { StudioImageLayer } from "../src/lib/studio/document";
import { brandPaletteFromColors, logoLook } from "../src/lib/studio/palette";
import type { StudioRenderAssets } from "../src/lib/studio/render";
import type { StudioFields } from "../src/lib/studio/smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, studioSurfaces } from "../src/lib/studio/surfaces";
import { studioCardBackTemplates, studioTemplatesFor } from "../src/lib/studio/templates";

registerCardFonts();
const out: string = process.argv[2] ?? "card-contact-sheet.png";
const set: string = process.argv[3] ?? "full";
const specs = studioSurfaces("card");

const logoHex: string | undefined = process.argv[4]?.startsWith("#") ? process.argv[4] : undefined;
const asPrinted: boolean = process.argv[5] === "print";

// A round logo drawn here (terracotta disc with cream letters, or one colour with white letters): the palette comes from its pixels.
function logoCanvas(): Canvas {
  const c = createCanvas(400, 400);
  const ctx = c.getContext("2d");
  ctx.fillStyle = logoHex ?? "#b5532f";
  ctx.beginPath();
  ctx.arc(200, 200, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = logoHex ? "#ffffff" : "#f2c14e";
  ctx.font = "700 170px Montserrat";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DC", 200, 210);
  return c;
}
const logo = logoCanvas();
const look = logoLook(logo.getContext("2d").getImageData(0, 0, 400, 400).data, 400, 400);
const palette = brandPaletteFromColors(look.colors);

const base: StudioFields = {
  name: "Ana Ciobanu",
  title: "Director de vânzări",
  company: "Dor de Cafea",
  phone: "+373 69 123 456",
  email: "ana@dordecafea.md",
  site: "www.dordecafea.md",
  address: "Str. Ștefan cel Mare 1, Chișinău",
};
const fieldsBySet: Record<string, StudioFields> = {
  full: { ...base, ...palette, logo: { localId: "logo", naturalW: 400, naturalH: 400 } },
  nologo: { ...base },
  short: { name: base.name, title: base.title, phone: base.phone, email: base.email, ...palette, logo: { localId: "logo", naturalW: 400, naturalH: 400 } },
  long: { ...base, name: "Alexandru-Constantin Munteanu", title: "Главный бухгалтер-ревизор", phone: "+373 22 12 34 56", company: "Contabilitate & Audit Expert", ...palette },
  empty: {},
};
const fields: StudioFields = fieldsBySet[set] ?? fieldsBySet.full!;
const assets: StudioRenderAssets = { image: (l: StudioImageLayer) => (l.src?.localId === "logo" ? (logo as unknown as CanvasImageSource) : null), font: (f) => f };

const fronts = studioTemplatesFor("card");
const backs = studioCardBackTemplates();
const TW = 560;
const TH = Math.round((TW * 54) / 94);
const PAD = 24;
const LABEL = 28;
const cols = 2; // a pair (front + back) per column
const pairW = TW * 2 + PAD;
const rowsFront = Math.ceil(fronts.length / cols);
const rowsBack = Math.ceil(backs.length / 4);
const W = PAD + cols * (pairW + PAD * 2);
const H = PAD + rowsFront * (TH + LABEL + PAD) + 60 + rowsBack * (TH + LABEL + PAD);
const sheet = createCanvas(W, H);
const ctx = sheet.getContext("2d");
ctx.fillStyle = "#e9e6e1";
ctx.fillRect(0, 0, W, H);
ctx.font = "600 18px Open Sans";

async function tile(png: Buffer, x: number, y: number) {
  const { loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(png);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 10;
  ctx.drawImage(img, x, y, TW, TH);
  ctx.restore();
}

async function main() {
  const front = specs.find((s) => s.id === CARD_FRONT_ID)!;
  const backSpec = specs.find((s) => s.id === CARD_BACK_ID)!;
  for (const [i, tpl] of fronts.entries()) {
    const x = PAD + (i % cols) * (pairW + PAD * 2);
    const y = PAD + Math.floor(i / cols) * (TH + LABEL + PAD);
    const back = matchingBack(tpl);
    const doc = buildCardDoc({ front: tpl, back, fields, lang: "ro", specs, measure: nodeMeasure, logo: fields.logo ? look : null });
    ctx.fillStyle = "#14213d";
    ctx.fillText(`${tpl.id}  ·  ${tpl.style ?? "?"}  ·  ${(tpl.industries ?? []).join(", ")}  →  ${back?.id ?? "—"}`, x, y + 18);
    await tile(renderCardSide(doc, front, { widthPx: TW, assets, asPrinted: asPrinted && set !== "empty" }), x, y + LABEL);
    if (back) await tile(renderCardSide(doc, backSpec, { widthPx: TW, assets, asPrinted: asPrinted && set !== "empty" }), x + TW + PAD, y + LABEL);
  }
  const y0 = PAD + rowsFront * (TH + LABEL + PAD) + 40;
  ctx.fillStyle = "#14213d";
  ctx.font = "800 22px Open Sans";
  ctx.fillText("Backs", PAD, y0 - 8);
  ctx.font = "600 18px Open Sans";
  for (const [i, tpl] of backs.entries()) {
    const x = PAD + (i % 4) * (TW + PAD);
    const y = y0 + Math.floor(i / 4) * (TH + LABEL + PAD);
    const doc = buildCardDoc({ front: fronts[0]!, back: tpl, fields, lang: "ro", specs, measure: nodeMeasure, logo: fields.logo ? look : null });
    ctx.fillStyle = "#14213d";
    ctx.fillText(tpl.id, x, y + 18);
    await tile(renderCardSide(doc, backSpec, { widthPx: TW, assets, asPrinted: asPrinted && set !== "empty" }), x, y + LABEL);
  }
  writeFileSync(out, sheet.encodeSync("png"));
  console.log(`${fronts.length} fronts, ${backs.length} backs → ${out}`);
}
void main();
