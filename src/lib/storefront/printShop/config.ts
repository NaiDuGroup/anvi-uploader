import type { Localized } from "../i18n";

/**
 * «Tipografie» — the storefront print shop (Ricoh Pro C5200s, sheets A4+
 * 22.5×32 cm, guillotine): flyers, postcards, invitations, menus, calendars,
 * sticker sheets. ONE module for every price, size, paper, pack and open
 * assumption — the product page, `POST /api/public/quote` (kind `sheetShop`),
 * the checkout and the staff note all read it.
 *
 * Source: «ANVI PriceList.pdf» pages 8 (lamination), 11 (stickers, business
 * cards), 12 (flyers), 26 (calendars), 30–31 (invitations, menus) and the
 * plan `docs/storefront-full-catalog-plan.md` section B. Lei with VAT, retail.
 *
 * Every value the price list does not state outright is marked `ASSUMPTION`
 * (owner to confirm). Change them here — nothing else hard-codes a price.
 *
 * Client-safe (no server imports).
 */

// ─── Sheet & papers ──────────────────────────────────────────────────────────

/** The only sheet in the paper catalog (`sheet_papers`): A4+ 22.5×32 cm. SRA3 does not exist yet. */
export const PS_SHEET_CM = { widthCm: 22.5, heightCm: 32 } as const;

/** Bleed per side (mm): the studio's 0.2 cm, as flyers and business cards. */
export const PS_BLEED_MM = 2;
/** Keep text this far inside the cut line (mm). */
export const PS_SAFE_MM = 4;
/** Recommended resolution of a raster file. */
export const PS_DPI = 300;

/**
 * Price per printed side of one A4+ sheet, by paper weight (g/m²) — price
 * list page 6 / 12: 105–150 g = 10, 200–300 g = 12.
 * ⚠ ASSUMPTION (owner 2026-11-05: «use the price list value»): 350 g = 12 as in
 * the price list (page 6 «200–350 g»), NOT the 14 of `sheet_papers` in prod.
 */
export const PS_PAPER_SIDE_PRICE_MDL: Readonly<Record<number, number>> = {
  105: 10,
  150: 10,
  200: 12,
  250: 12,
  300: 12,
  350: 12,
};

export type PsSides = "one" | "two";
export type PsLamination = "gloss" | "matte";
export const PS_LAMINATIONS: readonly PsLamination[] = ["gloss", "matte"];

/**
 * Lamination (pouch, per finished piece) — price list page 8 «Laminare
 * (luci/mat)»: A6 5/10 · A5 10/20 · A4 15/25 (A3 25/35 not offered: no SRA3).
 * ⚠ ASSUMPTION (open question 14): the two numbers are gloss / matte, as the
 * heading «LUCI/MAT» reads (not 80 / 150 µm).
 */
export const PS_LAMINATION_MDL: Readonly<Record<"A6" | "A5" | "A4", Record<PsLamination, number>>> = {
  A6: { gloss: 5, matte: 10 },
  A5: { gloss: 10, matte: 20 },
  A4: { gloss: 15, matte: 25 },
};
export type PsLaminationSize = keyof typeof PS_LAMINATION_MDL;

// ─── Products ────────────────────────────────────────────────────────────────

export const PS_PRODUCT_IDS = [
  "flyers",
  "postcards",
  "invitations",
  "menus",
  "calendarPocket",
  "calendarPoster",
  "calendarTent",
  "calendarDesk",
  "stickerSheets",
] as const;
export type PsProductId = (typeof PS_PRODUCT_IDS)[number];

export interface PsFormat {
  /** Frozen on the cart / order line: never reuse an id for another size. */
  id: string;
  /** «A6», «DL» — shown before the size. */
  name?: string;
  /** Finished size (mm), as the customer receives it (flat size for folded items). */
  trimMm: { width: number; height: number };
  /** Studio flyer preset with exactly this size (`flyerConstants.ts`); else a custom size. */
  presetId?: "flyer_a6" | "flyer_a5" | "flyer_dl" | "flyer_a4";
  /** Lamination pouch; absent = no lamination for this format. */
  laminationSize?: PsLaminationSize;
  /** Fold line across the middle (tent calendar): drawn on the template. */
  foldHalf?: boolean;
}

/**
 * How a pack is priced:
 * - `perSheet`: the paper's side price (`PS_PAPER_SIDE_PRICE_MDL`) ÷ pieces per
 *   A4+ sheet, × sides — what the sheet engine gives (flyers «A6 = A4 / 4»).
 * - `fixed`: a price per piece from the price list, by sides.
 */
export type PsPricing =
  | { kind: "perSheet" }
  | { kind: "fixed"; perPiece: Partial<Record<PsSides, number>> };

/**
 * `sheet` = a studio flyer line (`resolveSheetProductLine`, imposition,
 * paper write-off, workshop layout); `paper` = a `paper_print` line with the
 * file and a staff note (assembled items, or no matching paper in the catalog).
 */
export type PsProductionPath = "sheet" | "paper";

export interface PsProduct {
  id: PsProductId;
  /** `/p/<slug>` — also the cart line slug. */
  slug: string;
  name: Localized;
  subtitle: Localized;
  description: Localized;
  /** Russian name for the staff note / admin. */
  staffRu: string;
  image: string;
  path: PsProductionPath;
  formats: readonly PsFormat[];
  /** Paper weights offered (must exist in `sheet_papers`); empty for `paper` products. */
  papers: readonly number[];
  defaultPaper: number | null;
  sides: readonly PsSides[];
  packs: readonly number[];
  defaultPack: number;
  pricing: PsPricing;
  /** Lamination finishes offered (per piece, by the format's pouch); `lamination.override` replaces the pouch price. */
  lamination?: { finishes: readonly PsLamination[]; override?: Partial<Record<PsLamination, number>> };
  /** Sticker sheets: «decupat» (contour cut) option, price per sheet with cut. */
  cut?: { perPiece: number };
  /** Pages of one piece (desk calendar: one PDF of N pages). */
  pagesPerPiece?: number;
  /** Bleed / safe zone override (mm). */
  bleedMm?: number;
  safeMm?: number;
  /** Shown on the page («from 14 working days»). */
  leadTime?: Localized;
  /** Extra line on the size box (construction, how the file is laid out). */
  fileNote?: Localized;
  /** Russian staff note: how the studio makes it. */
  productionRu?: string;
}

const L = (ro: string, ru: string, en: string): Localized => ({ ro, ru, en });

const FLYER_FORMATS: readonly PsFormat[] = [
  { id: "a6", name: "A6", trimMm: { width: 105, height: 148 }, presetId: "flyer_a6", laminationSize: "A6" },
  { id: "a5", name: "A5", trimMm: { width: 148, height: 210 }, presetId: "flyer_a5", laminationSize: "A5" },
  // ⚠ ASSUMPTION: DL is not in the price list — priced like the others (A4 sheet ÷ 3 per sheet), A5 pouch.
  { id: "dl", name: "DL", trimMm: { width: 99, height: 210 }, presetId: "flyer_dl", laminationSize: "A5" },
  { id: "a4", name: "A4", trimMm: { width: 210, height: 297 }, presetId: "flyer_a4", laminationSize: "A4" },
];

export const PS_PRODUCTS: readonly PsProduct[] = [
  {
    id: "flyers",
    slug: "flyere",
    name: L("Flyere și pliante", "Листовки и флаеры", "Flyers and leaflets"),
    subtitle: L("A6, A5, DL, A4 · 105–350 g/m² · de la 50 buc.", "A6, A5, DL, A4 · 105–350 г/м² · от 50 шт.", "A6, A5, DL, A4 · 105–350 g/m² · from 50 pcs"),
    description: L(
      "Flyere color pe o față sau pe ambele, pe hârtie de 105 până la 350 g/m². Tipărim pe Ricoh Pro C5200s și tăiem pe ghilotina automată. Prețul pe foaie — ca în lista de prețuri: A5 5–6 lei, A4 10–12 lei, A6 = A4 / 4.",
      "Цветные листовки, одна или две стороны, бумага от 105 до 350 г/м². Печатаем на Ricoh Pro C5200s и режем на автоматической гильотине. Цена — по прайсу: A5 5–6 лей, A4 10–12 лей, A6 = A4 / 4.",
      "Colour flyers, one or both sides, on 105 to 350 g/m² paper. Printed on a Ricoh Pro C5200s and cut on an automatic guillotine. Prices follow our price list: A5 5–6 lei, A4 10–12 lei, A6 = A4 / 4.",
    ),
    staffRu: "Листовки",
    image: "/print-shop/flyers.svg",
    path: "sheet",
    formats: FLYER_FORMATS,
    papers: [105, 150, 200, 250, 300, 350],
    defaultPaper: 150,
    // Owner 2026-11-05: two sides = both sides charged per the price list (× 2).
    sides: ["one", "two"],
    // ⚠ ASSUMPTION: no run discount — the list says «from 500 / 1000 pcs the price changes» without numbers.
    packs: [50, 100, 250, 500, 1000],
    defaultPack: 100,
    pricing: { kind: "perSheet" },
    lamination: { finishes: ["gloss", "matte"] },
    productionRu: "Печать на листах A4+, резка на гильотине",
  },
  {
    id: "postcards",
    slug: "carti-postale",
    name: L("Cărți poștale și felicitări", "Открытки", "Postcards and greeting cards"),
    subtitle: L("A6 sau 15×15 cm · 300–350 g/m²", "A6 или 15×15 см · 300–350 г/м²", "A6 or 15×15 cm · 300–350 g/m²"),
    description: L(
      "Cărți poștale și felicitări pe carton de 300–350 g/m², color pe o față sau pe ambele. Format A6 clasic sau pătrat 15×15 cm.",
      "Открытки на плотной бумаге 300–350 г/м², цветная печать с одной или двух сторон. Классический A6 или квадрат 15×15 см.",
      "Postcards and greeting cards on 300–350 g/m² card, colour on one or both sides. Classic A6 or a 15×15 cm square.",
    ),
    staffRu: "Открытки",
    image: "/print-shop/postcards.svg",
    path: "sheet",
    formats: [
      { id: "a6", name: "A6", trimMm: { width: 105, height: 148 }, presetId: "flyer_a6", laminationSize: "A6" },
      // ⚠ ASSUMPTION: 15×15 laminated in an A5 pouch.
      { id: "sq150", trimMm: { width: 150, height: 150 }, laminationSize: "A5" },
    ],
    papers: [300, 350],
    defaultPaper: 300,
    sides: ["one", "two"],
    packs: [10, 25, 50, 100, 250],
    defaultPack: 25,
    // ⚠ ASSUMPTION: postcards are not in the price list — priced by the sheet like flyers (A6 = 3 lei a side).
    pricing: { kind: "perSheet" },
    lamination: { finishes: ["gloss", "matte"] },
    productionRu: "Печать на листах A4+, резка на гильотине",
  },
  {
    id: "invitations",
    slug: "invitatii",
    name: L("Invitații", "Приглашения", "Invitations"),
    subtitle: L("4 formate · hârtie Clasic Mat · 10 lei / buc.", "4 формата · бумага Clasic Mat · 10 лей / шт.", "4 sizes · Clasic Mat paper · 10 lei / pc"),
    description: L(
      "Invitații pentru nuntă, botez sau aniversare, pe hârtie mată densă (Clasic Mat, 300 g/m²). Încarcă macheta gata; elaborarea machetei de la zero se achită aparte.",
      "Приглашения на свадьбу, крестины или юбилей на плотной матовой бумаге (Clasic Mat, 300 г/м²). Загрузите готовый макет; разработка макета с нуля оплачивается отдельно.",
      "Invitations for weddings, christenings or anniversaries on heavy matte paper (Clasic Mat, 300 g/m²). Upload a ready design; designing one from scratch is charged separately.",
    ),
    staffRu: "Приглашения",
    image: "/print-shop/invitations.svg",
    path: "sheet",
    formats: [
      { id: "105x148", trimMm: { width: 105, height: 148 }, presetId: "flyer_a6", laminationSize: "A6" },
      { id: "120x170", trimMm: { width: 120, height: 170 }, laminationSize: "A5" },
      { id: "130x180", trimMm: { width: 130, height: 180 }, laminationSize: "A5" },
      { id: "148x210", trimMm: { width: 148, height: 210 }, presetId: "flyer_a5", laminationSize: "A5" },
    ],
    // ⚠ ASSUMPTION: «Clasic Mat» = the 300 g sheet paper (the list's example: «hârtie 300g mat»).
    papers: [300],
    defaultPaper: 300,
    sides: ["one", "two"],
    packs: [10, 25, 50, 75, 100, 150],
    defaultPack: 50,
    // ⚠ ASSUMPTION (open question 13): «10/25» = one side / both sides per piece, as the
    // list's footnote reads («the price changes for one side or both sides»). «Textură 18/41» is on request.
    pricing: { kind: "fixed", perPiece: { one: 10, two: 25 } },
    lamination: { finishes: ["gloss", "matte"] },
    leadTime: L("Termen: de la 14 zile lucrătoare", "Срок: от 14 рабочих дней", "Lead time: from 14 working days"),
    productionRu: "Печать на листах A4+, резка на гильотине; срок от 14 раб. дней",
  },
  {
    id: "menus",
    slug: "meniuri",
    name: L("Meniuri", "Меню", "Menus"),
    subtitle: L("105×210, 130×180, 148×210 · Clasic Mat", "105×210, 130×180, 148×210 · Clasic Mat", "105×210, 130×180, 148×210 · Clasic Mat"),
    description: L(
      "Meniuri pentru restaurant, cafenea sau eveniment pe hârtie mată densă (Clasic Mat, 300 g/m²), pe o față sau pe ambele. Le putem lamina, ca să reziste mai mult.",
      "Меню для ресторана, кафе или события на плотной матовой бумаге (Clasic Mat, 300 г/м²), одна или две стороны. Можно заламинировать, чтобы служили дольше.",
      "Menus for a restaurant, café or event on heavy matte paper (Clasic Mat, 300 g/m²), one or both sides. We can laminate them so they last longer.",
    ),
    staffRu: "Меню",
    image: "/print-shop/menus.svg",
    path: "sheet",
    formats: [
      { id: "105x210", trimMm: { width: 105, height: 210 }, laminationSize: "A5" },
      { id: "130x180", trimMm: { width: 130, height: 180 }, laminationSize: "A5" },
      { id: "148x210", trimMm: { width: 148, height: 210 }, presetId: "flyer_a5", laminationSize: "A5" },
    ],
    papers: [300],
    defaultPaper: 300,
    sides: ["one", "two"],
    packs: [5, 10, 20, 30, 50, 100],
    defaultPack: 10,
    // ⚠ ASSUMPTION (open question 13): «10/25» = one side / both sides per piece. The list's own
    // examples differ (300 g 2 sides 100×210 = 6 lei; 1 side 130×180 = 8 lei) — confirm.
    pricing: { kind: "fixed", perPiece: { one: 10, two: 25 } },
    lamination: { finishes: ["gloss", "matte"] },
    productionRu: "Печать на листах A4+, резка на гильотине",
  },
  {
    id: "calendarPocket",
    slug: "calendare-de-buzunar",
    name: L("Calendare de buzunar", "Карманные календари", "Pocket calendars"),
    subtitle: L("100×70 mm · 350 g/m² · 5 lei / buc.", "100×70 мм · 350 г/м² · 5 лей / шт.", "100×70 mm · 350 g/m² · 5 lei / pc"),
    description: L(
      "Calendare de buzunar 100×70 mm pe carton de 350 g/m², color pe ambele fețe: imaginea pe față, calendarul pe verso. Laminat — mai rezistent.",
      "Карманные календари 100×70 мм на картоне 350 г/м², цвет с двух сторон: картинка на лицевой, календарь на обороте. Ламинированные — прочнее.",
      "Pocket calendars 100×70 mm on 350 g/m² card, colour on both sides: your picture on the front, the calendar on the back. Laminated ones last longer.",
    ),
    staffRu: "Календарь карманный",
    image: "/print-shop/calendar-pocket.svg",
    path: "sheet",
    formats: [{ id: "100x70", trimMm: { width: 100, height: 70 }, laminationSize: "A6" }],
    papers: [350],
    defaultPaper: 350,
    // ⚠ ASSUMPTION: always two sides (front picture + calendar on the back) at the list's 5 lei.
    sides: ["two"],
    packs: [25, 50, 100, 250, 500],
    defaultPack: 100,
    pricing: { kind: "fixed", perPiece: { two: 5 } },
    // Price list page 26: «laminat 8 lei» = +3 over the plain 5. ⚠ ASSUMPTION: gloss film only.
    lamination: { finishes: ["gloss"], override: { gloss: 3 } },
    productionRu: "Печать на листах A4+ (2 стор.), резка на гильотине",
  },
  {
    id: "calendarPoster",
    slug: "calendare-poster",
    name: L("Calendare-poster A4", "Календари-постеры A4", "Poster calendars A4"),
    subtitle: L("A4 · 200–350 g/m² · 12 lei / buc.", "A4 · 200–350 г/м² · 12 лей / шт.", "A4 · 200–350 g/m² · 12 lei / pc"),
    description: L(
      "Calendar-poster A4 (210×297 mm) cu tot anul pe o foaie: color, pe hârtie de 200–350 g/m². Încarcă macheta ta cu calendarul 2027.",
      "Календарь-постер A4 (210×297 мм): весь год на одном листе, цвет, бумага 200–350 г/м². Загрузите свой макет с календарём на 2027 год.",
      "A4 poster calendar (210×297 mm) with the whole year on one sheet, colour on 200–350 g/m² paper. Upload your own 2027 calendar design.",
    ),
    staffRu: "Календарь-постер A4",
    image: "/print-shop/calendar-poster.svg",
    path: "sheet",
    formats: [{ id: "a4", name: "A4", trimMm: { width: 210, height: 297 }, presetId: "flyer_a4", laminationSize: "A4" }],
    papers: [200, 250, 300, 350],
    defaultPaper: 250,
    sides: ["one"],
    packs: [1, 5, 10, 25, 50, 100],
    defaultPack: 10,
    pricing: { kind: "fixed", perPiece: { one: 12 } },
    lamination: { finishes: ["gloss", "matte"] },
    productionRu: "Печать на листах A4+, резка на гильотине",
  },
  {
    id: "calendarTent",
    slug: "calendare-casuta",
    name: L("Calendare de birou «căsuță» DL", "Настольные календари-домики DL", "Desk tent calendars DL"),
    subtitle: L("210×105 mm · carton 350 g/m² · 25 lei / buc.", "210×105 мм · картон 350 г/м² · 25 лей / шт.", "210×105 mm · 350 g/m² card · 25 lei / pc"),
    description: L(
      "Calendar de birou «căsuță» 210×105 mm: o foaie de carton de 350 g/m², îndoită în două, cu câte o față pe fiecare parte. Stă singur pe masă.",
      "Настольный календарь-домик 210×105 мм: лист картона 350 г/м², согнутый пополам, по одной стороне календаря на каждой грани. Стоит на столе сам.",
      "Desk tent calendar 210×105 mm: one 350 g/m² card folded in half, one face on each side. It stands on the desk by itself.",
    ),
    staffRu: "Календарь-домик DL",
    image: "/print-shop/calendar-tent.svg",
    path: "sheet",
    // ⚠ ASSUMPTION (open question 15): one flat 210×210 card printed on one side (two 210×105
    // faces, the upper one upside down), scored and folded in the middle. No spiral.
    formats: [{ id: "dl-tent", name: "DL", trimMm: { width: 210, height: 210 }, foldHalf: true }],
    papers: [350],
    defaultPaper: 350,
    sides: ["one"],
    packs: [1, 5, 10, 25, 50],
    defaultPack: 5,
    pricing: { kind: "fixed", perPiece: { one: 25 } },
    fileNote: L(
      "Fișier desfășurat 214×214 mm: două fețe de 210×105 mm una sub alta, cea de sus întoarsă cu capul în jos. Îndoim pe linia din mijloc.",
      "Файл в развороте 214×214 мм: две грани 210×105 мм одна под другой, верхняя перевёрнута вверх ногами. Сгибаем по средней линии.",
      "Flat file 214×214 mm: two 210×105 mm faces one above the other, the top one upside down. We fold along the middle line.",
    ),
    productionRu: "Лист A4+, резка, биговка и сгиб пополам (домик)",
  },
  {
    id: "calendarDesk",
    slug: "calendare-de-birou",
    name: L("Calendare de birou A5 cu spirală", "Настольные календари A5 на пружине", "Desk calendars A5 with a spiral"),
    subtitle: L("A5 210×148 · 13 file · 130 lei / buc.", "A5 210×148 · 13 листов · 130 лей / шт.", "A5 210×148 · 13 pages · 130 lei / pc"),
    description: L(
      "Calendar de birou A5 orizontal (210×148 mm) cu spirală și suport: copertă + 12 luni. Încarcă un PDF de 13 pagini.",
      "Настольный календарь A5 горизонтальный (210×148 мм) на пружине с подставкой: обложка + 12 месяцев. Загрузите PDF на 13 страниц.",
      "Landscape A5 desk calendar (210×148 mm) with a spiral and a stand: a cover + 12 months. Upload a 13-page PDF.",
    ),
    staffRu: "Календарь настольный A5",
    image: "/print-shop/calendar-desk.svg",
    // Assembled by hand (spiral, stand): a paper print line with the PDF and a staff note.
    path: "paper",
    formats: [{ id: "a5-landscape", name: "A5", trimMm: { width: 210, height: 148 } }],
    papers: [],
    defaultPaper: null,
    sides: ["one"],
    packs: [1, 2, 3, 5, 10, 20],
    defaultPack: 1,
    pricing: { kind: "fixed", perPiece: { one: 130 } },
    // ⚠ ASSUMPTION (open question 15): 13 single-sided pages (cover + 12 months), 300 g,
    // wire-O spiral and the studio's cardboard stand — all included in the list's 130 lei.
    pagesPerPiece: 13,
    fileNote: L(
      "Un PDF de 13 pagini 214×152 mm (cu bleed): pagina 1 — coperta, 2–13 — lunile.",
      "Один PDF на 13 страниц 214×152 мм (с bleed): стр. 1 — обложка, 2–13 — месяцы.",
      "One 13-page PDF at 214×152 mm (with bleed): page 1 — the cover, 2–13 — the months.",
    ),
    productionRu: "13 листов A5 (обложка + 12 мес.), 300 г, 1 стор.; пружина + подставка",
  },
  {
    id: "stickerSheets",
    slug: "stickere-pe-foaie",
    name: L("Stickere pe foaie A4", "Наклейки на листе A4", "Sticker sheets A4"),
    subtitle: L("Hârtie autoadezivă · 12 lei / foaie", "Самоклеящаяся бумага · 12 лей / лист", "Self-adhesive paper · 12 lei / sheet"),
    description: L(
      "Stickere color pe hârtie autoadezivă A4. Simplu — tipărim foaia întreagă; decupat — tăiem fiecare sticker pe contur.",
      "Цветные наклейки на самоклеящейся бумаге A4. Простые — печатаем лист целиком; с вырезкой — режем каждую наклейку по контуру.",
      "Colour stickers on A4 self-adhesive paper. Plain — we print the whole sheet; die-cut — we cut each sticker along its outline.",
    ),
    staffRu: "Наклейки на листе A4",
    image: "/print-shop/sticker-sheets.svg",
    // No self-adhesive paper in `sheet_papers` yet: a paper print line (format A4) with a staff note.
    path: "paper",
    formats: [{ id: "a4", name: "A4", trimMm: { width: 210, height: 297 } }],
    papers: [],
    defaultPaper: null,
    sides: ["one"],
    packs: [1, 5, 10, 25, 50, 100],
    defaultPack: 5,
    // Price list page 11: A4 simplu 12, decupat 25 (A3 25 / 50 on request).
    pricing: { kind: "fixed", perPiece: { one: 12 } },
    // ⚠ ASSUMPTION (open question 16): the contour cut is the studio's job (plotter or
    // its contractor) from the outlines in the customer's file.
    cut: { perPiece: 25 },
    // The sheet is not trimmed: no bleed; stickers 5 mm from the edge.
    bleedMm: 0,
    safeMm: 5,
    fileNote: L(
      "Fișier A4 210×297 mm. Pentru «decupat» — fundal transparent (PNG) sau PDF cu conturul de tăiere; între stickere — cel puțin 3 mm.",
      "Файл A4 210×297 мм. Для «с вырезкой» — прозрачный фон (PNG) или PDF с контуром реза; между наклейками — не меньше 3 мм.",
      "A4 file 210×297 mm. For «die-cut» — a transparent background (PNG) or a PDF with the cut outline; at least 3 mm between stickers.",
    ),
    productionRu: "Самоклейка A4",
  },
];

/**
 * Shown on the category page as «la cerere» (on request, call / write): not
 * orderable online — no SRA3 sheets, no textured paper, assembly, or the price
 * list gives a range only.
 */
export const PS_ON_REQUEST: readonly { name: Localized; price: Localized }[] = [
  { name: L("Calendar de perete A3 (vertical / orizontal)", "Настенный календарь A3 (верт. / гориз.)", "Wall calendar A3 (portrait / landscape)"), price: L("100 lei", "100 лей", "100 lei") },
  { name: L("Calendar-poster A3", "Календарь-постер A3", "Poster calendar A3"), price: L("25 lei", "25 лей", "25 lei") },
  { name: L("Flyere A3", "Листовки A3", "A3 flyers"), price: L("20–25 lei / foaie", "20–25 лей / лист", "20–25 lei / sheet") },
  { name: L("Stickere pe foaie A3 (simplu / decupat)", "Наклейки на листе A3 (простые / с вырезкой)", "A3 sticker sheets (plain / die-cut)"), price: L("25 / 50 lei", "25 / 50 лей", "25 / 50 lei") },
  { name: L("Invitații și meniuri pe hârtie texturată", "Приглашения и меню на текстурной бумаге", "Invitations and menus on textured paper"), price: L("18 / 41 lei", "18 / 41 лей", "18 / 41 lei") },
  { name: L("Plicuri 105×210 (cu nume)", "Конверты 105×210 (с именем)", "Envelopes 105×210 (with a name)"), price: L("14–21 lei", "14–21 лей", "14–21 lei") },
  { name: L("Cărți de vizită Touch Cover", "Визитки Touch Cover", "Touch Cover business cards"), price: L("10–14 lei / buc.", "10–14 лей / шт.", "10–14 lei / pc") },
  { name: L("Broșuri și cataloage", "Брошюры и каталоги", "Brochures and catalogues"), price: L("după numărul de pagini", "по числу страниц", "by page count") },
  { name: L("Carnete cu bloc imprimat", "Блокноты с печатью блока", "Notepads with a printed block"), price: L("de la 26 lei", "от 26 лей", "from 26 lei") },
];

/** Category «Tipografie» (`/tipografie`). */
export const PS_CATEGORY_SLUG = "tipografie";
export const PS_CATEGORY_NAME: Localized = L("Tipografie", "Полиграфия", "Print shop");
export const PS_CATEGORY_IMAGE = "/print-shop/category.svg";

/** Business-card options (price list page 11) — see `businessCards.ts`. */
export const PS_BC_OPTIONS = {
  /** «Colțuri rotunde +0.5 lei» per card. */
  roundedCornersPerCardMdl: 0.5,
  /**
   * «Laminate — 4.5 lei» per card. ⚠ ASSUMPTION: 4.5 is the laminated card's price
   * (the list prints add-ons with a «+», as «+0.5» for corners), i.e. +3.0 over the
   * shop's 1.5; a laminated back still adds the shop's +0.5. Gloss or matte, same price.
   */
  laminatedCardMdl: 4.5,
} as const;

export function psProduct(id: string): PsProduct | null {
  return PS_PRODUCTS.find((p) => p.id === id) ?? null;
}

export function psProductBySlug(slug: string): PsProduct | null {
  return PS_PRODUCTS.find((p) => p.slug === slug) ?? null;
}

export function psFormat(product: PsProduct, id: string): PsFormat | null {
  return product.formats.find((f) => f.id === id) ?? null;
}
