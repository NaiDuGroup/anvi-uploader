import type { StudioTemplate } from "../templates";
import { GREY, INK, L, WHITE, bullets, contacts, flow, headline, item, rect, shape, stack } from "./helpers";
import { COL, X0, X1, contactBar, contactColumns, contactsCentered, fieldPill, front, logo, offerDisc, photoSpot, rule } from "./kit";

const BLUSH = "#f8ece7";
const ROSE = "#b4536a";
const GOLD = "#c9a227";
const PLUM = "#3d2233";
const SAGE = "#5b7f6e";
const PEACH = "#f2b48c";
const TEAL = "#0e7c86";
const MINT = "#e6f4f3";
const NIGHT = "#111418";
const LIME = "#c6f432";

/** Beauty salons, clinics, gyms. */
export const SERVICE_FLYERS: StudioTemplate[] = [
  // Elegant: a tall rounded photo with an offset gold outline, a light serif headline, centred details.
  front(
    "flyer-beauty-elegant",
    L("Elegant", "Элегантный", "Elegant"),
    { style: "elegant", purposes: ["beauty", "medical", "events"], back: "flyer-back-prices" },
    BLUSH,
    (g) => {
      const top: number = g.pick(0.065, 0.05);
      const ph: number = g.pick(0.38, 0.4);
      return [
        { k: "shape", shape: "rounded", box: [0.22, top + g.v(0.03), 0.64, ph], fill: null, stroke: GOLD, strokeMm: 0.5 },
        ...photoSpot(g, [0.16, top, 0.64, ph], ROSE, { mask: "rounded", base: "#f1d9d2" }),
        flow(0.5, top + ph + g.v(0.1), COL, g.pick(0.815, 0.835) - top - ph - g.v(0.1), [
          headline(0.1, "Cormorant Garamond", PLUM, { bindColor: "brandColor3", lh: 1 }),
          item("subheadline", 0.032, "Montserrat", ROSE, { ls: 0.08, gap: 0.014, bindColor: "brandColor1" }),
          bullets(0.034, "Montserrat", INK, "·", { gap: 0.02, lh: 1.55 }),
          item("offer", 0.075, "Cormorant Garamond", ROSE, { bold: true, gap: 0.016, lh: 1, bindColor: "brandColor1" }),
        ], { align: "center", anchor: "middle" }),
        rule(g, 0.44, g.pick(0.835, 0.855), 0.12, GOLD, { t: 0.003 }),
        contactsCentered(g, { ink: PLUM, font: "Montserrat", size: 0.03, keys: ["phone", "site", "address"] }),
      ];
    },
  ),

  // Split: the photo fills the right half from edge to edge (DL: the top), the message on the left on white.
  front(
    "flyer-beauty-split",
    L("Foto pe jumătate", "Фото на половину", "Photo split"),
    { style: "photo", purposes: ["beauty", "fitness", "realty"], back: "flyer-back-prices" },
    WHITE,
    (g) =>
      g.dl
        ? [
            ...photoSpot(g, [0, 0, 1, 0.45], SAGE),
            rect([0, 0.45, 1, g.v(0.016)], PEACH, { bindColor: "brandColor2" }),
            ...offerDisc(g, 0.76, 0.45, 0.3, SAGE, WHITE, "Playfair Display", { bind: "brandColor1", ring: WHITE }),
            logo(g, [X0, 0.48, 0.3, g.v(0.1)]),
            flow(X0, 0.55, COL, 0.3, [
              headline(0.09, "Playfair Display", INK, { bindColor: "brandColor3" }),
              item("subheadline", 0.042, "Open Sans", GREY, { gap: 0.012 }),
              bullets(0.036, "Open Sans", INK, "•", { gap: 0.02 }),
            ], { anchor: "middle" }),
            ...contactColumns(g, { ink: INK, font: "Open Sans", iconColor: SAGE, iconBind: "brandColor1", left: ["phone"], right: ["site"] }),
          ]
        : [
            ...photoSpot(g, [0.52, 0, 0.48, 1], SAGE),
            rect([0.505, 0, 0.015, 1], PEACH, { bindColor: "brandColor2" }),
            ...offerDisc(g, 0.76, 0.8, 0.28, SAGE, WHITE, "Playfair Display", { bind: "brandColor1", ring: WHITE }),
            logo(g, [X0, g.y0, 0.3, g.v(0.11)]),
            flow(X0, 0.17, 0.4, 0.5, [
              headline(0.075, "Playfair Display", INK, { bindColor: "brandColor3" }),
              item("subheadline", 0.036, "Open Sans", GREY, { gap: 0.014 }),
              bullets(0.032, "Open Sans", INK, "•", { gap: 0.022 }),
            ], { anchor: "middle" }),
            stack(X0, g.y1, 0.36, contacts(0.03, "Open Sans", INK, { keys: ["phone", "site", "address"], icons: true }).map((r, i) => (i === 0 ? { ...r, bold: true } : r)), {
              anchor: "bottom",
              lh: 1.5,
              iconColor: SAGE,
              iconBindColor: "brandColor1",
            }),
          ],
  ),

  // Clinic: a soft brand tint, the photo top-right, a medical cross, «+» list, and a big call-us pill with the phone.
  front(
    "flyer-medical-clean",
    L("Clinică", "Клиника", "Clinic"),
    { style: "minimal", purposes: ["medical", "beauty", "education"], back: "flyer-back-steps" },
    WHITE,
    (g) => {
      const pb: number = g.pick(0.44, 0.4);
      return [
        rect([0, 0, 1, pb], MINT, { bindColor: "brandColor1", opacity: 0.12 }),
        ...photoSpot(g, [0.44, g.y0, X1 - 0.44, pb - g.y0 - g.v(0.05)], TEAL, { mask: "rounded", opacity: 0.18 }),
        rect([X0 + 0.035, g.pick(0.2, 0.17), 0.03, g.v(0.1)], TEAL, { bindColor: "brandColor1" }),
        rect([X0, g.pick(0.2, 0.17) + g.v(0.035), 0.1, g.v(0.03)], TEAL, { bindColor: "brandColor1" }),
        logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
        ...offerDisc(g, 0.46, pb - g.v(0.07), 0.26, TEAL, WHITE, "Montserrat", { bind: "brandColor1", ring: WHITE }),
        flow(X0, pb + g.v(0.15), COL, g.pick(0.78, 0.83) - pb - g.v(0.15), [
          headline(0.09, "Montserrat", INK, { bindColor: "brandColor3" }),
          item("subheadline", 0.04, "Open Sans", GREY, { gap: 0.012 }),
          bullets(0.036, "Open Sans", INK, "+", { gap: 0.02 }),
        ], { anchor: "middle" }),
        { k: "shape", shape: "rounded", box: [X0 - 0.01, g.pick(0.8, 0.85), COL + 0.02, g.v(0.12)], fill: TEAL, bindColor: "brandColor1" },
        stack(X0 + 0.03, g.pick(0.8, 0.85) + g.v(0.06), 0.46, [{ ...contacts(0.045, "Montserrat", WHITE, { keys: ["phone"], icons: true })[0]!, bold: true }], { anchor: "middle" }),
        stack(X1 - 0.03, g.pick(0.8, 0.85) + g.v(0.06), 0.34, contacts(0.03, "Open Sans", WHITE, { keys: ["site"] }), { align: "right", anchor: "middle" }),
        stack(X0, g.y1, COL, contacts(0.03, "Open Sans", GREY, { keys: ["address"], icons: true }), { anchor: "bottom", iconColor: TEAL, iconBindColor: "brandColor1" }),
      ];
    },
  ),

  // Gym: the photo edge to edge under a dark veil, a huge condensed headline, the offer on a lime tag.
  front(
    "flyer-fitness-photo",
    L("Sport", "Спорт", "Sport"),
    { style: "photo", purposes: ["fitness", "events", "promo"], back: "flyer-back-coupon" },
    WHITE,
    (g) => [
      rect([0, 0, 1, 1], NIGHT, { bindColor: "brandColor3" }),
      ...photoSpot(g, [0, 0, 1, 1], LIME, { opacity: 0.1, bind: "brandColor1" }),
      rect([0, 0, 1, 1], "#000000", { opacity: 0.3 }),
      rect([0, 0.42, 1, 0.58], "#000000", { opacity: 0.3 }),
      rect([-0.1, g.pick(0.385, 0.4), 1.2, g.v(0.014)], LIME, { bindColor: "brandColor1", rot: -6 }),
      logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
      ...fieldPill(g, "offer", [0.56, g.y0, 0.37, g.v(0.13)], LIME, item("offer", 0.065, "Oswald", NIGHT, { bold: true, lh: 1 }), { bind: "brandColor1", shape: "rect", pad: 0.02 }),
      flow(X0, g.pick(0.44, 0.45), COL, g.pick(0.38, 0.4), [
        headline(0.15, "Oswald", WHITE, { lh: 0.98 }),
        item("subheadline", 0.044, "Roboto", WHITE, { gap: 0.014 }),
        bullets(0.036, "Roboto", WHITE, "•", { gap: 0.018 }),
      ], { anchor: "bottom" }),
      ...contactBar(g, { fill: "#000000", bind: null, ink: WHITE, font: "Roboto", h: 0.13 }),
    ],
  ),
];

void shape;
