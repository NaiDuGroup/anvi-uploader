import type { StudioTemplate } from "../templates";
import { CREAM, GREY, INK, L, WHITE, bullets, contacts, disc, flow, headline, item, rect, stack } from "./helpers";
import { COL, X0, X1, contactsCentered, fade, fieldPill, front, logo, offerDisc, photoSpot, roundSpot, rule } from "./kit";

const WINE = "#7a1f2b";
const GOLD = "#c8963e";
const ESPRESSO = "#2b1d16";
const TOMATO = "#e63946";
const MUSTARD = "#ffb703";

/** Restaurants, cafés, delivery. */
export const FOOD_FLYERS: StudioTemplate[] = [
  // Menu card: a round dish photo with a brand ring, a serif headline, the menu as a centred list, the offer on a pill.
  front(
    "flyer-food-menu",
    L("Meniu", "Меню", "Menu"),
    { style: "elegant", purposes: ["food", "events"], back: "flyer-back-prices" },
    CREAM,
    (g) => {
      const cy: number = g.pick(0.215, 0.17);
      return [
        ...roundSpot(g, 0.5, cy, 0.455, WINE, "brandColor1", 0.16, { color: GOLD, mm: 0.7, gap: 0.04 }),
        logo(g, [X0, g.y0, 0.2, g.v(0.12)]),
        flow(0.5, cy + g.v(0.29), COL, g.pick(0.77, 0.81) - cy - g.v(0.29), [
          headline(0.088, "Playfair Display", WINE, { bindColor: "brandColor1" }),
          item("subheadline", 0.04, "Open Sans", GREY, { gap: 0.012 }),
          bullets(0.038, "Open Sans", INK, "·", { gap: 0.026, lh: 1.6 }),
        ], { align: "center", anchor: "middle" }),
        ...fieldPill(g, "offer", [0.27, g.pick(0.785, 0.82), 0.46, g.v(0.1)], GOLD, item("offer", 0.05, "Playfair Display", WHITE, { bold: true }), { bind: "brandColor2" }),
        contactsCentered(g, { ink: INK, font: "Open Sans", size: 0.034, keys: ["phone", "address"] }),
      ];
    },
  ),

  // Delivery: the dish photo fills the top, a dark panel under it with the headline and a huge phone number to call.
  front(
    "flyer-food-delivery",
    L("Livrare", "Доставка", "Delivery"),
    { style: "photo", purposes: ["food", "promo"], back: "flyer-back-contacts" },
    WHITE,
    (g) => {
      const pb: number = g.pick(0.56, 0.52);
      return [
        rect([0, 0, 1, 1], ESPRESSO, { bindColor: "brandColor3" }),
        ...photoSpot(g, [0, 0, 1, pb], TOMATO, { opacity: 0.35 }),
        ...fade(pb - 0.12, pb, ESPRESSO, { n: 6, max: 0.55, bind: "brandColor3" }),
        rect([0, pb, 1, g.v(0.014)], MUSTARD, { bindColor: "brandColor2" }),
        logo(g, [X0, g.y0, 0.3, g.v(0.12)]),
        ...offerDisc(g, 0.76, pb - g.v(0.24), 0.3, TOMATO, WHITE, "Oswald", { bind: "brandColor1", size: 0.085 }),
        flow(X0, pb + g.v(0.06), COL, g.y1 - g.v(0.22) - pb - g.v(0.06), [
          headline(0.11, "Oswald", WHITE, { lh: 1 }),
          item("subheadline", 0.042, "Roboto", WHITE, { gap: 0.012 }),
          item("body", 0.034, "Roboto", "#d9cfc7", { gap: 0.012, lh: 1.35 }),
        ]),
        stack(X0, g.y1, COL, [
          { ...contacts(0.075, "Oswald", MUSTARD, { keys: ["phone"], icons: true, bindColor: "brandColor2" })[0]!, bold: true },
          ...contacts(0.034, "Roboto", WHITE, { keys: ["site", "address"] }).map((r, i) => (i === 0 ? { ...r, gap: 0.006 } : r)),
        ], { anchor: "bottom", lh: 1.42 }),
      ];
    },
  ),
];

void X1;
void rule;
