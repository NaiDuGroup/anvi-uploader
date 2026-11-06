import type { StudioTemplate } from "../templates";
import { GREY, INK, L, WHITE, bullets, disc, flow, headline, item, rect, shape } from "./helpers";
import { COL, X0, X1, contactBar, contactColumns, contactsCentered, fieldPill, front, logo, offerDisc, photoSpot, rule } from "./kit";

const CORAL = "#e4572e";
const SUN = "#ffc914";
const CRIMSON = "#d62839";
const TEAL = "#0f766e";
const LEMON = "#fcd34d";

/** Promotions and shop openings: photo-led, price-led, minimal and festive. */
export const PROMO_FLYERS: StudioTemplate[] = [
  // Photo across the top, the offer on a disc riding its edge, the message on white, the contacts on a brand bar.
  front(
    "flyer-promo-photo",
    L("Promo cu foto", "Акция с фото", "Promo with photo"),
    { style: "photo", purposes: ["promo", "opening", "beauty"], back: "flyer-back-coupon" },
    WHITE,
    (g) => {
      const pb: number = g.pick(0.5, 0.44);
      const bar: number = g.v(0.15);
      return [
        ...photoSpot(g, [0, 0, 1, pb], CORAL),
        ...offerDisc(g, 0.77, pb, 0.3, SUN, INK, "Montserrat"),
        logo(g, [X0, pb + g.v(0.05), 0.3, g.v(0.09)]),
        flow(X0, pb + g.v(0.17), COL, 1 - bar - pb - g.v(0.2), [
          headline(0.095, "Montserrat", INK, { bindColor: "brandColor3" }),
          item("subheadline", 0.042, "Open Sans", GREY, { gap: 0.012 }),
          bullets(0.036, "Open Sans", INK, "•", { gap: 0.022 }),
        ], { anchor: "middle" }),
        ...contactBar(g, { fill: CORAL, ink: WHITE, font: "Open Sans", h: 0.15 }),
      ];
    },
  ),

  // Price-led: the whole sheet in the brand colour, the offer huge in the middle, the headline over it.
  front(
    "flyer-promo-sale",
    L("Ofertă mare", "Большая скидка", "Big offer"),
    { style: "bold", purposes: ["promo", "opening", "xmas"], back: "flyer-back-coupon" },
    WHITE,
    (g) => [
      rect([0, 0, 1, 1], CRIMSON, { bindColor: "brandColor1" }),
      disc(0.95, g.v(0.1), 0.9, WHITE, { opacity: 0.08 }),
      disc(0.08, 1 - g.v(0.16), 0.85, WHITE, { opacity: 0.08 }),
      logo(g, [X0, g.y0, 0.3, g.v(0.11)]),
      flow(0.5, g.pick(0.15, 0.13), COL, g.pick(0.62, 0.66), [
        headline(0.085, "Montserrat", WHITE),
        item("offer", 0.24, "Montserrat", SUN, { bold: true, lh: 1, gap: 0.015, bindColor: "brandColor2" }),
        item("subheadline", 0.045, "Open Sans", WHITE, { gap: 0.02 }),
        item("date", 0.038, "Open Sans", SUN, { bold: true, gap: 0.025, bindColor: "brandColor2" }),
      ], { align: "center", anchor: "middle" }),
      rule(g, 0.36, g.pick(0.81, 0.825), 0.28, WHITE, { t: 0.004 }),
      contactsCentered(g, { ink: WHITE, font: "Open Sans", size: 0.036, keys: ["phone", "site", "address"] }),
    ],
  ),

  // Minimal: white, a short accent rule, the headline large and left-aligned, the offer in the brand colour, contacts in two columns.
  front(
    "flyer-promo-minimal",
    L("Minimal", "Минимализм", "Minimal"),
    { style: "minimal", purposes: ["promo", "education", "construction"], back: "flyer-back-steps" },
    WHITE,
    (g) => [
      logo(g, [X0, g.y0, 0.32, g.v(0.1)]),
      rule(g, X0, g.pick(0.2, 0.17), 0.1, CORAL, { t: 0.012, bind: "brandColor1" }),
      flow(X0, g.pick(0.23, 0.2), COL, g.pick(0.42, 0.48), [
        headline(0.105, "Montserrat", INK, { bindColor: "brandColor3" }),
        item("subheadline", 0.045, "Open Sans", GREY, { gap: 0.016 }),
        item("body", 0.034, "Open Sans", GREY, { gap: 0.02, lh: 1.4 }),
        bullets(0.036, "Open Sans", INK, "—", { gap: 0.02 }),
      ]),
      flow(X0, g.pick(0.67, 0.69), COL, g.pick(0.14, 0.13), [
        item("offer", 0.14, "Montserrat", CORAL, { bold: true, lh: 1, bindColor: "brandColor1" }),
        item("date", 0.036, "Open Sans", INK, { bold: true, gap: 0.008 }),
      ], { anchor: "bottom" }),
      rect([X0, g.pick(0.835, 0.865), COL, g.v(0.003)], "#d5d9e0"),
      ...contactColumns(g, { ink: INK, font: "Open Sans", iconColor: CORAL, iconBind: "brandColor1" }),
    ],
  ),

  // Opening: brand colour with confetti and balloons, a big headline, the date on a white pill, the address in front.
  front(
    "flyer-opening-bold",
    L("Deschidere", "Открытие", "Grand opening"),
    { style: "bold", purposes: ["opening", "promo", "events"], back: "flyer-back-contacts" },
    WHITE,
    (g) => [
      rect([0, 0, 1, 1], TEAL, { bindColor: "brandColor1" }),
      shape("balloon", [0.06, g.v(0.05), 0.16, g.v(0.25)], LEMON, { bindColor: "brandColor2", rot: -12 }),
      shape("balloon", [0.17, g.v(0.1), 0.12, g.v(0.19)], WHITE, { opacity: 0.85, rot: 6 }),
      shape("balloon", [0.79, g.v(0.05), 0.15, g.v(0.24)], LEMON, { bindColor: "brandColor2", rot: 10 }),
      disc(0.3, g.v(0.05), 0.022, WHITE),
      disc(0.72, g.v(0.2), 0.03, LEMON, { bindColor: "brandColor2" }),
      disc(0.08, g.pick(0.55, 0.58), 0.025, LEMON, { bindColor: "brandColor2" }),
      disc(0.93, g.pick(0.5, 0.52), 0.035, WHITE, { opacity: 0.8 }),
      shape("star", [0.87, g.pick(0.68, 0.7), 0.06, g.v(0.06)], LEMON, { bindColor: "brandColor2", rot: 15 }),
      shape("star", [0.06, g.pick(0.7, 0.73), 0.045, g.v(0.045)], WHITE, { rot: -10 }),
      logo(g, [0.32, g.y0, 0.36, g.v(0.12)]),
      flow(0.5, g.pick(0.2, 0.17), 0.8, g.pick(0.44, 0.5), [
        headline(0.12, "Montserrat", WHITE, { lh: 1 }),
        item("subheadline", 0.045, "Open Sans", WHITE, { gap: 0.016 }),
        item("offer", 0.09, "Montserrat", LEMON, { bold: true, gap: 0.02, lh: 1, bindColor: "brandColor2" }),
      ], { align: "center", anchor: "middle" }),
      ...fieldPill(g, "date", [0.16, g.pick(0.67, 0.7), 0.68, g.v(0.11)], WHITE, item("date", 0.05, "Montserrat", TEAL, { bold: true, bindColor: "brandColor1" }), { bind: null }),
      contactsCentered(g, { ink: WHITE, font: "Open Sans", size: 0.036, keys: ["address", "phone", "site"] }),
    ],
  ),
];

void X1;
