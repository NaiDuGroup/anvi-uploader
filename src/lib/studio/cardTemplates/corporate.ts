import { GOLD, GREY, INK, L, NAVY, SAFE_X, SAFE_X_END, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

const X = 0.42;
const ROYAL = "#1d4e89";
const SKY = "#5fa8d3";
const RED = "#b3262d";
const STEEL = "#3d4a57";
const FOREST = "#1e5631";
const OLIVE = "#a4b82c";
const CHARCOAL = "#23272e";
const TEAL = "#0f6e73";
const AMBER = "#f2a541";

/**
 * «Corporate»: brand-colour areas (side band, header, diagonal panel,
 * footer band, dark card, top strip) and a strict column of details.
 */
export const CORPORATE_CARDS = [
  // Left band with the logo, name / title / contacts in a column on the right.
  cardFront("card-corporate", L("Corporativ", "Корпоративный", "Corporate"), { style: "corporate", industries: ["legal", "construction", "medical"], back: "card-back-logo" }, WHITE, [
    rect([0, 0, 0.35, 1], NAVY, { bindColor: "brandColor1" }),
    logoOr([0.08, 0.3, 0.19, 0.4], "monogram", { ring: true, ink: WHITE }),
    stack(X, 0.42, 0.51, [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY, { gap: 0.005 })], { anchor: "bottom", lh: 1.28 }),
    rect([X + 0.003, 0.475, 0.07, 0.01], GOLD, { bindColor: "brandColor2" }),
    stack(X, 0.55, 0.51, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: NAVY, iconBindColor: "brandColor1" }),
  ]),

  // Header band: name and title in white on the brand colour, logo on the band, contacts on white below.
  cardFront("card-corporate-header", L("Antet colorat", "Цветная шапка", "Colour header"), { style: "corporate", industries: ["legal", "it"], back: "card-back-qr" }, WHITE, [
    rect([0, 0, 1, 0.45], ROYAL, { bindColor: "brandColor1" }),
    rect([0, 0.45, 1, 0.012], SKY, { bindColor: "brandColor2" }),
    logoOr([0.76, 0.15, 0.17, 0.25], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.29, 0.66, [row("name", 0.088, "Montserrat", WHITE, { bold: true }), row("title", 0.048, "Open Sans", WHITE, { ls: 0.04 })], { anchor: "middle", lh: 1.26 }),
    stack(SAFE_X, 0.555, 0.62, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: ROYAL, iconBindColor: "brandColor1", lh: 1.38 }),
  ]),

  // Diagonal panel: a slanted brand panel on the right with the logo, details on the left.
  cardFront("card-corporate-diagonal", L("Panou oblic", "Косая панель", "Diagonal panel"), { style: "corporate", industries: ["auto", "transport"], back: "card-back-services" }, WHITE, [
    { k: "shape", shape: "rect", box: [0.705, -0.3, 0.5, 1.6], fill: RED, rot: 12, bindColor: "brandColor1" },
    { k: "shape", shape: "rect", box: [0.675, -0.3, 0.012, 1.6], fill: STEEL, rot: 12, bindColor: "brandColor2" },
    logoOr([0.77, 0.32, 0.16, 0.36], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.42, 0.56, [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", RED, { bold: true, ls: 0.04, bindColor: "brandColor1" })], { anchor: "bottom", lh: 1.28 }),
    stack(SAFE_X, 0.52, 0.56, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: RED, iconBindColor: "brandColor1", lh: 1.38 }),
  ]),

  // Footer band: name with an accent bar, contacts, logo top right, the company in white on a band along the bottom.
  cardFront("card-corporate-footer", L("Bandă jos", "Полоса снизу", "Footer band"), { style: "corporate", industries: ["construction", "realty"], back: "card-back-pattern" }, WHITE, [
    rect([0, 0.775, 1, 0.225], FOREST, { bindColor: "brandColor1" }),
    rect([0, 0.765, 1, 0.01], OLIVE, { bindColor: "brandColor2" }),
    rect([SAFE_X, 0.16, 0.008, 0.17], OLIVE, { bindColor: "brandColor2" }),
    logoOr([0.75, 0.15, 0.18, 0.3]),
    stack(0.095, 0.155, 0.62, [row("name", 0.088, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY)], { lh: 1.26 }),
    stack(SAFE_X, 0.43, 0.66, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: FOREST, iconBindColor: "brandColor1", lh: 1.36 }),
    stack(SAFE_X, 0.84, 0.86, [row("company", 0.048, "Montserrat", WHITE, { bold: true, ls: 0.14 })], { anchor: "middle", lh: 1.2 }),
  ]),

  // Dark card: the whole card in the deep ink (brand colour 3), a fine accent rule across, white details.
  cardFront("card-corporate-dark", L("Corporativ închis", "Тёмный корпоративный", "Dark corporate"), { style: "corporate", industries: ["auto", "legal"], back: "card-back-appointment" }, null, [
    rect([0, 0, 1, 1], CHARCOAL, { bindColor: "brandColor3" }),
    logoOr([0.75, 0.15, 0.18, 0.3], "monogram", { ring: true, ink: WHITE }),
    stack(SAFE_X, 0.44, 0.64, [row("name", 0.09, "Montserrat", WHITE, { bold: true }), row("title", 0.048, "Open Sans", GOLD, { ls: 0.08, bindColor: "brandColor2" })], { anchor: "bottom", lh: 1.26 }),
    rect([SAFE_X, 0.495, SAFE_X_END - SAFE_X, 0.005], GOLD, { bindColor: "brandColor2" }),
    stack(SAFE_X, 0.56, 0.7, contactRows(0.046, "Open Sans", WHITE, { icons: true }), { iconColor: GOLD, iconBindColor: "brandColor2", lh: 1.36 }),
  ]),

  // Letterhead: a two-tone strip along the top, logo and company as a header row, name and contacts below.
  cardFront("card-corporate-letterhead", L("Antet de firmă", "Фирменный бланк", "Letterhead"), { style: "corporate", industries: ["transport", "retail", "education"], back: "card-back-logo" }, WHITE, [
    // Amber under teal, both from the top edge: a thin amber line shows under the strip.
    rect([0, 0, 1, 0.1], AMBER, { bindColor: "brandColor2" }),
    rect([0, 0, 1, 0.086], TEAL, { bindColor: "brandColor1" }),
    logoOr([SAFE_X, 0.165, 0.1, 0.17]),
    stack(0.19, 0.25, 0.74, [row("company", 0.052, "Montserrat", TEAL, { bold: true, ls: 0.06, bindColor: "brandColor1" })], { anchor: "middle", lh: 1.2 }),
    stack(SAFE_X, 0.395, 0.86, [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY)], { lh: 1.24 }),
    stack(SAFE_X, 0.87, 0.62, contactRows(0.046, "Open Sans", INK, { icons: true, }), { anchor: "bottom", iconColor: TEAL, iconBindColor: "brandColor1", lh: 1.32 }),
  ]),
];
