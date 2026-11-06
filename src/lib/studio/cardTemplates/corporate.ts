import { GOLD, GREY, INK, L, NAVY, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

const X = 0.42;

/**
 * «Corporate»: a brand-colour band on the left with the logo (or the
 * company name), name / title / contacts on the right in a strict column.
 */
export const CORPORATE_CARDS = [
  cardFront("card-corporate", L("Corporativ", "Корпоративный", "Corporate"), { style: "corporate", industries: ["legal", "construction", "medical"], back: "card-back-logo" }, WHITE, [
    rect([0, 0, 0.35, 1], NAVY, { bindColor: "brandColor1" }),
    logoOr([0.08, 0.3, 0.19, 0.4], "monogram", { ring: true, ink: WHITE }),
    stack(X, 0.42, 0.5, [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY, { gap: 0.005 })], { anchor: "bottom", lh: 1.28 }),
    rect([X + 0.003, 0.475, 0.07, 0.01], GOLD, { bindColor: "brandColor2" }),
    stack(X, 0.55, 0.51, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: NAVY, iconBindColor: "brandColor1" }),
  ]),
];
