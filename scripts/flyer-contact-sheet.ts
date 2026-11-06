/**
 * Flyer templates contact sheet (dev tool, no network, no DB): every front
 * with its matching back on one format, drawn with the same sample details,
 * a sample photo and logo — to judge the set side by side.
 *
 *   npx tsx scripts/flyer-contact-sheet.ts [out.png] [format] [set] [look] [lang] [only]
 *
 * `format`: a5 (default) | a6 | dl | a4. `set`: full (default) | long (long
 * Romanian / Russian texts) | short (headline + phone only) | nologo | nophoto
 * | empty (samples). `look`: gallery (default, samples shown) | print
 * (untouched samples left out). `lang`: ro | ru | en. `only`: a template id
 * (that front and its back, big).
 */
import { writeFileSync } from "node:fs";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { buildCardDoc, matchingBack } from "../src/lib/studio/cardBuild";
import { nodeMeasure, registerCardFonts, renderCardSide } from "../src/lib/studio/cardTestKit";
import type { StudioImageLayer } from "../src/lib/studio/document";
import { flyerPrint, isFlyerFormatId } from "../src/lib/studio/flyer";
import { brandPaletteFromColors, logoLook } from "../src/lib/studio/palette";
import type { StudioRenderAssets } from "../src/lib/studio/render";
import type { StudioFields } from "../src/lib/studio/smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, studioSurfaces } from "../src/lib/studio/surfaces";
import { studioBackTemplates, studioTemplatesFor } from "../src/lib/studio/templates";
import type { ShopLang } from "../src/lib/storefront/i18n";

registerCardFonts();
const out: string = process.argv[2] ?? "flyer-contact-sheet.png";
const format: string = isFlyerFormatId(process.argv[3]) ? process.argv[3]! : "a5";
const set: string = process.argv[4] ?? "full";
const asPrinted: boolean = process.argv[5] === "print";
const lang: ShopLang = (["ro", "ru", "en"].includes(process.argv[6] ?? "") ? process.argv[6] : "ro") as ShopLang;
const only: string | undefined = process.argv[7];
const specs = studioSurfaces("flyer", flyerPrint(format));

function logoCanvas(): Canvas {
  const c = createCanvas(400, 400);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b5532f";
  ctx.beginPath();
  ctx.arc(200, 200, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c14e";
  ctx.font = "700 170px Montserrat";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DC", 200, 210);
  return c;
}

/** A «photo»: a warm landscape gradient with a sun and hills (stands in for a customer photo). */
function photoCanvas(): Canvas {
  const c = createCanvas(1600, 1200);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 1200);
  g.addColorStop(0, "#7fb3d5");
  g.addColorStop(0.55, "#f5cba7");
  g.addColorStop(1, "#7d5a3c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = "#fdebd0";
  ctx.beginPath();
  ctx.arc(1150, 380, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6e8b3d";
  ctx.beginPath();
  ctx.moveTo(0, 1200);
  ctx.quadraticCurveTo(500, 650, 1000, 1000);
  ctx.quadraticCurveTo(1300, 800, 1600, 950);
  ctx.lineTo(1600, 1200);
  ctx.fill();
  ctx.fillStyle = "#3e2f23";
  ctx.fillRect(320, 640, 260, 420);
  return c;
}
const logo = logoCanvas();
const pic = photoCanvas();
const look = logoLook(logo.getContext("2d").getImageData(0, 0, 400, 400).data, 400, 400);
const palette = brandPaletteFromColors(look.colors);
const logoSrc = { localId: "logo", naturalW: 400, naturalH: 400 };
const photoSrc = { localId: "photo", naturalW: 1600, naturalH: 1200 };

const base: StudioFields = {
  company: "Dor de Cafea",
  headline: "Reduceri de iarnă",
  subheadline: "La toată cafeaua și deserturile",
  body: "Vino cu prietenii și primești o prăjitură din partea casei la fiecare două cafele.",
  bullets: "Cafea de specialitate\nDeserturi de casă\nLivrare în tot orașul",
  offer: "−20%",
  date: "1–31 decembrie",
  phone: "+373 69 123 456",
  email: "salut@dordecafea.md",
  site: "www.dordecafea.md",
  address: "Str. Ștefan cel Mare 1, Chișinău",
};
const fieldsBySet: Record<string, StudioFields> = {
  full: { ...base, ...palette, logo: logoSrc },
  nologo: { ...base },
  nophoto: { ...base, ...palette, logo: logoSrc },
  short: { headline: "Deschidem un magazin nou!", phone: base.phone, ...palette, logo: logoSrc },
  long: {
    ...base,
    company: "Centrul Medical Stomatologic «Zâmbet Sănătos»",
    headline: "Профессиональная чистка зубов и отбеливание со скидкой",
    subheadline: "Programează-te acum și primești consultația gratuită la primul control",
    body: "Clinica noastră folosește echipamente moderne din Germania. Medicii cu experiență de peste 15 ani te ajută să ai un zâmbet sănătos — fără durere și fără stres.",
    bullets: "Консультация стоматолога бесплатно\nIgienizare profesională cu ultrasunete și Air Flow\nОтбеливание за один визит\nPlata în rate fără dobândă",
    offer: "de la 499 lei",
    date: "Până pe 31 decembrie 2026",
    address: "Bd. Dacia 27/3, of. 12, Chișinău",
    ...palette,
    logo: logoSrc,
  },
  empty: {},
};
const fields: StudioFields = fieldsBySet[set] ?? fieldsBySet.full!;
const withPhoto: boolean = set !== "nophoto" && set !== "empty";
const assets: StudioRenderAssets = {
  image: (l: StudioImageLayer) => (l.src?.localId === "logo" ? (logo as unknown as CanvasImageSource) : l.src?.localId === "photo" ? (pic as unknown as CanvasImageSource) : null),
  font: (f) => f,
};

const fronts = studioTemplatesFor("flyer").filter((t) => !only || t.id === only);
const backs = studioBackTemplates("flyer").filter((t) => !only || fronts.some((f) => f.back === t.id));
const front = specs.find((s) => s.id === CARD_FRONT_ID)!;
const backSpec = specs.find((s) => s.id === CARD_BACK_ID)!;
const TW: number = only ? 900 : format === "dl" ? 260 : 360;
const TH: number = Math.round((TW * front.heightMm) / front.widthMm);
const PAD = 22;
const LABEL = 26;
const pairs: number = only ? 1 : 3;
const pairW: number = TW * 2 + PAD;
const rowsFront: number = Math.ceil(fronts.length / pairs);
const backCols: number = only ? 2 : 6;
const rowsBack: number = only ? 0 : Math.ceil(backs.length / backCols);
const W: number = Math.max(PAD + pairs * (pairW + PAD * 2), PAD + backCols * (TW + PAD));
const H: number = PAD + rowsFront * (TH + LABEL + PAD) + (rowsBack ? 50 + rowsBack * (TH + LABEL + PAD) : 0);
const sheet = createCanvas(W, H);
const ctx = sheet.getContext("2d");
ctx.fillStyle = "#e9e6e1";
ctx.fillRect(0, 0, W, H);

async function tile(png: Buffer, x: number, y: number) {
  const img = await loadImage(png);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 10;
  ctx.drawImage(img, x, y, TW, TH);
  ctx.restore();
}

async function main() {
  const print: boolean = asPrinted && set !== "empty";
  ctx.font = "600 15px Open Sans";
  for (const [i, tpl] of fronts.entries()) {
    const x = PAD + (i % pairs) * (pairW + PAD * 2);
    const y = PAD + Math.floor(i / pairs) * (TH + LABEL + PAD);
    const back = matchingBack(tpl);
    const doc = buildCardDoc({ kind: "flyer", front: tpl, back, fields, lang, specs, measure: nodeMeasure, logo: fields.logo ? look : null, photo: withPhoto ? photoSrc : null });
    ctx.fillStyle = "#14213d";
    ctx.fillText(`${tpl.id} · ${tpl.style ?? "?"} · ${(tpl.purposes ?? []).join(", ")} → ${back?.id ?? "—"}`, x, y + 17);
    await tile(renderCardSide(doc, front, { widthPx: TW * 2, assets, asPrinted: print }), x, y + LABEL);
    if (back) await tile(renderCardSide(doc, backSpec, { widthPx: TW * 2, assets, asPrinted: print }), x + TW + PAD, y + LABEL);
  }
  if (rowsBack) {
    const y0 = PAD + rowsFront * (TH + LABEL + PAD) + 36;
    ctx.fillStyle = "#14213d";
    ctx.font = "800 20px Open Sans";
    ctx.fillText("Backs", PAD, y0 - 8);
    ctx.font = "600 15px Open Sans";
    const first = studioTemplatesFor("flyer")[0]!;
    for (const [i, tpl] of backs.entries()) {
      const x = PAD + (i % backCols) * (TW + PAD);
      const y = y0 + Math.floor(i / backCols) * (TH + LABEL + PAD);
      const doc = buildCardDoc({ kind: "flyer", front: first, back: tpl, fields, lang, specs, measure: nodeMeasure, logo: fields.logo ? look : null, photo: withPhoto ? photoSrc : null });
      ctx.fillStyle = "#14213d";
      ctx.fillText(tpl.id, x, y + 17);
      await tile(renderCardSide(doc, backSpec, { widthPx: TW * 2, assets, asPrinted: print }), x, y + LABEL);
    }
  }
  writeFileSync(out, sheet.encodeSync("png"));
  console.log(`${format}: ${fronts.length} fronts, ${backs.length} backs → ${out}`);
}
void main();
