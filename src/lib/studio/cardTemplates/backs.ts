import type { TplLayer, TplShape } from "../templates";
import { GOLD, GREY, INK, L, NAVY, WHITE, cardTemplate, contactRows, dot, leftText, logoOr, rect, row, stack, text, tint, vcardQr } from "./helpers";

/**
 * Backs («Verso»): they take the front's details, logo and brand colours
 * (brandColor1 main → bands and backgrounds, brandColor2 accent, brandColor3
 * dark ink). Free texts are slots (`slot`) the short edit lets the customer
 * rewrite; `ph` samples are not printed until rewritten.
 */

const W_MM = 94;
const H_MM = 54;
/** Share of the width / height from millimetres of the 94 × 54 mm file. */
const mx = (mm: number): number => mm / W_MM;
const my = (mm: number): number => mm / H_MM;

/** Bottom brand band of the «working» backs (loyalty, appointment, services). */
const BAND_Y = 0.78;
const BAND_TEXT_Y = 0.852;

function bottomBand(): TplLayer[] {
  return [rect([0, BAND_Y, 1, 1 - BAND_Y], NAVY, { bindColor: "brandColor1" })];
}

/** A heading slot top-left in the brand colour with a short accent rule under it. */
function heading(value: ReturnType<typeof L>, w = 0.62): TplLayer[] {
  return [
    leftText(0.07, 0.205, w, 0.07, "Montserrat", NAVY, value, { bold: true, slot: "heading", bindColor: "brandColor1" }),
    rect([0.072, 0.283, 0.07, 0.011], GOLD, { bindColor: "brandColor2" }),
  ];
}

/** Small logo (or monogram) top-right. */
const cornerLogo = (): TplLayer => logoOr([0.8, 0.13, 0.13, 0.2], "monogram");

// ─── Loyalty ──────────────────────────────────────────────────────────────

const STAMP_D = 7.4;
const STAMP_STEP = 11.6;
const STAMP_ROWS = [23.4, 33.2];

function stamps(): TplLayer[] {
  const out: TplLayer[] = [];
  STAMP_ROWS.forEach((cyMm, r) => {
    for (let c = 0; c < 5; c++) {
      const cx: number = mx(W_MM / 2 + (c - 2) * STAMP_STEP);
      const last: boolean = r === 1 && c === 4;
      if (last) {
        out.push(dot(cx, my(cyMm), my(STAMP_D), GOLD, { bindColor: "brandColor2" }));
        out.push({ k: "shape", shape: "star", sq: [cx, my(cyMm), my(STAMP_D * 0.55)], fill: NAVY, bindColor: "brandColor1" });
      } else {
        out.push(dot(cx, my(cyMm), my(STAMP_D), NAVY, { bindColor: "brandColor1", opacity: 0.14 }));
      }
    }
  });
  return out;
}

// ─── Appointment ──────────────────────────────────────────────────────────

function writeLine(y: number): TplLayer[] {
  const lineY: number = y + my(1.25);
  const line = (x0: number, x1: number): TplShape => rect([x0, lineY, x1 - x0, my(0.3)], NAVY, { bindColor: "brandColor1", opacity: 0.55 });
  return [
    leftText(0.07, y, 0.11, 0.05, "Open Sans", GREY, L("Data", "Дата", "Date")),
    line(0.185, 0.56),
    leftText(0.6, y, 0.1, 0.05, "Open Sans", GREY, L("Ora", "Время", "Time")),
    line(0.71, 0.93),
  ];
}

// ─── Services ─────────────────────────────────────────────────────────────

const SERVICES = [
  L("Consultanță", "Консультация", "Consulting"),
  L("Proiectare", "Проектирование", "Design"),
  L("Execuție", "Изготовление", "Production"),
  L("Montaj", "Монтаж", "Installation"),
  L("Garanție și service", "Гарантия и сервис", "Warranty & service"),
];

/** A thin accent rule along the list (it reads as a design line while the samples are not yet rewritten). */
function serviceLines(): TplLayer[] {
  const first = 0.37;
  const step = 0.087;
  return [
    rect([0.072, first - 0.035, mx(0.7), step * (SERVICES.length - 1) + 0.07], GOLD, { bindColor: "brandColor2" }),
    ...SERVICES.map((s, i) => leftText(0.1, first + i * step, 0.5, 0.05, "Open Sans", INK, s, { ph: true, slot: `s${i + 1}`, bindColor: "brandColor3" })),
  ];
}

// ─── Map ──────────────────────────────────────────────────────────────────

const MAP_BG = "#e8ebe4";
const MAP_BLOCK = "#d6dbd0";
const MAP_PARK = "#c9e0bd";
const MAP_WATER = "#c6dbea";
const MAP_ROAD = WHITE;
const MAP_PANEL_Y = 0.6;

/** A road band across the whole file (a band may run into the bleed). */
const road = (box: readonly [number, number, number, number], rot = 0): TplShape => rect(box, MAP_ROAD, rot ? { rot } : {});

function mapLayers(): TplLayer[] {
  const pinX = 0.6;
  const pinTipY = 0.36;
  const pinMm = 8;
  return [
    // Water along the top-left corner, under the roads.
    rect([-0.2, -0.75, 0.62, 1], MAP_WATER, { rot: -24 }),
    // Blocks (≥ 2 mm inside the file edge) and a park.
    rect([0.29, 0.06, 0.15, 0.13], MAP_BLOCK),
    rect([0.29, 0.31, 0.15, 0.2], MAP_BLOCK),
    rect([0.69, 0.06, 0.08, 0.13], MAP_BLOCK),
    rect([0.86, 0.06, 0.1, 0.13], MAP_BLOCK),
    rect([0.69, 0.31, 0.08, 0.22], MAP_BLOCK),
    rect([0.86, 0.31, 0.1, 0.22], MAP_BLOCK),
    rect([0.06, 0.37, 0.15, 0.17], MAP_PARK),
    // Streets: full-length bands.
    road([0, 0.225, 1, 0.055]),
    road([0.24, 0, 0.032, 1]),
    road([0.47, 0, 0.05, 1]),
    road([0.8, 0, 0.032, 1]),
    road([-0.5, 0.42, 2, 0.03], 22),
    // The spot: a soft halo and the pin.
    dot(pinX, pinTipY, my(9), NAVY, { bindColor: "brandColor1", opacity: 0.18 }),
    { k: "shape", shape: "iconPin", box: [pinX - mx(pinMm) / 2, pinTipY - my(pinMm) * 0.95, mx(pinMm), my(pinMm)], fill: NAVY, bindColor: "brandColor1" },
    // Panel with the address.
    // Panel in the deep ink (the pin keeps the brand colour), a hairline of it on top.
    rect([0, MAP_PANEL_Y, 1, 1 - MAP_PANEL_Y], NAVY, { bindColor: "brandColor3" }),
    rect([0, MAP_PANEL_Y, 1, my(0.7)], GOLD, { bindColor: "brandColor1" }),
  ];
}

// ─── Pattern ──────────────────────────────────────────────────────────────

/** Diagonal accent stripes over the whole file: very long, so each one is a band running off every edge. */
function stripes(): TplLayer[] {
  const out: TplLayer[] = [];
  const lenMm = 600;
  for (let xMm = -24; xMm <= 118; xMm += 4.2) {
    out.push(rect([mx(xMm - 0.35), 0.5 - my(lenMm) / 2, mx(0.7), my(lenMm)], GOLD, { bindColor: "brandColor2", opacity: 0.28, rot: 38 }));
  }
  return out;
}

export const BACK_CARDS = [
  cardTemplate(
    "card-back-logo",
    L("Logo în centru", "Логотип по центру", "Centred logo"),
    null,
    [
      rect([0, 0, 1, 1], NAVY, { bindColor: "brandColor1" }),
      logoOr([0.37, 0.18, 0.26, 0.44], "monogram", { ring: true, ink: WHITE }),
      stack(0.5, 0.69, 0.8, [row("company", 0.06, "Montserrat", WHITE, { bold: true, ls: 0.12 }), row("site", 0.046, "Open Sans", WHITE, { gap: 0.01 })], { align: "center" }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-qr",
    L("QR cu datele tale", "QR с вашими данными", "QR with your details"),
    WHITE,
    [
      rect([0, 0, 0.045, 1], NAVY, { bindColor: "brandColor1" }),
      vcardQr(0.265, 0.5, 0.62),
      stack(0.485, 0.5, 0.45, [row("name", 0.07, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }), row("title", 0.046, "Open Sans", GREY), ...contactRows(0.046, "Open Sans", INK, { icons: true }).map((r, i) => (i === 0 ? { ...r, gap: 0.03 } : r))], {
        anchor: "middle",
        iconColor: NAVY,
        iconBindColor: "brandColor1",
      }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-loyalty",
    L("Card de fidelitate", "Карта лояльности", "Loyalty card"),
    WHITE,
    [
      ...bottomBand(),
      ...stamps(),
      leftText(0.07, 0.2, 0.62, 0.068, "Montserrat", NAVY, L("Card de fidelitate", "Карта лояльности", "Loyalty card"), { bold: true, slot: "heading", bindColor: "brandColor1" }),
      leftText(0.07, 0.29, 0.62, 0.048, "Open Sans", GREY, L("A 10-a vizită — gratuit", "10-й визит — бесплатно", "10th visit — free"), { ph: true, slot: "offer" }),
      cornerLogo(),
      stack(0.07, BAND_TEXT_Y, 0.5, [row("company", 0.048, "Montserrat", WHITE, { bold: true, ls: 0.06 })], { anchor: "middle" }),
      stack(0.93, BAND_TEXT_Y, 0.4, contactRows(0.048, "Open Sans", WHITE, { keys: ["phone"], icons: true }), { anchor: "middle", align: "right", iconColor: GOLD, iconBindColor: "brandColor2" }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-appointment",
    L("Programare", "Запись на приём", "Appointment"),
    WHITE,
    [
      ...bottomBand(),
      ...heading(L("Următoarea programare", "Следующий визит", "Next appointment")),
      cornerLogo(),
      ...writeLine(0.45),
      ...writeLine(0.62),
      stack(0.07, BAND_TEXT_Y, 0.5, [row("company", 0.048, "Montserrat", WHITE, { bold: true, ls: 0.06 })], { anchor: "middle" }),
      stack(0.93, BAND_TEXT_Y, 0.4, contactRows(0.048, "Open Sans", WHITE, { keys: ["phone"], icons: true }), { anchor: "middle", align: "right", iconColor: GOLD, iconBindColor: "brandColor2" }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-services",
    L("Serviciile noastre", "Наши услуги", "Our services"),
    WHITE,
    [
      ...bottomBand(),
      ...heading(L("Serviciile noastre", "Наши услуги", "Our services"), 0.55),
      ...serviceLines(),
      logoOr([0.68, 0.32, 0.23, 0.38], "monogram"),
      stack(0.07, BAND_TEXT_Y, 0.45, contactRows(0.048, "Open Sans", WHITE, { keys: ["phone"], icons: true }), { anchor: "middle", iconColor: GOLD, iconBindColor: "brandColor2" }),
      stack(0.93, BAND_TEXT_Y, 0.42, contactRows(0.048, "Open Sans", WHITE, { keys: ["site"], icons: true }), { anchor: "middle", align: "right", iconColor: GOLD, iconBindColor: "brandColor2" }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-map",
    L("Hartă și adresă", "Карта и адрес", "Map and address"),
    MAP_BG,
    [
      ...mapLayers(),
      stack(0.07, 0.745, 0.6, contactRows(0.05, "Open Sans", WHITE, { keys: ["address", "phone"], icons: true }), { anchor: "middle", iconColor: WHITE, lh: 1.5 }),
      stack(0.93, 0.745, 0.3, contactRows(0.05, "Open Sans", WHITE, { keys: ["site", "email"] }), { anchor: "middle", align: "right", lh: 1.5 }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-slogan",
    L("Slogan", "Слоган", "Slogan"),
    WHITE,
    [
      // A light wash of the brand colour (airy with any logo), the slogan in the deep ink, the colour itself only in the accents.
      tint([0, 0, 1, 1], NAVY, 0.08),
      rect([0, 0.895, 1, 0.105], NAVY, { bindColor: "brandColor1" }),
      logoOr([0.44, 0.14, 0.12, 0.2], "monogram"),
      text(0.5, 0.5, 0.84, 0.1, "Playfair Display", NAVY, L("Calitate în fiecare detaliu", "Качество в каждой детали", "Quality in every detail"), { ph: true, slot: "slogan", italic: true, bindColor: "brandColor3" }),
      rect([0.465, 0.645, 0.07, 0.01], GOLD, { bindColor: "brandColor1" }),
      stack(0.5, 0.71, 0.8, [row("company", 0.048, "Montserrat", NAVY, { bold: true, ls: 0.12, bindColor: "brandColor1" }), row("site", 0.046, "Open Sans", GREY, { ls: 0.06 })], { align: "center", anchor: "top" }),
    ],
    "back",
  ),
  cardTemplate(
    "card-back-pattern",
    L("Model cu logo", "Узор с логотипом", "Pattern with logo"),
    null,
    [
      // Deep ink ground (brand colour 3), stripes and frame in the accent.
      rect([0, 0, 1, 1], NAVY, { bindColor: "brandColor3" }),
      ...stripes(),
      rect([0.245, 0.215, 0.51, 0.57], GOLD, { bindColor: "brandColor2" }),
      rect([0.245 + mx(0.6), 0.215 + my(0.6), 0.51 - mx(1.2), 0.57 - my(1.2)], NAVY, { bindColor: "brandColor3" }),
      logoOr([0.4, 0.27, 0.2, 0.32], "monogram", { ring: true, ink: WHITE }),
      stack(0.5, 0.69, 0.44, [row("company", 0.05, "Montserrat", WHITE, { bold: true, ls: 0.12 })], { align: "center", anchor: "middle" }),
    ],
    "back",
  ),
];
