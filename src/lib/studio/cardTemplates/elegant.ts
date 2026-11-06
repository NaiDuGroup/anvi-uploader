import { CREAM, GOLD, INK, L, SAFE_X, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

const NOIR = "#161616";
const BRONZE = "#b08d57";
const IVORY = "#fbf7ef";
const BURGUNDY = "#6d1f2f";
const EMERALD = "#16382e";
const CHAMPAGNE = "#d8c08f";

/**
 * «Elegant»: quiet colours (cream, ivory, black, burgundy, deep green) with a
 * gold-look accent, serif names, thin rules and lots of air. With the
 * customer's colours the dark grounds take the deep ink (brand colour 3, a
 * dark shade of the logo's colour), the logo's own colour only the accents.
 */
export const ELEGANT_CARDS = [
  // Centred: cream card, a fine gold frame, a serif name, details under a thin gold rule.
  cardFront("card-elegant", L("Elegant", "Элегантный", "Elegant"), { style: "elegant", industries: ["legal", "events", "agro"], back: "card-back-pattern" }, CREAM, [
    rect([0.07, 0.12, 0.86, 0.76], null, { stroke: GOLD, strokeMm: 0.3 }),
    stack(
      0.5,
      0.5,
      0.74,
      [row("name", 0.1, "Playfair Display", INK, { italic: true, bold: true, bindColor: "brandColor3" }), row("title", 0.05, "Cormorant Garamond", GOLD, { bold: true, ls: 0.16, gap: 0.005 })],
      { align: "center", anchor: "bottom", lh: 1.25 },
    ),
    rect([0.46, 0.56, 0.08, 0.006], GOLD),
    stack(0.5, 0.61, 0.74, contactRows(0.046, "Open Sans", INK, { keys: ["phone", "email", "site"] }), { align: "center", lh: 1.38 }),
  ]),

  // Noir: black card, the name in large Cormorant on the left under a gold hairline, logo in a gold ring on the right.
  cardFront("card-elegant-noir", L("Noir", "Нуар", "Noir"), { style: "elegant", industries: ["beauty", "legal"], back: "card-back-qr" }, null, [
    rect([0, 0, 1, 1], NOIR, { bindColor: "brandColor3" }),
    logoOr([0.75, 0.16, 0.16, 0.3], "monogram", { ring: true, ink: BRONZE, font: "Cormorant Garamond" }),
    stack(SAFE_X, 0.43, 0.64, [row("name", 0.115, "Cormorant Garamond", WHITE, { bold: true }), row("title", 0.048, "Montserrat", BRONZE, { ls: 0.2, bindColor: "brandColor2" })], { anchor: "bottom", lh: 1.2 }),
    rect([SAFE_X, 0.495, 0.86, 0.004], BRONZE, { bindColor: "brandColor2" }),
    stack(SAFE_X, 0.57, 0.6, contactRows(0.046, "Open Sans", WHITE, { icons: true }), { iconColor: BRONZE, iconBindColor: "brandColor2", lh: 1.38 }),
  ]),

  // Burgundy: ivory top with the logo and a centred serif name, a deep burgundy foot with the details.
  cardFront("card-elegant-bordeaux", L("Bordo", "Бордо", "Bordeaux"), { style: "elegant", industries: ["agro", "cafe"], back: "card-back-slogan" }, IVORY, [
    rect([0, 0.6, 1, 0.4], BURGUNDY, { bindColor: "brandColor3" }),
    rect([0.3, 0.6, 0.4, 0.008], BRONZE, { bindColor: "brandColor2" }),
    logoOr([0.43, 0.13, 0.14, 0.17], "monogram", { fill: BURGUNDY }),
    stack(
      0.5,
      0.56,
      0.84,
      [row("name", 0.1, "Playfair Display", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.046, "Cormorant Garamond", BURGUNDY, { bold: true, italic: true, ls: 0.06, bindColor: "brandColor1" })],
      { align: "center", anchor: "bottom", lh: 1.18 },
    ),
    stack(0.5, 0.745, 0.84, contactRows(0.046, "Open Sans", WHITE, { keys: ["phone", "email", "site"] }), { align: "center", anchor: "middle", lh: 1.3 }),
  ]),

  // Emerald: deep green card, a monogram in a champagne ring on the left, a fine vertical rule, the details on the right.
  cardFront("card-elegant-emerald", L("Smarald", "Изумруд", "Emerald"), { style: "elegant", industries: ["realty", "legal"], back: "card-back-qr" }, null, [
    rect([0, 0, 1, 1], EMERALD, { bindColor: "brandColor3" }),
    logoOr([0.09, 0.3, 0.22, 0.4], "monogram", { ring: true, ink: CHAMPAGNE, font: "Playfair Display" }),
    rect([0.37, 0.2, 0.004, 0.6], CHAMPAGNE, { bindColor: "brandColor2" }),
    stack(0.42, 0.46, 0.51, [row("name", 0.092, "Playfair Display", WHITE, { italic: true }), row("title", 0.046, "Montserrat", CHAMPAGNE, { ls: 0.16, gap: 0.006, bindColor: "brandColor2" })], { anchor: "bottom", lh: 1.24 }),
    stack(0.42, 0.56, 0.51, contactRows(0.046, "Open Sans", WHITE, { icons: true }), { iconColor: CHAMPAGNE, iconBindColor: "brandColor2", lh: 1.36 }),
  ]),
];
