import { CREAM, GOLD, INK, L, S_EMAIL, S_NAME, S_PHONE, S_TITLE, cardTemplate, rect, text } from "./helpers";

/** «Elegant»: cream card, a fine gold frame, serif name. */
export const ELEGANT_CARDS = [
  cardTemplate("card-elegant", L("Elegant", "Элегантный", "Elegant"), CREAM, [
    rect([0.07, 0.12, 0.86, 0.76], null, { stroke: GOLD, strokeMm: 0.3 }),
    text(0.5, 0.36, 0.76, 0.1, "Playfair Display", INK, S_NAME, { bind: "name", italic: true }),
    text(0.5, 0.5, 0.7, 0.05, "Cormorant Garamond", GOLD, S_TITLE, { bind: "title", ls: 0.18 }),
    rect([0.45, 0.585, 0.1, 0.008], GOLD),
    text(0.5, 0.68, 0.7, 0.047, "Open Sans", INK, S_PHONE, { bind: "phone", bold: false }),
    text(0.5, 0.78, 0.7, 0.047, "Open Sans", INK, S_EMAIL, { bind: "email", bold: false }),
  ]),
];
