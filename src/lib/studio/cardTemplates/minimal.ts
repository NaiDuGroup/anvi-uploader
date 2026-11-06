import { GOLD, GREY, INK, L, SAFE_X, SAFE_X_END, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

const TEAL = "#1b7f79";
const TEAL_LIGHT = "#7cc4bd";
const CHARCOAL = "#2f3640";
const CORAL = "#d9644a";
const BURGUNDY = "#8c1c3a";
const ROSE = "#d79aa8";
const FOREST = "#1f6b3a";
const LIME = "#9bc53d";

/** Thin hairline (≈0.25 mm) as a filled rect, `x`…`x + w` at height `y`. */
const hair = (x: number, y: number, w: number, fill: string, bind: "brandColor1" | "brandColor2" = "brandColor2") => rect([x, y, w, 0.005], fill, { bindColor: bind });

/**
 * «Minimal»: white card, generous whitespace, one accent colour. Five
 * layouts: left column, centred, right-aligned beside the logo, corner
 * brackets, and a side stripe with the details across the top.
 */
export const MINIMAL_CARDS = [
  // Left column: name and title above a short brand line, contacts with icons, logo top right.
  cardFront("card-minimal", L("Minimal", "Минимализм", "Minimal"), { style: "minimal", industries: ["it", "legal", "realty"], back: "card-back-qr" }, WHITE, [
    logoOr([0.72, 0.17, 0.21, 0.34]),
    stack(
      SAFE_X,
      0.43,
      0.62,
      [row("name", 0.09, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.05, "Open Sans", GREY, { gap: 0.005 })],
      { anchor: "bottom", lh: 1.28 },
    ),
    rect([SAFE_X + 0.004, 0.495, 0.08, 0.011], GOLD, { bindColor: "brandColor1" }),
    stack(SAFE_X, 0.575, 0.64, contactRows(0.047, "Open Sans", INK, { icons: true }), { iconColor: GOLD, iconBindColor: "brandColor1" }),
  ]),

  // Centred: small logo on top, name, a short rule, contacts in one centred column.
  cardFront("card-minimal-center", L("Minimal centrat", "Минимализм по центру", "Minimal centred"), { style: "minimal", industries: ["medical", "education"], back: "card-back-appointment" }, WHITE, [
    logoOr([0.44, 0.125, 0.12, 0.18]),
    stack(
      0.5,
      0.34,
      0.84,
      [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", TEAL, { ls: 0.06, bindColor: "brandColor1" })],
      { align: "center", lh: 1.24 },
    ),
    rect([0.475, 0.525, 0.05, 0.008], TEAL_LIGHT, { bindColor: "brandColor2" }),
    stack(0.5, 0.57, 0.84, contactRows(0.046, "Open Sans", INK), { align: "center", lh: 1.32 }),
  ]),

  // Right-aligned: the logo on the left behind a vertical hairline, everything else flush right.
  cardFront("card-minimal-right", L("Minimal la dreapta", "Минимализм справа", "Minimal right"), { style: "minimal", industries: ["realty", "construction"], back: "card-back-map" }, WHITE, [
    logoOr([SAFE_X, 0.32, 0.18, 0.36]),
    rect([0.3, 0.17, 0.0035, 0.66], CORAL, { bindColor: "brandColor2" }),
    stack(
      SAFE_X_END,
      0.45,
      0.58,
      [
        row("company", 0.046, "Montserrat", CORAL, { bold: true, ls: 0.12, bindColor: "brandColor1" }),
        row("name", 0.088, "Montserrat", CHARCOAL, { bold: true, bindColor: "brandColor3", gap: 0.015 }),
        row("title", 0.048, "Open Sans", GREY),
      ],
      { align: "right", anchor: "bottom", lh: 1.28 },
    ),
    stack(SAFE_X_END, 0.53, 0.58, contactRows(0.046, "Open Sans", CHARCOAL, { icons: true }), { align: "right", iconColor: CORAL, iconBindColor: "brandColor1", lh: 1.38 }),
  ]),

  // Corner brackets: fine L-shaped marks in two corners frame a left column; logo bottom right.
  cardFront("card-minimal-corner", L("Colțuri fine", "Тонкие уголки", "Fine corners"), { style: "minimal", industries: ["retail", "beauty"], back: "card-back-loyalty" }, WHITE, [
    // Top-left bracket.
    rect([0.045, 0.075, 0.09, 0.007], BURGUNDY, { bindColor: "brandColor1" }),
    rect([0.045, 0.075, 0.004, 0.15], BURGUNDY, { bindColor: "brandColor1" }),
    // Bottom-right bracket.
    rect([0.865, 0.918, 0.09, 0.007], BURGUNDY, { bindColor: "brandColor1" }),
    rect([0.951, 0.775, 0.004, 0.15], BURGUNDY, { bindColor: "brandColor1" }),
    logoOr([0.75, 0.56, 0.16, 0.28]),
    stack(
      0.1,
      0.19,
      0.8,
      [row("name", 0.092, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", BURGUNDY, { ls: 0.08, bindColor: "brandColor1" })],
      { lh: 1.26 },
    ),
    hair(0.1, 0.445, 0.12, ROSE),
    stack(0.1, 0.52, 0.62, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: BURGUNDY, iconBindColor: "brandColor1", lh: 1.38 }),
  ]),

  // Side stripe: a brand stripe down the left edge, logo top left, contacts flush right at the top, name across the bottom.
  cardFront("card-minimal-stripe", L("Dungă laterală", "Боковая полоса", "Side stripe"), { style: "minimal", industries: ["it", "education"], back: "card-back-slogan" }, WHITE, [
    rect([0, 0, 0.045, 1], FOREST, { bindColor: "brandColor1" }),
    logoOr([0.1, 0.15, 0.16, 0.28]),
    stack(SAFE_X_END, 0.15, 0.6, contactRows(0.046, "Open Sans", INK, { icons: true }), { align: "right", iconColor: FOREST, iconBindColor: "brandColor1", lh: 1.36 }),
    hair(0.1, 0.565, 0.83, LIME),
    stack(
      0.1,
      0.87,
      0.83,
      [row("name", 0.095, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY, { gap: 0.004 })],
      { anchor: "bottom", lh: 1.26 },
    ),
  ]),
];
