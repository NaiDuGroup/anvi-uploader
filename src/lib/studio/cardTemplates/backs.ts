import { GREY, L, NAVY, S_ADDRESS, S_COMPANY, S_EMAIL, S_NAME, S_PHONE, S_SITE, WHITE, cardTemplate, fullBleed, leftText, logo, text, vcardQr } from "./helpers";

const X = 0.48;

/** Backs («Verso»): the logo in the middle on the brand colour; a contact QR with the details. */
export const BACK_CARDS = [
  cardTemplate(
    "card-back-logo",
    L("Logo în centru", "Логотип по центру", "Centred logo"),
    null,
    [fullBleed(NAVY), logo([0.36, 0.2, 0.28, 0.44]), text(0.5, 0.8, 0.8, 0.06, "Montserrat", WHITE, S_COMPANY, { bind: "company", ls: 0.1 })],
    "back",
  ),
  cardTemplate(
    "card-back-qr",
    L("QR cu datele tale", "QR с вашими данными", "QR with your details"),
    WHITE,
    [
      vcardQr(0.24, 0.5, 0.52),
      leftText(X, 0.28, 0.44, 0.075, "Montserrat", NAVY, S_NAME, { bind: "name" }),
      leftText(X, 0.46, 0.44, 0.046, "Open Sans", GREY, S_PHONE, { bind: "phone", bold: false }),
      leftText(X, 0.58, 0.44, 0.046, "Open Sans", GREY, S_EMAIL, { bind: "email", bold: false }),
      leftText(X, 0.7, 0.44, 0.046, "Open Sans", GREY, S_SITE, { bind: "site", bold: false }),
      leftText(X, 0.82, 0.44, 0.046, "Open Sans", GREY, S_ADDRESS, { bind: "address", bold: false }),
    ],
    "back",
  ),
];
