import type { StudioTemplate, TplPhoto } from "../templates";
import { GREY, INK, L, SAFE_X, WHITE, cardFront, contactRows, logoOr, rect, row, stack } from "./helpers";

const ROSE = "#b4536a";
const BLUSH = "#e9b8a7";
const HARBOUR = "#1d3557";
const MIST = "#8fb0c9";
const OLIVE = "#5d7a3a";
const APRICOT = "#f0a95b";
const LINEN = "#f7f1e8";

/** The customer's photo spot (filled from «Fotografie»; an empty spot is not printed, the brand block under it shows). */
function photo(spot: Pick<TplPhoto, "box" | "sq" | "mask">): TplPhoto {
  return { k: "photo", ...spot };
}

/**
 * «Photo»: the customer's photo as a big part of the card. A brand-colour
 * block lies under every photo spot, so the card is designed even before a
 * photo is added; texts sit on a solid panel, never on the photo.
 */
export const PHOTO_CARDS: StudioTemplate[] = [
  // Split: the photo fills the left 42 % (a brand block under it), a thin accent stripe, details on white.
  cardFront("card-photo-split", L("Foto pe jumătate", "Фото на половину", "Photo split"), { style: "photo", industries: ["events", "beauty"], back: "card-back-logo" }, WHITE, [
    rect([0, 0, 0.42, 1], ROSE, { bindColor: "brandColor1" }),
    photo({ box: [0, 0, 0.42, 1], mask: "rect" }),
    rect([0.42, 0, 0.014, 1], BLUSH, { bindColor: "brandColor2" }),
    logoOr([0.49, 0.14, 0.115, 0.2], "monogram", { fill: ROSE }),
    stack(0.49, 0.39, 0.44, [row("name", 0.088, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.048, "Open Sans", GREY, { gap: 0.004 })], { anchor: "top", lh: 1.22 }),
    stack(0.49, 0.87, 0.44, contactRows(0.046, "Open Sans", INK, { icons: true }), { anchor: "bottom", iconColor: ROSE, iconBindColor: "brandColor1", lh: 1.36 }),
  ]),

  // Banner: the photo across the top half, the logo on it; a full-width brand panel below with the name and the details.
  cardFront("card-photo-banner", L("Foto banner", "Фото-баннер", "Photo banner"), { style: "photo", industries: ["realty", "construction"], back: "card-back-map" }, WHITE, [
    rect([0, 0, 1, 0.52], MIST, { bindColor: "brandColor2" }),
    photo({ box: [0, 0, 1, 0.52], mask: "rect" }),
    rect([0, 0.52, 1, 0.48], HARBOUR, { bindColor: "brandColor1" }),
    logoOr([0.07, 0.14, 0.12, 0.21], "monogram", { fill: HARBOUR }),
    stack(SAFE_X, 0.695, 0.45, [row("name", 0.082, "Montserrat", WHITE, { bold: true }), row("title", 0.046, "Open Sans", WHITE, { gap: 0.004 })], { anchor: "middle", lh: 1.22 }),
    stack(0.93, 0.695, 0.38, contactRows(0.046, "Open Sans", WHITE, { keys: ["phone", "email", "site"], icons: true }), { align: "right", anchor: "middle", iconColor: MIST, iconBindColor: "brandColor2", lh: 1.3 }),
  ]),

  // Round photo: a photo in a circle with a brand ring and a big accent disc behind it, details on linen.
  cardFront("card-photo-circle", L("Foto rotundă", "Круглое фото", "Round photo"), { style: "photo", industries: ["cafe", "agro", "events"], back: "card-back-loyalty" }, LINEN, [
    { k: "shape", shape: "ellipse", box: [(96 - 34) / 94, (48 - 34) / 54, 68 / 94, 68 / 54], fill: APRICOT, bindColor: "brandColor2" },
    { k: "shape", shape: "ellipse", sq: [0.745, 0.5, 0.74], fill: OLIVE, bindColor: "brandColor1" },
    photo({ sq: [0.745, 0.5, 0.66], mask: "circle" }),
    logoOr([SAFE_X, 0.14, 0.115, 0.2], "monogram", { fill: OLIVE }),
    stack(SAFE_X, 0.55, 0.45, [row("name", 0.085, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.062, "Caveat", OLIVE, { bindColor: "brandColor1" })], { anchor: "bottom", lh: 1.18 }),
    stack(SAFE_X, 0.6, 0.45, contactRows(0.046, "Open Sans", INK, { icons: true }), { iconColor: OLIVE, iconBindColor: "brandColor1", lh: 1.34 }),
  ]),
];
