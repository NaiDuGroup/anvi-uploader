import type { StudioLocalized } from "../i18n";
import type { StudioTemplate, TplLayer, TplText } from "../templates";
import { GREY, INK, L, WHITE, contacts, disc, flow, item, rect, shape, slotText, stack } from "./helpers";
import { COL, X0, X1, back, contactBar, contactsCentered, dashedBox, logo, rule, type G } from "./kit";

const NAVY = "#14213d";
const CORAL = "#e4572e";
const SUN = "#ffc914";
const MAP = "#e9edf1";
const PARK = "#d3e6cb";
const WATER = "#cfe0ef";

/** A one-line free text (shrinks to its width), a slot of the short edit. */
function slotLine(slot: string, value: StudioLocalized, x: number, cy: number, w: number, size: number, font: TplText["font"], color: string, o: Partial<TplText> = {}): TplText {
  const align = o.align ?? "left";
  const cx: number = align === "left" ? x + w / 2 : align === "right" ? x - w / 2 : x;
  return { k: "text", cx, cy, w, size, font, color, text: value, slot, ph: true, align, bold: false, lh: 1.2, ...o };
}

const SERVICE = L("Denumirea serviciului", "Название услуги", "Service name");
const PRICES = ["100 lei", "150 lei", "200 lei", "250 lei", "300 lei", "350 lei", "400 lei", "450 lei"];

function priceRows(g: G, top: number, bottom: number, n: number): TplLayer[] {
  const step: number = (bottom - top) / n;
  return Array.from({ length: n }, (_, i): TplLayer[] => {
    const cy: number = top + step * (i + 0.5);
    return [
      slotLine(`s${i + 1}`, SERVICE, X0, cy, COL * 0.66, 0.038, "Open Sans", INK),
      slotLine(`p${i + 1}`, L(PRICES[i]!, PRICES[i]!, PRICES[i]!), X1, cy, COL * 0.3, 0.038, "Montserrat", NAVY, { align: "right", bold: true, bindColor: "brandColor1" }),
      ...(i < n - 1 ? [rect([X0, top + step * (i + 1), COL, g.v(0.003)], "#dfe3e8")] : []),
    ];
  }).flat();
}

/** One step: a numbered disc and its title + text (both free texts of the short edit). */
function step(g: G, n: number, y: number, h: number, title: StudioLocalized, text: StudioLocalized): TplLayer[] {
  const d = 0.13;
  // The disc and the texts centred on the row (the rows share the room between the heading and the bar).
  const cy: number = y + h / 2;
  return [
    disc(X0 + d / 2, cy, d, CORAL, { bindColor: "brandColor1" }),
    { k: "text", cx: X0 + d / 2, cy, w: d, size: 0.065, font: "Montserrat", color: WHITE, text: L(`${n}`, `${n}`, `${n}`), bold: true, lh: 1 },
    flow(X0 + d + 0.05, y, COL - d - 0.05, h, [
      slotText(`t${n}`, title, 0.045, "Montserrat", INK, { bold: true, bindColor: "brandColor3" }),
      slotText(`d${n}`, text, 0.034, "Open Sans", GREY, { gap: 0.006, lh: 1.35 }),
    ], { anchor: "middle" }),
  ];
}

/** Flyer backs («Adaugă verso»): logo, price list, map + QR, coupon, three steps. */
export const FLYER_BACKS: StudioTemplate[] = [
  back("flyer-back-logo", L("Logo și contacte", "Логотип и контакты", "Logo and contacts"), WHITE, (g) => [
    rect([0, 1 - g.v(0.06), 1, g.v(0.06)], NAVY, { bindColor: "brandColor1" }),
    rect([0, 1 - g.v(0.075), 1, g.v(0.015)], SUN, { bindColor: "brandColor2" }),
    logo(g, [0.28, g.pick(0.24, 0.26), 0.44, g.v(0.3)], "monogram", { font: "Montserrat" }),
    flow(0.5, g.pick(0.48, 0.44), COL, g.v(0.2), [item("company", 0.07, "Montserrat", INK, { bold: true, keep: true, bindColor: "brandColor3" })], { align: "center" }),
    rule(g, 0.44, g.pick(0.62, 0.6), 0.12, SUN, { t: 0.008, bind: "brandColor2" }),
    stack(0.5, g.pick(0.66, 0.64), COL, contacts(0.036, "Open Sans", INK, { keys: ["phone", "email", "site", "address"] }).map((r, i) => (i === 0 ? { ...r, bold: true } : r)), { align: "center", lh: 1.55 }),
  ]),

  back("flyer-back-prices", L("Listă de prețuri", "Прайс-лист", "Price list"), WHITE, (g) => {
    const hb: number = g.pick(0.2, 0.15);
    const bar: number = g.v(0.14);
    return [
      rect([0, 0, 1, hb], NAVY, { bindColor: "brandColor1" }),
      logo(g, [0.63, g.y0, 0.3, hb - g.y0 - g.v(0.05)]),
      flow(X0, g.y0, 0.54, hb - g.y0 - g.v(0.04), [
        slotText("heading", L("Prețuri", "Цены", "Prices"), 0.085, "Montserrat", WHITE, { bold: true, lh: 1 }),
        item("company", 0.036, "Open Sans", WHITE, { gap: 0.008 }),
      ], { anchor: "bottom" }),
      ...priceRows(g, hb + g.v(0.06), g.pick(0.8, 0.82), g.pick(6, 8)),
      flow(X0, g.pick(0.81, 0.83), COL, 1 - bar - g.pick(0.82, 0.84), [slotText("note", L("Prețurile includ TVA.", "Цены с НДС.", "Prices include VAT."), 0.03, "Open Sans", GREY)], { anchor: "middle" }),
      ...contactBar(g, { fill: NAVY, ink: WHITE, font: "Open Sans", h: 0.14 }),
    ];
  }),

  back("flyer-back-contacts", L("Hartă și contacte", "Карта и контакты", "Map and contacts"), WHITE, (g) => {
    const mb: number = g.pick(0.46, 0.42);
    return [
      // A stylised city map on an inset card: blocks, a park, the river, the streets and the pin.
      shape("rounded", [X0, g.y0, COL, mb - g.y0], MAP),
      shape("rounded", [0.58, g.y0 + g.v(0.06), 0.3, g.v(0.2)], PARK),
      shape("rounded", [X0 + 0.04, mb - g.v(0.2), 0.3, g.v(0.14)], WATER),
      rect([X0, g.y0 + (mb - g.y0) * 0.42, COL, g.v(0.035)], WHITE),
      rect([X0, g.y0 + (mb - g.y0) * 0.8, COL, g.v(0.018)], WHITE),
      rect([0.42, g.y0, 0.035, mb - g.y0], WHITE),
      rect([0.76, g.y0, 0.018, mb - g.y0], WHITE),
      rect([0.2, g.y0, 0.018, (mb - g.y0) * 0.42], WHITE),
      shape("ellipse", [0.405, g.y0 + (mb - g.y0) * 0.42 + g.v(0.02), 0.07, g.v(0.025)], NAVY, { opacity: 0.18 }),
      shape("iconPin", [0.37, g.y0 + (mb - g.y0) * 0.42 - g.v(0.15), 0.14, g.v(0.17)], CORAL, { bindColor: "brandColor1" }),
      flow(X0, mb + g.v(0.08), COL, g.v(0.12), [slotText("heading", L("Cum ne găsiți", "Как нас найти", "How to find us"), 0.065, "Montserrat", INK, { bold: true, bindColor: "brandColor3" })]),
      stack(X0, mb + g.v(0.22), 0.56, [
        ...contacts(0.04, "Open Sans", INK, { keys: ["address"], icons: true }).map((r) => ({ ...r, bold: true })),
        ...contacts(0.034, "Open Sans", INK, { keys: ["phone", "email", "site"], icons: true }),
      ], { lh: 1.6, iconColor: CORAL, iconBindColor: "brandColor1" }),
      { k: "qr", sq: [0.79, g.pick(0.8, 0.83), 0.24], color: NAVY, background: WHITE, showIf: "site" },
      slotLine("qr", L("Scanează", "Сканируйте", "Scan me"), 0.79, g.pick(0.8, 0.83) + g.v(0.15), 0.26, 0.028, "Open Sans", GREY, { align: "center", showIf: "site" }),
      logo(g, [X0, g.y1 - g.v(0.09), 0.26, g.v(0.09)]),
    ];
  }),

  back("flyer-back-coupon", L("Cupon", "Купон", "Coupon"), "#fff7e6", (g) => {
    const top: number = g.pick(0.27, 0.3);
    const h: number = g.pick(0.43, 0.38);
    return [
      rect([0, 0, 1, 1], SUN, { bindColor: "brandColor2", opacity: 0.18 }),
      logo(g, [0.3, g.y0 + g.v(0.02), 0.4, g.v(0.16)], "monogram"),
      flow(0.5, g.y0 + g.v(0.2), COL, top - g.y0 - g.v(0.24), [item("company", 0.05, "Montserrat", INK, { bold: true, bindColor: "brandColor3" })], { align: "center", anchor: "middle" }),
      shape("rounded", [0.1, top + g.v(0.025), 0.8, h - g.v(0.05)], WHITE),
      ...dashedBox(g, [0.07, top, 0.86, h], CORAL, { bind: "brandColor1" }),
      flow(0.5, top + g.v(0.07), 0.7, h - g.v(0.14), [
        slotText("heading", L("Cupon de reducere", "Купон на скидку", "Discount coupon"), 0.036, "Open Sans", CORAL, { bold: true, ls: 0.12, bindColor: "brandColor1" }),
        item("offer", 0.17, "Montserrat", INK, { bold: true, lh: 1, keep: true, gap: 0.012, bindColor: "brandColor3" }),
        slotText("terms", L("Prezintă acest cupon la casă.", "Предъявите купон на кассе.", "Show this coupon at the till."), 0.034, "Open Sans", GREY, { gap: 0.014, lh: 1.35 }),
        item("date", 0.034, "Open Sans", INK, { bold: true, gap: 0.008 }),
      ], { align: "center", anchor: "middle" }),
      contactsCentered(g, { ink: INK, font: "Open Sans", size: 0.036, keys: ["phone", "site", "address"] }),
    ];
  }),

  back("flyer-back-steps", L("Trei pași", "Три шага", "Three steps"), WHITE, (g) => {
    const top: number = g.pick(0.25, 0.2);
    const bottom: number = 1 - g.v(0.14) - g.pick(0.03, 0.06);
    const each: number = (bottom - top) / 3;
    return [
      logo(g, [X0, g.y0, 0.3, g.v(0.1)]),
      flow(X0, g.y0 + g.v(0.14), COL, top - g.y0 - g.v(0.17), [slotText("heading", L("Cum lucrăm", "Как мы работаем", "How it works"), 0.075, "Montserrat", INK, { bold: true, bindColor: "brandColor3" })], { anchor: "bottom" }),
      rule(g, X0, top - g.v(0.015), 0.1, CORAL, { t: 0.01, bind: "brandColor1" }),
      ...step(g, 1, top + g.v(0.04), each - g.v(0.05), L("Ne sunați", "Позвоните нам", "Call us"), L("Spuneți-ne ce aveți nevoie — vă răspundem în aceeași zi.", "Расскажите, что вам нужно, — ответим в тот же день.", "Tell us what you need — we reply the same day.")),
      ...step(g, 2, top + each + g.v(0.04), each - g.v(0.05), L("Primiți oferta", "Получите предложение", "Get a quote"), L("Prețul și termenul, clar și fără surprize.", "Цена и сроки — понятно и без сюрпризов.", "Price and timing, clear and with no surprises.")),
      ...step(g, 3, top + each * 2 + g.v(0.04), each - g.v(0.05), L("Gata!", "Готово!", "Done!"), L("Lucrăm repede și vă predăm rezultatul la timp.", "Работаем быстро и сдаём результат вовремя.", "We work fast and deliver on time.")),
      ...contactBar(g, { fill: CORAL, ink: WHITE, font: "Open Sans", h: 0.14 }),
    ];
  }),
];
