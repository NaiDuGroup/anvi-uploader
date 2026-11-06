import { GOLD, GREY, L, NAVY, SAFE_X, S_EMAIL, S_NAME, S_PHONE, S_TITLE, WHITE, cardTemplate, leftText, logo, rect } from "./helpers";

/** «Minimal»: white card, name and title on the left, a thin brand line, contacts, logo on the right. */
export const MINIMAL_CARDS = [
  cardTemplate("card-minimal", L("Minimal", "Минимализм", "Minimal"), WHITE, [
    logo([0.72, 0.2, 0.2, 0.34]),
    leftText(SAFE_X, 0.3, 0.56, 0.1, "Montserrat", NAVY, S_NAME, { bind: "name" }),
    leftText(SAFE_X, 0.45, 0.56, 0.055, "Open Sans", GREY, S_TITLE, { bind: "title", bold: false }),
    rect([SAFE_X, 0.56, 0.12, 0.012], GOLD, { bindColor: "brandColor1" }),
    leftText(SAFE_X, 0.7, 0.62, 0.05, "Open Sans", NAVY, S_PHONE, { bind: "phone", bold: false }),
    leftText(SAFE_X, 0.8, 0.62, 0.05, "Open Sans", NAVY, S_EMAIL, { bind: "email", bold: false }),
  ]),
];
