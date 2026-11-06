import { GOLD, GREY, L, NAVY, S_EMAIL, S_NAME, S_PHONE, S_SITE, S_TITLE, WHITE, cardTemplate, leftText, logo, rect } from "./helpers";

const X = 0.42;

/** «Corporate»: a brand-colour band on the left with the logo, details on the right. */
export const CORPORATE_CARDS = [
  cardTemplate("card-corporate", L("Corporativ", "Корпоративный", "Corporate"), WHITE, [
    rect([0, 0, 0.36, 1], NAVY, { bindColor: "brandColor1" }),
    logo([0.075, 0.3, 0.21, 0.4]),
    leftText(X, 0.28, 0.5, 0.09, "Montserrat", NAVY, S_NAME, { bind: "name" }),
    leftText(X, 0.41, 0.5, 0.05, "Open Sans", GREY, S_TITLE, { bind: "title", bold: false }),
    rect([X, 0.5, 0.1, 0.012], GOLD),
    leftText(X, 0.62, 0.5, 0.047, "Open Sans", NAVY, S_PHONE, { bind: "phone", bold: false }),
    leftText(X, 0.72, 0.5, 0.047, "Open Sans", NAVY, S_EMAIL, { bind: "email", bold: false }),
    leftText(X, 0.82, 0.5, 0.047, "Open Sans", NAVY, S_SITE, { bind: "site", bold: false }),
  ]),
];
