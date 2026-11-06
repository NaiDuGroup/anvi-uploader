import { GREY, INK, L, NAVY, S_COMPANY, WHITE, cardTemplate, contactRows, logoOr, row, stack, text, vcardQr } from "./helpers";

const X = 0.47;

/** Backs («Verso»): they take the front's details and logo colours. */
export const BACK_CARDS = [
  cardTemplate(
    "card-back-logo",
    L("Logo în centru", "Логотип по центру", "Centred logo"),
    null,
    [
      { k: "shape", shape: "rect", box: [0, 0, 1, 1], fill: NAVY, bindColor: "brandColor1" },
      logoOr([0.37, 0.2, 0.26, 0.44], "monogram", { ring: true, ink: WHITE }),
      text(0.5, 0.79, 0.8, 0.06, "Montserrat", WHITE, S_COMPANY, { bind: "company", ls: 0.12 }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-qr",
    L("QR cu datele tale", "QR с вашими данными", "QR with your details"),
    WHITE,
    [
      vcardQr(0.255, 0.5, 0.6),
      stack(X, 0.5, 0.47, [row("name", 0.07, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.046, "Open Sans", GREY), ...contactRows(0.046, "Open Sans", INK, { icons: true, gap: 0.0 }).map((r, i) => (i === 0 ? { ...r, gap: 0.03 } : r))], {
        anchor: "middle",
        iconColor: NAVY,
        iconBindColor: "brandColor1",
      }),
    ],
    "back",
  ),
];
