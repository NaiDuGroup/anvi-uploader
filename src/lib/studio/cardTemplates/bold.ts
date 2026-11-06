import { GOLD, L, WHITE, cardFront, contactRows, rect, row, stack } from "./helpers";

const RED = "#d7263d";

/** «Bold colour»: the whole card in the brand colour, a big white name, the details centred under a short line. */
export const BOLD_CARDS = [
  cardFront("card-bold", L("Culoare îndrăzneață", "Яркий цвет", "Bold colour"), { style: "bold", industries: ["beauty", "cafe", "events"], back: "card-back-slogan" }, null, [
    rect([0, 0, 1, 1], RED, { bindColor: "brandColor1" }),
    stack(0.5, 0.44, 0.84, [row("name", 0.13, "Oswald", WHITE, { bold: true, ls: 0.01 }), row("title", 0.05, "Montserrat", WHITE, { ls: 0.14, gap: 0.01 })], { align: "center", anchor: "bottom", lh: 1.2 }),
    rect([0.46, 0.51, 0.08, 0.01], GOLD, { bindColor: "brandColor2" }),
    stack(0.5, 0.58, 0.8, contactRows(0.047, "Open Sans", WHITE, { keys: ["phone", "email", "site"] }), { align: "center" }),
  ]),
];
