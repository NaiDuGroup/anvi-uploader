import { colorDistance, PALETTE_MIN_DISTANCE } from "@/lib/editor/editorPalette";
import type { ShopLang } from "@/lib/storefront/i18n";
import {
  imageEffectiveDpi,
  layerBounds,
  rectsIntersect,
  type Rect,
  type StudioDoc,
  type StudioLayer,
  type StudioShapeLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";
import { defineStudioStrings } from "./i18n";
import { QR_MIN_MODULE_MM, QR_QUIET_MODULES, layerQrMatrix } from "./qr";
import type { StudioSurfaceSpec } from "./surfaces";

/**
 * «Semafor» — print checks of a Studio design, in plain words (ro / ru / en),
 * the way a print operator checks a file. Red items block «Continuă»; yellow
 * ones can be accepted. Pure and deterministic (no DOM): text bounds are the
 * layer box, which the editor keeps measured.
 */

export type StudioQualityLevel = "red" | "yellow";

export const STUDIO_QUALITY_CODES = [
  "designEmpty",
  "photoDpi",
  "photoEmpty",
  "textPlaceholder",
  "qrEmpty",
  "outside",
  "seam",
  "handle",
  "safeZone",
  "textTiny",
  "outlineThin",
  "qrSmall",
  "lowContrast",
] as const;
export type StudioQualityCode = (typeof STUDIO_QUALITY_CODES)[number];

export interface StudioQualityItem {
  id: string;
  level: StudioQualityLevel;
  code: StudioQualityCode;
  layerId?: string;
  surfaceId?: string;
  vars?: Record<string, string | number>;
}

export interface StudioQualityOptions {
  /** Colour of the product surface (mug body, notebook cover); default white. */
  productColorHex?: string | null;
  /** Measured width of a text's glyphs (mm); default: the layer box. */
  textWidthMm?: (layer: StudioTextLayer) => number;
}

/** Share of the product's dpi below which a photo is red / yellow. */
export const DPI_RED_SHARE = 0.5;
export const DPI_YELLOW_SHARE = 0.8;
export const TEXT_RED_PT = 5;
export const TEXT_YELLOW_PT = 7;
export const OUTLINE_MIN_MM = 0.1;
export const QR_RED_MODULE_MM = 0.25;
/** Colour distance (editorPalette scale) under which text is invisible (red). */
export const CONTRAST_RED_DISTANCE = 20;
/** Shapes are decoration: only nearly identical colours are reported. */
export const SHAPE_CONTRAST_DISTANCE = 12;

function textBox(l: StudioTextLayer, opts: StudioQualityOptions): Rect {
  if (!opts.textWidthMm || l.rotation) return layerBounds(l);
  const w: number = Math.min(l.w, Math.max(0, opts.textWidthMm(l)));
  const x: number = l.align === "left" ? l.x : l.align === "right" ? l.x + l.w - w : l.x + (l.w - w) / 2;
  return { x, y: l.y, w, h: l.h };
}

function contains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** What is right under a point of the surface, below layer `index`: a colour, or null for a photo / QR (unknown). */
function backgroundAt(surface: StudioSurface, index: number, px: number, py: number, base: string): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const l: StudioLayer = surface.layers[i]!;
    if (l.hidden || (l.opacity != null && l.opacity < 0.6)) continue;
    if (!contains(layerBounds(l), px, py)) continue;
    if (l.kind === "image" || l.kind === "qr") return null;
    if (l.kind === "shape" && l.fill && l.shape !== "line") return l.fill;
  }
  return surface.background ?? base;
}

function positionItem(
  l: StudioLayer,
  b: Rect,
  surface: StudioSurface,
  spec: StudioSurfaceSpec | undefined,
): StudioQualityCode | null {
  const W: number = surface.widthMm;
  const H: number = surface.heightMm;
  if (!rectsIntersect(b, { x: 0, y: 0, w: W, h: H })) return "outside";
  if (l.kind === "shape") return null;
  const seams: number[] = spec?.seams ?? [];
  if (seams.some((s) => b.x < s - 1e-6 && b.x + b.w > s + 1e-6)) return "seam";
  if ((l.kind === "text" || l.kind === "qr") && (spec?.zones ?? []).some((z) => rectsIntersect(b, { x: z.x, y: 0, w: z.w, h: H }))) {
    return "handle";
  }
  const s: number = surface.safeMm;
  if (b.x < s - 1e-6 || b.y < s - 1e-6 || b.x + b.w > W - s + 1e-6 || b.y + b.h > H - s + 1e-6) return "safeZone";
  return null;
}

/** Every print problem of the document (in layer order, per surface). */
export function evaluateStudioQuality(
  doc: StudioDoc,
  specs: readonly StudioSurfaceSpec[],
  opts: StudioQualityOptions = {},
): StudioQualityItem[] {
  const out: StudioQualityItem[] = [];
  const base: string = opts.productColorHex ?? "#ffffff";
  for (const surface of doc.surfaces) {
    const spec: StudioSurfaceSpec | undefined = specs.find((s) => s.id === surface.id) ?? specs[0];
    const add = (level: StudioQualityLevel, code: StudioQualityCode, l: StudioLayer, vars?: StudioQualityItem["vars"]) =>
      out.push({ id: `${code}:${l.id}`, level, code, layerId: l.id, surfaceId: surface.id, ...(vars ? { vars } : {}) });

    surface.layers.forEach((l, index) => {
      if (l.hidden) return;
      const b: Rect = l.kind === "text" ? textBox(l, opts) : layerBounds(l);

      if (l.kind === "image") {
        if (!l.src) add("red", "photoEmpty", l);
        else {
          const dpi: number | null = imageEffectiveDpi(l);
          const norm: number = spec?.dpi ?? 300;
          if (dpi != null && dpi < norm * DPI_YELLOW_SHARE) {
            add(dpi < norm * DPI_RED_SHARE ? "red" : "yellow", "photoDpi", l, { dpi: Math.round(dpi), norm });
          }
        }
      }
      if (l.kind === "qr") {
        const m = layerQrMatrix(l);
        if (!m) add("red", "qrEmpty", l);
        else {
          const moduleMm: number = Math.min(l.w, l.h) / (m.size + QR_QUIET_MODULES * 2);
          if (moduleMm < QR_MIN_MODULE_MM) {
            add(moduleMm < QR_RED_MODULE_MM ? "red" : "yellow", "qrSmall", l, { mm: Math.round(moduleMm * 100) / 100 });
          }
        }
      }
      if (l.kind === "text") {
        if (l.text.trim() === "") return;
        if (l.placeholder) add("yellow", "textPlaceholder", l, { text: l.text.slice(0, 40) });
        if (l.sizePt < TEXT_YELLOW_PT) add(l.sizePt < TEXT_RED_PT ? "red" : "yellow", "textTiny", l, { pt: Math.round(l.sizePt * 10) / 10 });
        if (l.stroke && l.stroke.widthMm > 0 && l.stroke.widthMm < OUTLINE_MIN_MM) add("yellow", "outlineThin", l);
      }

      const pos: StudioQualityCode | null = positionItem(l, b, surface, spec);
      if (pos) add("yellow", pos, l);

      // White on white: the colour against what lies right under the layer's centre.
      if (l.kind === "text" || l.kind === "shape") {
        const color: string | null = l.kind === "text" ? l.color : (l as StudioShapeLayer).fill;
        if (!color) return;
        if (l.kind === "shape") {
          // Shapes stacked on shapes build one figure (a cross, a band): only the product / background matters.
          if (colorDistance(color, surface.background ?? base) < SHAPE_CONTRAST_DISTANCE) add("yellow", "lowContrast", l);
          return;
        }
        const under: string | null = backgroundAt(surface, index, b.x + b.w / 2, b.y + b.h / 2, base);
        if (!under) return;
        const d: number = colorDistance(color, under);
        // A strong outline keeps the text readable.
        if (l.stroke && l.stroke.widthMm >= 0.2 && colorDistance(l.stroke.color, under) >= PALETTE_MIN_DISTANCE) return;
        if (d < PALETTE_MIN_DISTANCE) add(d < CONTRAST_RED_DISTANCE ? "red" : "yellow", "lowContrast", l);
      }
    });
    // Nothing to print at all (a blank start): a blank product would be made.
    const printable: boolean =
      surface.background != null ||
      surface.layers.some(
        (l) =>
          !l.hidden &&
          ((l.kind === "text" && l.text.trim() !== "") ||
            (l.kind === "image" && l.src != null) ||
            l.kind === "shape" ||
            (l.kind === "qr" && layerQrMatrix(l) != null)),
      );
    if (!printable) out.push({ id: `designEmpty:${surface.id}`, level: "red", code: "designEmpty", surfaceId: surface.id });
  }
  return out;
}

/** True when any item is red (the customer cannot continue). */
export function studioQualityBlocks(items: readonly StudioQualityItem[]): boolean {
  return items.some((i) => i.level === "red");
}

export function studioQualityCounts(items: readonly StudioQualityItem[]): { red: number; yellow: number } {
  return {
    red: items.filter((i) => i.level === "red").length,
    yellow: items.filter((i) => i.level === "yellow").length,
  };
}

const qualityStrings = defineStudioStrings({
  ro: {
    designEmpty_title: "Designul e gol",
    designEmpty_fix: "Adaugă un text, o fotografie sau alege un șablon.",
    photoDpi_title: "Fotografia e prea mică pentru această mărime",
    photoDpi_fix: "Are ~{dpi} dpi la tipar (ideal {norm}). Micșorează fotografia sau încarcă una mai mare.",
    photoEmpty_title: "Un loc pentru fotografie a rămas gol",
    photoEmpty_fix: "Adaugă o fotografie sau șterge locul gol.",
    textPlaceholder_title: "A rămas textul de exemplu",
    textPlaceholder_fix: "Scrie textul tău în locul lui „{text}” sau șterge-l.",
    qrEmpty_title: "Codul QR nu are conținut",
    qrEmpty_fix: "Completează linkul, telefonul sau datele, ori șterge codul.",
    outside_title: "Un element e în afara zonei de tipar",
    outside_fix: "Nu se va tipări. Mută-l înapoi pe produs sau șterge-l.",
    seam_title: "Un element e tăiat la îmbinare",
    seam_fix: "Capetele imprimeului se întâlnesc la mâner. Mută elementul mai spre centru.",
    handle_title: "Textul e lângă mâner",
    handle_fix: "Lângă mâner se vede greu. Mută-l mai spre centrul cănii.",
    safeZone_title: "Prea aproape de margine",
    safeZone_fix: "La margine se poate tăia. Mută-l în interiorul liniei albastre.",
    textTiny_title: "Textul e prea mic",
    textTiny_fix: "Are {pt} pt. Pentru tipar alege cel puțin 7 pt.",
    outlineThin_title: "Conturul textului e prea subțire",
    outlineThin_fix: "Un contur atât de fin nu se vede la tipar. Îngroașă-l sau oprește-l.",
    qrSmall_title: "Codul QR e prea mic",
    qrSmall_fix: "Telefonul s-ar putea să nu-l citească. Mărește-l.",
    lowContrast_title: "Culoarea se pierde pe fundal",
    lowContrast_fix: "Culoarea e aproape la fel cu ce e dedesubt. Alege o culoare mai contrastantă.",
    summaryRed: "{n} problemă de rezolvat",
    summaryRedMany: "{n} probleme de rezolvat",
    summaryYellow: "{n} avertismente",
    summaryOk: "Totul arată bine pentru tipar",
    blocked: "Rezolvă problemele roșii ca să continui",
  },
  ru: {
    designEmpty_title: "Дизайн пустой",
    designEmpty_fix: "Добавьте текст, фото или выберите шаблон.",
    photoDpi_title: "Фото слишком маленькое для этого размера",
    photoDpi_fix: "При печати ~{dpi} dpi (нужно {norm}). Уменьшите фото или загрузите побольше.",
    photoEmpty_title: "Место для фото осталось пустым",
    photoEmpty_fix: "Добавьте фото или удалите пустое место.",
    textPlaceholder_title: "Остался текст-образец",
    textPlaceholder_fix: "Напишите свой текст вместо «{text}» или удалите его.",
    qrEmpty_title: "QR-код пустой",
    qrEmpty_fix: "Заполните ссылку, телефон или данные, либо удалите код.",
    outside_title: "Элемент вне зоны печати",
    outside_fix: "Он не напечатается. Верните его на изделие или удалите.",
    seam_title: "Элемент разрезан на стыке",
    seam_fix: "Края рисунка сходятся у ручки. Сдвиньте элемент ближе к центру.",
    handle_title: "Текст у самой ручки",
    handle_fix: "У ручки его плохо видно. Сдвиньте ближе к центру кружки.",
    safeZone_title: "Слишком близко к краю",
    safeZone_fix: "У края может обрезаться. Сдвиньте внутрь синей линии.",
    textTiny_title: "Текст слишком мелкий",
    textTiny_fix: "Сейчас {pt} pt. Для печати нужно не меньше 7 pt.",
    outlineThin_title: "Обводка текста слишком тонкая",
    outlineThin_fix: "Такая тонкая обводка не пропечатается. Сделайте толще или выключите.",
    qrSmall_title: "QR-код слишком маленький",
    qrSmall_fix: "Телефон может его не прочитать. Увеличьте код.",
    lowContrast_title: "Цвет сливается с фоном",
    lowContrast_fix: "Цвет почти такой же, как под ним. Выберите более контрастный.",
    summaryRed: "{n} проблема — нужно исправить",
    summaryRedMany: "Проблем: {n} — нужно исправить",
    summaryYellow: "Предупреждений: {n}",
    summaryOk: "Всё в порядке для печати",
    blocked: "Исправьте красные пункты, чтобы продолжить",
  },
  en: {
    designEmpty_title: "The design is empty",
    designEmpty_fix: "Add a text or a photo, or pick a template.",
    photoDpi_title: "The photo is too small for this size",
    photoDpi_fix: "It prints at ~{dpi} dpi ({norm} is ideal). Make it smaller or upload a bigger photo.",
    photoEmpty_title: "A photo spot is still empty",
    photoEmpty_fix: "Add a photo or delete the empty spot.",
    textPlaceholder_title: "Sample text is still there",
    textPlaceholder_fix: "Type your own text instead of “{text}” or delete it.",
    qrEmpty_title: "The QR code is empty",
    qrEmpty_fix: "Fill in the link, phone or details, or delete the code.",
    outside_title: "Something is outside the print area",
    outside_fix: "It will not be printed. Move it back onto the product or delete it.",
    seam_title: "Something is cut at the seam",
    seam_fix: "Both ends of the print meet at the handle. Move it towards the centre.",
    handle_title: "Text is next to the handle",
    handle_fix: "It is hard to see by the handle. Move it towards the middle of the mug.",
    safeZone_title: "Too close to the edge",
    safeZone_fix: "Edges may be trimmed. Move it inside the blue line.",
    textTiny_title: "The text is too small",
    textTiny_fix: "It is {pt} pt. Use at least 7 pt for print.",
    outlineThin_title: "The text outline is too thin",
    outlineThin_fix: "Such a fine outline will not show in print. Make it thicker or turn it off.",
    qrSmall_title: "The QR code is too small",
    qrSmall_fix: "Phones may not read it. Make it bigger.",
    lowContrast_title: "The colour gets lost on the background",
    lowContrast_fix: "It is almost the same colour as what is under it. Pick a contrasting colour.",
    summaryRed: "{n} problem to fix",
    summaryRedMany: "{n} problems to fix",
    summaryYellow: "{n} warnings",
    summaryOk: "Everything looks good for print",
    blocked: "Fix the red items to continue",
  },
});

export type StudioQualityStringKey = Parameters<ReturnType<typeof qualityStrings>>[0];

/** Strings of the quality panel (summary, blocked hint). */
export function studioQualityT(lang: ShopLang) {
  return qualityStrings(lang);
}

/** Plain-language title and fix hint of an item. */
export function studioQualityMessage(item: Pick<StudioQualityItem, "code" | "vars">, lang: ShopLang): { title: string; fix: string } {
  const t = qualityStrings(lang);
  return { title: t(`${item.code}_title`, item.vars), fix: t(`${item.code}_fix`, item.vars) };
}
