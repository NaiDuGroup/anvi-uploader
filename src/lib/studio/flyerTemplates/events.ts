import type { StudioTemplate } from "../templates";
import { GREY, INK, L, WHITE, contacts, disc, flow, headline, item, rect, shape, stack } from "./helpers";
import { COL, X0, X1, contactBar, contactsCentered, fade, fieldPill, front, logo, photoSpot, roundSpot, rule } from "./kit";

const MIDNIGHT = "#1a1033";
const MAGENTA = "#ff3d81";
const IVORY = "#fbf7f0";
const GOLD = "#b8913a";
const PINE = "#123b2c";
const XGOLD = "#e3b04b";
const XRED = "#c8102e";
const SNOW = "#f3e3e3";

/** Parties, concerts, invitations, Christmas / New Year. */
export const EVENT_FLYERS: StudioTemplate[] = [
  // Poster: the photo on top fading into a deep ground, the date huge in the accent, the title under it.
  front(
    "flyer-events-poster",
    L("Afiș eveniment", "Афиша", "Event poster"),
    { style: "bold", purposes: ["events", "opening", "education"], back: "flyer-back-contacts" },
    WHITE,
    (g) => {
      const pb: number = g.pick(0.5, 0.46);
      return [
        rect([0, 0, 1, 1], MIDNIGHT, { bindColor: "brandColor3" }),
        ...photoSpot(g, [0, 0, 1, pb], MAGENTA, { opacity: 0.25 }),
        ...fade(pb - 0.16, pb, MIDNIGHT, { n: 8, max: 0.58, bind: "brandColor3" }),
        logo(g, [0.63, g.y0, 0.3, g.v(0.1)]),
        flow(X0, pb - g.v(0.06), COL, g.pick(0.86, 0.87) - pb, [
          item("date", 0.13, "Oswald", MAGENTA, { bold: true, lh: 1, bindColor: "brandColor1" }),
          headline(0.1, "Oswald", WHITE, { lh: 1.02, gap: 0.012 }),
          item("subheadline", 0.042, "Roboto", WHITE, { gap: 0.014 }),
          item("body", 0.034, "Roboto", "#c9c3d9", { gap: 0.012, lh: 1.4 }),
        ], { anchor: "middle" }),
        ...fieldPill(g, "offer", [X0, g.y1 - g.v(0.1), 0.36, g.v(0.1)], MAGENTA, item("offer", 0.045, "Oswald", WHITE, { bold: true, lh: 1 }), { bind: "brandColor1", pad: 0.02 }),
        stack(X1, g.y1, 0.46, contacts(0.032, "Roboto", WHITE, { keys: ["phone", "site"], icons: true }).map((r, i) => (i === 0 ? { ...r, bold: true } : r)), {
          align: "right",
          anchor: "bottom",
          lh: 1.45,
          iconColor: MAGENTA,
          iconBindColor: "brandColor1",
        }),
      ];
    },
  ),

  // Invitation: ivory with a double hairline frame, a round photo in a gold ring, a serif title and the date.
  front(
    "flyer-events-elegant",
    L("Invitație", "Приглашение", "Invitation"),
    { style: "elegant", purposes: ["events", "food", "beauty"], back: "flyer-back-logo" },
    IVORY,
    (g) => {
      const cy: number = g.pick(0.25, 0.2);
      return [
        { k: "shape", shape: "rect", box: [0.058, g.v(0.06), 0.884, 1 - g.v(0.12)], fill: null, stroke: GOLD, strokeMm: 0.6 },
        { k: "shape", shape: "rect", box: [0.074, g.v(0.076), 0.852, 1 - g.v(0.152)], fill: null, stroke: GOLD, strokeMm: 0.25 },
        ...roundSpot(g, 0.5, cy, 0.43, GOLD, "brandColor2", 0.16, { color: GOLD, mm: 0.8, gap: 0.03 }),
        flow(0.5, cy + g.v(0.27), 0.8, 1 - g.v(0.32) - cy - g.v(0.27), [
          item("subheadline", 0.034, "Montserrat", GOLD, { ls: 0.1, bindColor: "brandColor2" }),
          headline(0.11, "Cormorant Garamond", INK, { lh: 1, gap: 0.012, bindColor: "brandColor3" }),
          item("date", 0.06, "Cormorant Garamond", GOLD, { bold: true, gap: 0.016, bindColor: "brandColor2" }),
          item("body", 0.033, "Montserrat", GREY, { gap: 0.016, lh: 1.5 }),
        ], { align: "center", anchor: "middle" }),
        shape("rect", [0.5 - 0.012, 1 - g.v(0.28), 0.024, g.v(0.024)], GOLD, { rot: 45 }),
        contactsCentered(g, { ink: INK, font: "Montserrat", size: 0.03, keys: ["address", "phone"], bottom: 1 - g.v(0.12) }),
      ];
    },
  ),

  // Christmas, elegant: a pine ground, gold stars and snowflakes, a serif headline and the offer in gold.
  front(
    "flyer-xmas-elegant",
    L("Crăciun elegant", "Рождество", "Elegant Christmas"),
    { style: "elegant", purposes: ["xmas", "food", "promo"], back: "flyer-back-coupon" },
    WHITE,
    (g) => [
      rect([0, 0, 1, 1], PINE, { bindColor: "brandColor3" }),
      { k: "shape", shape: "rect", box: [0.058, g.v(0.06), 0.884, 1 - g.v(0.12)], fill: null, stroke: XGOLD, strokeMm: 0.5 },
      shape("snowflake", [0.74, g.v(0.08), 0.22, g.v(0.22)], WHITE, { opacity: 0.18 }),
      shape("snowflake", [0.06, g.pick(0.56, 0.6), 0.14, g.v(0.14)], WHITE, { opacity: 0.14 }),
      shape("snowflake", [0.8, g.pick(0.72, 0.75), 0.12, g.v(0.12)], WHITE, { opacity: 0.12 }),
      shape("star", [0.16, g.v(0.12), 0.05, g.v(0.05)], XGOLD),
      shape("star", [0.84, g.pick(0.48, 0.5), 0.035, g.v(0.035)], XGOLD),
      shape("star", [0.2, g.pick(0.8, 0.82), 0.03, g.v(0.03)], XGOLD),
      logo(g, [0.35, g.y0 + g.v(0.04), 0.3, g.v(0.11)]),
      flow(0.5, g.pick(0.2, 0.17), 0.8, g.pick(0.6, 0.64), [
        headline(0.11, "Playfair Display", WHITE, { lh: 1.05 }),
        item("subheadline", 0.042, "Open Sans", WHITE, { gap: 0.014 }),
        item("offer", 0.15, "Playfair Display", XGOLD, { bold: true, lh: 1, gap: 0.022 }),
        item("date", 0.036, "Open Sans", XGOLD, { ls: 0.08, gap: 0.014 }),
      ], { align: "center", anchor: "middle" }),
      contactsCentered(g, { ink: WHITE, font: "Open Sans", size: 0.032, keys: ["phone", "site", "address"], bottom: 1 - g.v(0.11) }),
    ],
  ),

  // Christmas, bold: a red sheet with snowflakes, the photo as a tilted polaroid, a big offer, a white contact bar.
  front(
    "flyer-xmas-bold",
    L("Crăciun cu foto", "Новый год с фото", "Christmas photo"),
    { style: "bold", purposes: ["xmas", "promo", "food"], back: "flyer-back-coupon" },
    WHITE,
    (g) => {
      const pw: number = 0.62;
      const ph: number = g.pick(0.3, 0.27);
      const py: number = g.pick(0.08, 0.06);
      return [
        rect([0, 0, 1, 1], XRED, { bindColor: "brandColor1" }),
        shape("snowflake", [0.68, g.v(0.03), 0.28, g.v(0.28)], WHITE, { opacity: 0.16 }),
        shape("snowflake", [0.03, g.pick(0.42, 0.4), 0.14, g.v(0.14)], WHITE, { opacity: 0.16 }),
        shape("snowflake", [0.84, g.pick(0.58, 0.6), 0.12, g.v(0.12)], WHITE, { opacity: 0.14 }),
        disc(0.12, g.v(0.08), 0.02, WHITE, { opacity: 0.6 }),
        disc(0.9, g.pick(0.42, 0.4), 0.018, WHITE, { opacity: 0.6 }),
        rect([0.5 - pw / 2 - 0.03, py - g.v(0.03), pw + 0.06, ph + g.v(0.15)], WHITE, { rot: -3 }),
        ...photoSpot(g, [0.5 - pw / 2, py, pw, ph], XRED, { base: SNOW, rot: -3, hintFill: XRED }),
        logo(g, [0.36, py + ph + g.v(0.025), 0.28, g.v(0.07)]),
        flow(0.5, py + ph + g.v(0.17), COL, g.pick(0.87, 0.89) - (py + ph + g.v(0.17)) - g.v(0.13), [
          headline(0.1, "Montserrat", WHITE, { lh: 1.02 }),
          item("subheadline", 0.042, "Open Sans", WHITE, { gap: 0.012 }),
          item("offer", 0.15, "Montserrat", "#ffe066", { bold: true, lh: 1, gap: 0.016, bindColor: "brandColor2" }),
          item("date", 0.036, "Open Sans", WHITE, { bold: true, gap: 0.012 }),
        ], { align: "center", anchor: "middle" }),
        ...contactBar(g, { fill: WHITE, bind: null, ink: XRED, inkBind: "brandColor1", font: "Open Sans", h: 0.13 }),
      ];
    },
  ),
];

void rule;
void X0;
