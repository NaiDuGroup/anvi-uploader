import { CREAM, GOLD, INK, L, cardFront, contactRows, rect, row, stack } from "./helpers";

/** «Elegant»: cream card, a fine gold frame, a serif name, the details centred under a thin gold rule. */
export const ELEGANT_CARDS = [
  cardFront("card-elegant", L("Elegant", "Элегантный", "Elegant"), { style: "elegant", industries: ["legal", "events", "agro"], back: "card-back-pattern" }, CREAM, [
    rect([0.07, 0.12, 0.86, 0.76], null, { stroke: GOLD, strokeMm: 0.3 }),
    stack(
      0.5,
      0.5,
      0.74,
      [row("name", 0.1, "Playfair Display", INK, { italic: true, bold: true }), row("title", 0.05, "Cormorant Garamond", GOLD, { bold: true, ls: 0.16, gap: 0.005 })],
      { align: "center", anchor: "bottom", lh: 1.25 },
    ),
    rect([0.46, 0.56, 0.08, 0.006], GOLD),
    stack(0.5, 0.61, 0.74, contactRows(0.046, "Open Sans", INK, { keys: ["phone", "email", "site"] }), { align: "center" }),
  ]),
];
