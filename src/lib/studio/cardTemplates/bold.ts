import { L, S_EMAIL, S_NAME, S_PHONE, S_TITLE, WHITE, cardTemplate, fullBleed, text } from "./helpers";

const RED = "#d7263d";

/** «Bold colour»: the whole card in the brand colour, big white name. */
export const BOLD_CARDS = [
  cardTemplate("card-bold", L("Culoare îndrăzneață", "Яркий цвет", "Bold colour"), null, [
    fullBleed(RED),
    text(0.5, 0.38, 0.84, 0.12, "Oswald", WHITE, S_NAME, { bind: "name", ls: 0.02 }),
    text(0.5, 0.55, 0.8, 0.055, "Montserrat", WHITE, S_TITLE, { bind: "title", ls: 0.12 }),
    text(0.3, 0.76, 0.4, 0.048, "Open Sans", WHITE, S_PHONE, { bind: "phone" }),
    text(0.7, 0.76, 0.4, 0.048, "Open Sans", WHITE, S_EMAIL, { bind: "email" }),
  ]),
];
