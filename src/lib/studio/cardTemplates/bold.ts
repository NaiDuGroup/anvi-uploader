import { GOLD, GREY, INK, L, SAFE_X, WHITE, cardFront, contactRows, dot, logoOr, rect, row, stack } from "./helpers";

const RED = "#d7263d";
const ROYAL = "#1f4fd8";
const SKY = "#52b6f0";
const MUSTARD = "#f2b705";
const TEAL = "#0b7a75";
const CORAL = "#ff7a59";
const ORANGE = "#ef6a32";
const VIOLET = "#5b2a86";
const PINK = "#f08cae";

/** Taxi chequers: dark squares on the strip at the right edge, two columns of 4.5 mm. */
function chequers(): ReturnType<typeof rect>[] {
  const side = 4.5;
  const out: ReturnType<typeof rect>[] = [];
  for (let k = 0; k < 11; k++) {
    const col = k % 2;
    out.push(rect([(83 + col * side) / 94, (2 + k * side) / 54, side / 94, side / 54], MUSTARD, { bindColor: "brandColor1" }));
  }
  return out;
}

/**
 * «Bold colour»: strong brand colour, big type. Six different builds — the
 * whole card in colour with a centred name, a diagonal slab, a colour
 * header, a huge circle, taxi chequers, translucent bubbles.
 */
export const BOLD_CARDS = [
  // Centred: the whole card in the brand colour, a big white name, details under a short accent line.
  cardFront("card-bold", L("Culoare îndrăzneață", "Яркий цвет", "Bold colour"), { style: "bold", industries: ["beauty", "cafe", "events"], back: "card-back-slogan" }, null, [
    rect([0, 0, 1, 1], RED, { bindColor: "brandColor1" }),
    stack(0.5, 0.45, 0.84, [row("name", 0.13, "Oswald", WHITE, { bold: true, ls: 0.01 }), row("title", 0.05, "Montserrat", WHITE, { ls: 0.14, gap: 0.01 })], { align: "center", anchor: "bottom", lh: 1.2 }),
    rect([0.46, 0.52, 0.08, 0.012], GOLD, { bindColor: "brandColor2" }),
    stack(0.5, 0.59, 0.8, contactRows(0.047, "Open Sans", WHITE, { keys: ["phone", "email", "site"] }), { align: "center", lh: 1.38 }),
  ]),

  // Diagonal: white card, a tilted two-tone slab on the right holding the logo; strict left column.
  cardFront("card-bold-diagonal", L("Diagonală", "Диагональ", "Diagonal"), { style: "bold", industries: ["auto", "construction"], back: "card-back-services" }, WHITE, [
    rect([(81 - 20) / 94, -9 / 54, 40 / 94, 72 / 54], SKY, { bindColor: "brandColor2", rot: 10 }),
    rect([(86 - 20) / 94, -9 / 54, 40 / 94, 72 / 54], ROYAL, { bindColor: "brandColor1", rot: 10 }),
    logoOr([0.77, 0.34, 0.16, 0.32], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.45, 0.48, [row("name", 0.088, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.05, "Open Sans", GREY, { gap: 0.005 })], { anchor: "bottom", lh: 1.25 }),
    rect([SAFE_X + 0.003, 0.5, 0.09, 0.014], ROYAL, { bindColor: "brandColor1" }),
    stack(SAFE_X, 0.57, 0.48, contactRows(0.047, "Open Sans", INK, { icons: true }), { iconColor: ROYAL, iconBindColor: "brandColor1", lh: 1.36 }),
  ]),

  // Colour header: the top 56 % in the brand colour with the name in white and the logo; contacts in two columns below.
  cardFront("card-bold-header", L("Antet color", "Цветная шапка", "Colour header"), { style: "bold", industries: ["retail", "it"], back: "card-back-loyalty" }, WHITE, [
    rect([0, 0, 1, 0.56], TEAL, { bindColor: "brandColor1" }),
    rect([0, 0.56, 1, 0.03], CORAL, { bindColor: "brandColor2" }),
    logoOr([0.75, 0.15, 0.17, 0.3], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.47, 0.64, [row("name", 0.1, "Montserrat", WHITE, { bold: true }), row("title", 0.05, "Open Sans", WHITE, { ls: 0.06, gap: 0.004 })], { anchor: "bottom", lh: 1.22 }),
    stack(SAFE_X, 0.735, 0.4, contactRows(0.047, "Open Sans", INK, { keys: ["phone", "email"], icons: true }), { anchor: "middle", iconColor: TEAL, iconBindColor: "brandColor1", lh: 1.4 }),
    stack(0.5, 0.735, 0.43, contactRows(0.047, "Open Sans", INK, { keys: ["site", "address"], icons: true }), { anchor: "middle", iconColor: TEAL, iconBindColor: "brandColor1", lh: 1.4 }),
  ]),

  // Big circle: a brand disc running off the left edge with the logo; details on the right.
  cardFront("card-bold-circle", L("Cerc mare", "Большой круг", "Big circle"), { style: "bold", industries: ["cafe", "agro"], back: "card-back-map" }, WHITE, [
    { k: "shape", shape: "ellipse", box: [(6 - 35) / 94, (27 - 35) / 54, 70 / 94, 70 / 54], fill: GOLD, bindColor: "brandColor2" },
    { k: "shape", shape: "ellipse", box: [(2 - 33) / 94, (27 - 33) / 54, 66 / 94, 66 / 54], fill: ORANGE, bindColor: "brandColor1" },
    logoOr([0.07, 0.3, 0.2, 0.4], "monogram", { ring: true, ink: WHITE }),
    stack(0.49, 0.45, 0.44, [row("name", 0.092, "Oswald", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.05, "Montserrat", GREY, { gap: 0.004 })], { anchor: "bottom", lh: 1.22 }),
    dot(0.5, 0.512, 0.028, ORANGE, { bindColor: "brandColor1" }),
    dot(0.532, 0.512, 0.028, GOLD, { bindColor: "brandColor2" }),
    stack(0.49, 0.58, 0.44, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: ORANGE, iconBindColor: "brandColor1", lh: 1.36 }),
  ]),

  // Taxi: mustard card, dark ink, a chequered strip at the right edge, big condensed name.
  cardFront("card-bold-taxi", L("Damier", "Шашечки", "Chequers"), { style: "bold", industries: ["transport", "auto"], back: "card-back-qr" }, "#000000", [
    rect([0, 0, 1, 1], MUSTARD, { bindColor: "brandColor1" }),
    rect([83 / 94, 0, 11 / 94, 1], INK, { bindColor: "brandColor3" }),
    ...chequers(),
    logoOr([0.67, 0.13, 0.15, 0.24], "monogram", { ink: MUSTARD, fill: INK, bindColor: "brandColor3", inkBindColor: "brandColor1" }),
    stack(SAFE_X, 0.15, 0.56, [row("name", 0.12, "Oswald", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.052, "Montserrat", INK, { bold: true, ls: 0.1, bindColor: "brandColor3" })], { anchor: "top", lh: 1.18 }),
    rect([SAFE_X, 0.41, 0.74, 0.016], INK, { bindColor: "brandColor3" }),
    stack(SAFE_X, 0.87, 0.74, contactRows(0.048, "Open Sans", INK, { icons: true, bindColor: "brandColor3" }), { anchor: "bottom", iconColor: INK, iconBindColor: "brandColor3", lh: 1.34 }),
  ]),

  // Bubbles: violet card, translucent circles on the right, name and details on the left, logo in a ring.
  cardFront("card-bold-bubbles", L("Bule", "Пузыри", "Bubbles"), { style: "bold", industries: ["education", "medical"], back: "card-back-appointment" }, null, [
    rect([0, 0, 1, 1], VIOLET, { bindColor: "brandColor1" }),
    { k: "shape", shape: "ellipse", box: [0.66, 0.32, 0.6, 1.05], fill: PINK, bindColor: "brandColor2", opacity: 0.45 },
    { k: "shape", shape: "ellipse", box: [0.72, -0.45, 0.45, 0.82], fill: PINK, bindColor: "brandColor2", opacity: 0.25 },
    logoOr([0.74, 0.17, 0.17, 0.3], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.47, 0.6, [row("name", 0.095, "Comfortaa", WHITE, { bold: true }), row("title", 0.05, "Open Sans", WHITE, { gap: 0.006 })], { anchor: "bottom", lh: 1.24 }),
    rect([SAFE_X + 0.003, 0.52, 0.06, 0.012], PINK, { bindColor: "brandColor2" }),
    stack(SAFE_X, 0.585, 0.56, contactRows(0.046, "Open Sans", WHITE, { icons: true }), { iconColor: PINK, iconBindColor: "brandColor2", lh: 1.36 }),
  ]),
];
