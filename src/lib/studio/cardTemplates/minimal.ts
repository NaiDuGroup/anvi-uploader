import { GOLD, GREY, INK, L, SAFE_X, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

/**
 * «Minimal»: white card, generous whitespace, one accent colour. Name and
 * title above a short brand line, contacts with small icons under it, the
 * logo (or a monogram) on the right.
 */
export const MINIMAL_CARDS = [
  cardFront("card-minimal", L("Minimal", "Минимализм", "Minimal"), { style: "minimal", industries: ["it", "legal", "realty"], back: "card-back-qr" }, WHITE, [
    logoOr([0.71, 0.17, 0.22, 0.36]),
    stack(
      SAFE_X,
      0.43,
      0.58,
      [row("name", 0.09, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.05, "Open Sans", GREY, { gap: 0.005 })],
      { anchor: "bottom", lh: 1.28 },
    ),
    rect([SAFE_X + 0.004, 0.495, 0.08, 0.011], GOLD, { bindColor: "brandColor1" }),
    stack(SAFE_X, 0.575, 0.62, contactRows(0.047, "Open Sans", INK, { icons: true }), { iconColor: GOLD, iconBindColor: "brandColor1" }),
  ]),
];
