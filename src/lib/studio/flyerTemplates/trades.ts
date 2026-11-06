import type { StudioTemplate } from "../templates";
import { GREY, INK, L, WHITE, bullets, disc, flow, headline, item, rect } from "./helpers";
import { COL, X0, X1, contactBar, contactColumns, fieldPill, front, logo, offerDisc, photoSpot, roundSpot } from "./kit";

const ASPHALT = "#15171c";
const RED = "#e10600";
const STEEL = "#9aa3ad";
const NAVY = "#1f3a5f";
const AMBER = "#f5b700";
const FOREST = "#1d4d3b";
const BLUE = "#2457c5";
const SKY = "#ffd166";

/** Car service, building, real estate, courses. */
export const TRADE_FLYERS: StudioTemplate[] = [
  // Auto: a dark sheet, racing stripes across the top of the photo, a condensed headline and a red contact bar.
  front(
    "flyer-auto-bold",
    L("Service auto", "Автосервис", "Car service"),
    { style: "bold", purposes: ["auto", "construction"], back: "flyer-back-steps" },
    WHITE,
    (g) => {
      const pt: number = g.pick(0.5, 0.52);
      const bar: number = g.v(0.14);
      return [
        rect([0, 0, 1, 1], ASPHALT, { bindColor: "brandColor3" }),
        ...photoSpot(g, [0, pt, 1, 1 - pt - bar], RED, { opacity: 0.22 }),
        rect([-0.1, pt - g.v(0.03), 1.2, g.v(0.035)], RED, { bindColor: "brandColor1", rot: -4 }),
        rect([-0.1, pt + g.v(0.02), 1.2, g.v(0.012)], STEEL, { bindColor: "brandColor2", rot: -4 }),
        logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
        flow(X0, g.pick(0.13, 0.11), COL, pt - g.pick(0.2, 0.17), [
          headline(0.115, "Oswald", WHITE, { lh: 1 }),
          item("subheadline", 0.042, "Roboto", "#c7cdd6", { gap: 0.012 }),
          bullets(0.036, "Roboto", WHITE, "•", { gap: 0.02 }),
        ], { anchor: "middle" }),
        ...fieldPill(g, "offer", [X0, 1 - bar - g.v(0.16), 0.42, g.v(0.12)], RED, item("offer", 0.07, "Oswald", WHITE, { bold: true, lh: 1 }), { bind: "brandColor1", shape: "rect", pad: 0.02 }),
        ...contactBar(g, { fill: RED, ink: WHITE, font: "Roboto", h: 0.14 }),
      ];
    },
  ),

  // Building: a navy header with the headline, the photo as a card across its edge, an amber offer disc, details in columns.
  front(
    "flyer-construction-corporate",
    L("Construcții", "Строительство", "Construction"),
    { style: "corporate", purposes: ["construction", "realty", "auto"], back: "flyer-back-steps" },
    WHITE,
    (g) => {
      const hb: number = g.pick(0.42, 0.38);
      const pt: number = hb - g.pick(0.08, 0.06);
      const ph: number = g.pick(0.27, 0.25);
      return [
        rect([0, 0, 1, hb], NAVY, { bindColor: "brandColor1" }),
        logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
        flow(X0, g.y0 + g.v(0.15), COL, pt - g.y0 - g.v(0.15) - g.v(0.04), [
          headline(0.09, "Montserrat", WHITE),
          item("subheadline", 0.04, "Open Sans", AMBER, { gap: 0.012, bindColor: "brandColor2" }),
        ], { anchor: "bottom" }),
        ...photoSpot(g, [X0, pt, COL, ph], NAVY, { base: "#dfe4ea" }),
        rect([X0, pt + ph, COL, g.v(0.014)], AMBER, { bindColor: "brandColor2" }),
        ...offerDisc(g, 0.77, pt + g.v(0.16), 0.24, AMBER, INK, "Montserrat", { ring: WHITE }),
        flow(X0, pt + ph + g.v(0.06), COL, g.pick(0.84, 0.86) - (pt + ph + g.v(0.06)), [
          item("body", 0.034, "Open Sans", GREY, { lh: 1.4 }),
          bullets(0.036, "Open Sans", INK, "•", { gap: 0.016 }),
        ], { anchor: "middle" }),
        rect([X0, g.pick(0.85, 0.87), COL, g.v(0.003)], "#d5d9e0"),
        ...contactColumns(g, { ink: INK, font: "Open Sans", iconColor: NAVY, iconBind: "brandColor1" }),
      ];
    },
  ),

  // Real estate: the photo edge to edge, a white card at the foot with the price tag, the details and the logo.
  front(
    "flyer-realty-photo",
    L("Imobiliare", "Недвижимость", "Real estate"),
    { style: "photo", purposes: ["realty", "construction"], back: "flyer-back-contacts" },
    "#e4ebe7",
    (g) => {
      const ct: number = g.pick(0.5, 0.56);
      return [
        ...photoSpot(g, [0, 0, 1, 1], FOREST, { opacity: 0.16 }),
        rect([0.06, ct, 0.88, 1 - g.v(0.075) - ct], WHITE),
        rect([0.06, ct, 0.88, g.v(0.012)], FOREST, { bindColor: "brandColor1" }),
        ...fieldPill(g, "offer", [0.1, ct - g.v(0.07), 0.5, g.v(0.12)], FOREST, item("offer", 0.06, "Montserrat", WHITE, { bold: true, lh: 1 }), { bind: "brandColor1", shape: "rect", pad: 0.025 }),
        flow(0.1, ct + g.v(0.1), 0.8, 1 - g.v(0.26) - ct - g.v(0.11), [
          headline(0.075, "Montserrat", INK, { bindColor: "brandColor3" }),
          item("subheadline", 0.038, "Open Sans", GREY, { gap: 0.008 }),
          bullets(0.034, "Open Sans", INK, "•", { gap: 0.016 }),
        ], { anchor: "middle" }),
        logo(g, [0.62, 1 - g.v(0.215), 0.26, g.v(0.1)]),
        ...contactColumns(g, { ink: INK, font: "Open Sans", iconColor: FOREST, iconBind: "brandColor1", left: ["phone", "site"], right: [], bottom: 1 - g.v(0.11) }).slice(0, 1),
      ];
    },
  ),

  // Courses: a blue top with soft circles, the start date on an amber pill, a round photo on the edge, the programme below.
  front(
    "flyer-education-corporate",
    L("Cursuri", "Курсы", "Courses"),
    { style: "corporate", purposes: ["education", "events"], back: "flyer-back-steps" },
    WHITE,
    (g) => {
      const hb: number = g.pick(0.46, 0.4);
      const ps: number = 0.36;
      return [
        rect([0, 0, 1, hb], BLUE, { bindColor: "brandColor1" }),
        disc(0.9, g.v(0.05), 0.85, WHITE, { opacity: 0.07 }),
        logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
        flow(X0, g.y0 + g.v(0.15), COL, hb - g.v(ps / 2) - g.v(0.04) - g.y0 - g.v(0.15), [
          headline(0.09, "Montserrat", WHITE),
          item("subheadline", 0.04, "Open Sans", WHITE, { gap: 0.012 }),
        ], { anchor: "bottom" }),
        ...fieldPill(g, "date", [X0, hb - g.v(0.07), 0.44, g.v(0.1)], SKY, item("date", 0.04, "Montserrat", INK, { bold: true }), { bind: "brandColor2" }),
        ...roundSpot(g, 0.73, hb, ps, BLUE, "brandColor1", 0.16, { color: WHITE, mm: 2.2 }),
        flow(X0, hb + g.v(ps / 2) + g.v(0.05), COL, g.pick(0.86, 0.87) - (hb + g.v(ps / 2) + g.v(0.05)), [
          item("body", 0.034, "Open Sans", GREY, { lh: 1.4 }),
          bullets(0.037, "Open Sans", INK, "•", { gap: 0.016 }),
          item("offer", 0.06, "Montserrat", BLUE, { bold: true, gap: 0.02, bindColor: "brandColor1" }),
        ], { anchor: "middle" }),
        ...contactBar(g, { fill: "#eef2fa", bind: null, ink: INK, font: "Open Sans", h: 0.13, left: ["phone"], right: ["site"] }),
      ];
    },
  ),
];

void X1;
void contactColumns;
