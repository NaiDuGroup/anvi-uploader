import { colorDistance } from "@/lib/editor/editorPalette";
import type { ShopLang } from "@/lib/storefront/i18n";
import {
  STUDIO_SAMPLE_SHAPE,
  imageEffectiveDpi,
  layerBounds,
  rectsIntersect,
  type Rect,
  type StudioDoc,
  type StudioLayer,
  type StudioQrLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";
import { INK_DARK, qrContrastLevel, readableInk, textContrastLevel } from "./contrast";
import { defineStudioStrings } from "./i18n";
import { QR_MIN_MODULE_MM, QR_QUIET_MODULES, layerQrMatrix } from "./qr";
import type { StudioSurfaceSpec } from "./surfaces";
import { isNeonRgb } from "./palette";
import { textInkBox } from "./textFit";

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
  "sampleNotPrinted",
  "qrEmpty",
  "outside",
  "trim",
  "seam",
  "handle",
  "safeZone",
  "bleedShort",
  "textTiny",
  "outlineThin",
  "qrSmall",
  "qrContrast",
  "qrQuiet",
  "qrCovered",
  "overlap",
  "lowContrast",
  "neonRgb",
  // DTF apparel (`apparelQuality.ts`): never red — the transfer is printed as sent.
  "dtfPhotoDpi",
  "dtfOpaqueBg",
  "dtfThinLine",
  "dtfSmallText",
  "dtfEdge",
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
  /**
   * Colour of the design under a point (mm) where a photo lies, sampled
   * from the rendered photos (the editor passes it; without it text over a
   * photo is not checked). Photos vary: a finding from here is never red.
   */
  photoColorAt?: (surfaceId: string, px: number, py: number) => string | null;
}

/** Share of the product's dpi below which a photo is red / yellow. */
export const DPI_RED_SHARE = 0.5;
export const DPI_YELLOW_SHARE = 0.8;
export const TEXT_RED_PT = 5;
export const TEXT_YELLOW_PT = 7;
export const OUTLINE_MIN_MM = 0.1;
export const QR_RED_MODULE_MM = 0.25;
/** Smallest printed side of a QR code (mm, quiet zone included): red / yellow below. */
export const QR_RED_SIDE_MM = 8;
export const QR_YELLOW_SIDE_MM = 12;
/** Shapes are decoration: only nearly identical colours are reported. */
export const SHAPE_CONTRAST_DISTANCE = 12;
/** Two elements overlap when they share more than this in both directions (mm): touching is fine. */
export const OVERLAP_MIN_MM = 0.3;
/** Rounding slack of the position checks (mm). */
const EPS_MM = 0.05;

function textBox(l: StudioTextLayer, opts: StudioQualityOptions): Rect {
  if (!opts.textWidthMm || l.rotation) return textInkBox(l);
  const w: number = Math.min(l.w, Math.max(0, opts.textWidthMm(l)));
  const x: number = l.align === "left" ? l.x : l.align === "right" ? l.x + l.w - w : l.x + (l.w - w) / 2;
  const ink: Rect = textInkBox(l);
  return { x, y: ink.y, w, h: ink.h };
}

/** Where the visible content of a layer is (text: its letters; others: the box). */
function contentBox(l: StudioLayer, opts: StudioQualityOptions): Rect {
  return l.kind === "text" ? textBox(l, opts) : layerBounds(l);
}

function contains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function intersection(a: Rect, b: Rect): { w: number; h: number } {
  return {
    w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  const i = intersection(a, b);
  return i.w > OVERLAP_MIN_MM && i.h > OVERLAP_MIN_MM;
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

/** What is under a point of the surface below layer `index` (a colour; null over a photo / QR). */
export function studioColorBelow(surface: StudioSurface, index: number, px: number, py: number, productColorHex?: string | null): string | null {
  return backgroundAt(surface, index, px, py, productColorHex ?? "#ffffff");
}

/**
 * Colour on top of everything at a point of the surface (where a new element
 * lands): the topmost filled shape, the background, else the product colour;
 * null over a photo or a QR code.
 */
export function studioColorAt(surface: StudioSurface, px: number, py: number, productColorHex?: string | null): string | null {
  return backgroundAt(surface, surface.layers.length, px, py, productColorHex ?? "#ffffff");
}

/**
 * Default colour of a new text placed at `box`: white or navy, whichever reads
 * on what is under its middle (navy over a photo, where nothing is known).
 */
export function studioInkFor(surface: StudioSurface, box: Rect, productColorHex?: string | null): string {
  const under: string | null = studioColorAt(surface, box.x + box.w / 2, box.y + box.h / 2, productColorHex);
  return under ? readableInk(under) : INK_DARK;
}

/** Points along the middle line of a box (the letters of one line, a QR's area). */
function samplePoints(b: Rect, grid: "line" | "area"): [number, number][] {
  const cy: number = b.y + b.h / 2;
  if (grid === "line") return [0.15, 0.5, 0.85].map((f) => [b.x + b.w * f, cy] as [number, number]);
  const pts: [number, number][] = [];
  for (const fy of [0.02, 0.5, 0.98]) for (const fx of [0.02, 0.5, 0.98]) pts.push([b.x + b.w * fx, b.y + b.h * fy]);
  return pts;
}

/** A box spanning most of the area in one direction: a band / background meant to run into the bleed. */
function isBand(b: Rect, W: number, H: number): boolean {
  return b.w >= W * 0.8 || b.h >= H * 0.8;
}

/** A photo spanning most of the area: a background meant to run into the bleed. */
function isBackdrop(l: StudioLayer, b: Rect, W: number, H: number): boolean {
  return l.kind === "image" && isBand(b, W, H);
}

function positionItem(
  l: StudioLayer,
  b: Rect,
  surface: StudioSurface,
  spec: StudioSurfaceSpec | undefined,
): { level: StudioQualityLevel; code: StudioQualityCode } | null {
  const W: number = surface.widthMm;
  const H: number = surface.heightMm;
  // Nothing of it is on the product: it would not print at all.
  if (!rectsIntersect(b, { x: 0, y: 0, w: W, h: H })) return { level: "red", code: "outside" };
  const s: number = surface.safeMm;
  // Distance of each side from the edge of the area (negative: beyond it).
  const sides: number[] = [b.x, b.y, W - (b.x + b.w), H - (b.y + b.h)];
  const bleed: number = Math.max(0, surface.bleedMm);
  // Business cards: a background (band, full photo) that ends just short of the file edge leaves a white sliver after the cut.
  if (spec?.trimmed && (isBand(b, W, H) && (l.kind === "shape" || l.kind === "image"))) {
    return sides.some((d) => d > EPS_MM && d < s - EPS_MM) ? { level: "yellow", code: "bleedShort" } : null;
  }
  if (l.kind === "shape") {
    // Bands and backdrops are meant to run into the bleed; a figure across the cut line gets cut.
    if (isBand(b, W, H)) return null;
    return sides.some((d) => d < bleed - EPS_MM) ? { level: "red", code: "trim" } : null;
  }
  if (isBackdrop(l, b, W, H)) {
    // Full bleed on a side is intended; an edge stopping in the margin band may show a white sliver.
    return sides.some((d) => d > EPS_MM && d < s - EPS_MM) ? { level: "yellow", code: "safeZone" } : null;
  }
  // Content across the cut line loses its edge at the trimmer: letters, codes and logos get clipped.
  if (sides.some((d) => d < bleed - EPS_MM)) return { level: "red", code: "trim" };
  const seams: number[] = spec?.seams ?? [];
  if (seams.some((x) => b.x < x - 1e-6 && b.x + b.w > x + 1e-6)) return { level: "red", code: "seam" };
  if ((l.kind === "text" || l.kind === "qr") && (spec?.zones ?? []).some((z) => rectsIntersect(b, { x: z.x, y: 0, w: z.w, h: H }))) {
    return { level: "yellow", code: "handle" };
  }
  if (sides.some((d) => d < s - EPS_MM)) return { level: "yellow", code: "safeZone" };
  return null;
}

function worst(a: StudioQualityLevel | null, b: StudioQualityLevel | null): StudioQualityLevel | null {
  return a === "red" || b === "red" ? "red" : a ?? b;
}

/** Every print problem of the document (in layer order, per surface). */
export function evaluateStudioQuality(
  doc: StudioDoc,
  specs: readonly StudioSurfaceSpec[],
  opts: StudioQualityOptions = {},
): StudioQualityItem[] {
  const out: StudioQualityItem[] = [];
  const seen = new Set<string>();
  const base: string = opts.productColorHex ?? "#ffffff";
  for (const surface of doc.surfaces) {
    const spec: StudioSurfaceSpec | undefined = specs.find((s) => s.id === surface.id) ?? specs[0];
    const add = (level: StudioQualityLevel, code: StudioQualityCode, l: StudioLayer, vars?: StudioQualityItem["vars"]) => {
      const id = `${code}:${l.id}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, level, code, layerId: l.id, surfaceId: surface.id, ...(vars ? { vars } : {}) });
    };
    const boxes: Rect[] = surface.layers.map((l) => contentBox(l, opts));

    /** QR modules against their background and a clean quiet zone. */
    const qrBackgroundItems = (l: StudioQrLayer, index: number, b: Rect, moduleMm: number): void => {
      if (l.background) {
        const level = qrContrastLevel(l.color, l.background);
        if (level) add(level, "qrContrast", l);
        return;
      }
      // No own background: what is under the code is its background, quiet zone included.
      const pad: number = moduleMm * QR_QUIET_MODULES;
      const area: Rect = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
      const unders: (string | null)[] = samplePoints(area, "area").map(([px, py]) => backgroundAt(surface, index, px, py, base));
      const known: string[] = unders.filter((c): c is string => c != null);
      let level: StudioQualityLevel | null = null;
      for (const c of new Set(known)) level = worst(level, qrContrastLevel(l.color, c));
      if (level) add(level, "qrContrast", l);
      if (known.length < unders.length || new Set(known.map((c) => c.toLowerCase())).size > 1) add("yellow", "qrQuiet", l);
    };

    // Toner (business cards): very bright screen greens / blues print duller.
    if (spec?.trimmed && surface.background && isNeonRgb(surface.background)) {
      out.push({ id: `neonRgb:${surface.id}`, level: "yellow", code: "neonRgb", surfaceId: surface.id });
    }

    surface.layers.forEach((l, index) => {
      if (l.hidden) return;
      const b: Rect = boxes[index]!;
      if (spec?.trimmed && !(l.kind === "text" && l.placeholder)) {
        const colour: string | null = l.kind === "text" ? l.color : l.kind === "shape" ? l.fill ?? l.stroke ?? null : l.kind === "qr" ? l.color : null;
        if (colour && isNeonRgb(colour)) add("yellow", "neonRgb", l);
      }

      // Business cards: an empty logo / photo spot or QR is simply not printed (listed on «Verifică»), not a blocker.
      const emptyLevel: StudioQualityLevel = spec?.trimmed ? "yellow" : "red";
      if (l.kind === "image") {
        if (!l.src) add(emptyLevel, "photoEmpty", l);
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
        if (!m) add(emptyLevel, "qrEmpty", l);
        else {
          const side: number = Math.min(l.w, l.h);
          const moduleMm: number = side / (m.size + QR_QUIET_MODULES * 2);
          const bySide: StudioQualityLevel | null = side < QR_RED_SIDE_MM ? "red" : side < QR_YELLOW_SIDE_MM ? "yellow" : null;
          const byModule: StudioQualityLevel | null = moduleMm < QR_RED_MODULE_MM ? "red" : moduleMm < QR_MIN_MODULE_MM ? "yellow" : null;
          const small: StudioQualityLevel | null = worst(bySide, byModule);
          if (small) add(small, "qrSmall", l, { mm: Math.round(moduleMm * 100) / 100 });
          qrBackgroundItems(l, index, b, moduleMm);
        }
      }
      if (l.kind === "text") {
        if (l.text.trim() === "") return;
        if (l.placeholder && spec?.trimmed) {
          // Not printed at all: no other check applies to it.
          add("yellow", "sampleNotPrinted", l, { text: l.text.slice(0, 40) });
          return;
        }
        if (l.placeholder) add("yellow", "textPlaceholder", l, { text: l.text.slice(0, 40) });
        if (l.sizePt < TEXT_YELLOW_PT) add(l.sizePt < TEXT_RED_PT ? "red" : "yellow", "textTiny", l, { pt: Math.round(l.sizePt * 10) / 10 });
        if (l.stroke && l.stroke.widthMm > 0 && l.stroke.widthMm < OUTLINE_MIN_MM) add("yellow", "outlineThin", l);
      }

      const pos = positionItem(l, b, surface, spec);
      if (pos) add(pos.level, pos.code, l);

      // White on white: the colour against what lies under the layer.
      if (l.kind === "shape") {
        // Shapes stacked on shapes build one figure (a cross, a band): only the product / background matters.
        // Only where the background itself is under it: a white icon on a coloured band reads; faint tints and «photo here» hints never print as figures.
        const bg: string = surface.background ?? base;
        const under: string | null = backgroundAt(surface, index, l.x + l.w / 2, l.y + l.h / 2, base);
        const faint: boolean = (l.opacity ?? 1) < 0.6 || l.name === STUDIO_SAMPLE_SHAPE;
        if (l.fill && !faint && under === bg && colorDistance(l.fill, bg) < SHAPE_CONTRAST_DISTANCE) add("yellow", "lowContrast", l);
        return;
      }
      if (l.kind === "text") {
        // The same rule whatever is under the letters (product, «Fundal», a shape): the worst spot counts.
        let level: StudioQualityLevel | null = null;
        for (const [px, py] of samplePoints(b, "line")) {
          const known: string | null = backgroundAt(surface, index, px, py, base);
          // Over a photo: its colour there, when the editor can tell (yellow at most).
          const under: string | null = known ?? opts.photoColorAt?.(surface.id, px, py) ?? null;
          if (!under) continue;
          // A strong outline keeps the text readable.
          if (l.stroke && l.stroke.widthMm >= 0.2 && textContrastLevel(l.stroke.color, under) == null) continue;
          const here: StudioQualityLevel | null = textContrastLevel(l.color, under);
          level = worst(level, known == null && here === "red" ? "yellow" : here);
        }
        if (level) add(level, "lowContrast", l);
      }
    });

    // Elements on top of each other: texts hidden, codes made unreadable.
    const visible = (l: StudioLayer): boolean =>
      !l.hidden &&
      !(spec?.trimmed && l.kind === "text" && l.placeholder) && (l.opacity ?? 1) >= 0.3 && !(l.kind === "text" && l.text.trim() === "") && !(l.kind === "qr" && layerQrMatrix(l) == null);
    for (let j = 1; j < surface.layers.length; j++) {
      const upper: StudioLayer = surface.layers[j]!;
      if (!visible(upper)) continue;
      for (let i = 0; i < j; i++) {
        const lower: StudioLayer = surface.layers[i]!;
        if (!visible(lower) || !overlaps(boxes[i]!, boxes[j]!)) continue;
        if (lower.kind === "qr") {
          // Anything drawn over a code breaks it.
          add("red", "qrCovered", upper);
        } else if (upper.kind === "qr") {
          // A code over a text: the text is hidden, or shows through a transparent code.
          if (lower.kind === "text") {
            if (upper.background) add("yellow", "overlap", lower);
            else add("red", "qrCovered", lower);
          }
          // Photos / shapes under a code are its background (checked above).
        } else if (lower.kind === "text" && (upper.kind === "text" || upper.kind === "image" || upper.kind === "shape")) {
          if (upper.kind === "shape" && (upper.opacity ?? 1) < 0.6) continue;
          add("yellow", "overlap", upper);
        }
        // Text over a photo or a shape is a design choice; photos on photos are a collage.
      }
    }

    // Nothing to print at all (a blank start): a blank product would be made.
    const printable: boolean =
      surface.background != null ||
      surface.layers.some(
        (l) =>
          !l.hidden &&
          ((l.kind === "text" && l.text.trim() !== "" && !(spec?.trimmed && l.placeholder)) ||
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
    sampleNotPrinted_title: "Câmp necompletat — nu se tipărește",
    sampleNotPrinted_fix: "„{text}” e doar un exemplu: scrie datele tale sau lasă-l gol.",
    bleedShort_title: "Fundalul nu ajunge la marginea foii",
    bleedShort_fix: "Trage-l până la marginea exterioară (peste linia roșie), altfel după tăiere rămâne o dungă albă.",
    qrEmpty_title: "Codul QR nu are conținut",
    qrEmpty_fix: "Completează linkul, telefonul sau datele, ori șterge codul.",
    outside_title: "Un element e în afara zonei de tipar",
    outside_fix: "Nu se va tipări. Mută-l înapoi pe produs sau șterge-l.",
    trim_title: "Elementul trece peste linia de tăiere",
    trim_fix: "Partea de dincolo de linia roșie se taie la tipar. Mută-l în interiorul liniei albastre.",
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
    qrContrast_title: "Codul QR se vede slab pe fundal",
    qrContrast_fix: "Telefonul s-ar putea să nu-l citească. Pornește «Fundal alb» sau alege o culoare mai închisă pentru cod.",
    qrQuiet_title: "Codul QR nu are margine liberă",
    qrQuiet_fix: "Sub cod sau lângă el e o fotografie sau alt desen. Pornește «Fundal alb» sau mută codul pe un loc liber.",
    qrCovered_title: "Ceva acoperă codul QR",
    qrCovered_fix: "Un cod acoperit nu se scanează. Mută textul sau imaginea de pe cod.",
    overlap_title: "Elemente suprapuse",
    overlap_fix: "Un element acoperă textul. Mută-le ca să nu se suprapună.",
    lowContrast_title: "Culoarea se pierde pe fundal",
    lowContrast_fix: "Culoarea e aproape la fel cu ce e dedesubt. Alege o culoare mai contrastantă.",
    neonRgb_title: "Culoare foarte aprinsă — la tipar iese mai ștearsă",
    neonRgb_fix: "Verdele și albastrul neon de pe ecran nu se pot tipări la fel de vii pe toner. Dacă e important, alege o nuanță mai închisă.",
    dtfPhotoDpi_title: "Imaginea e mică pentru mărimea imprimării",
    dtfPhotoDpi_fix: "La mărimea reală are ~{dpi} dpi (recomandat cel puțin 150). Pe tricou poate ieși neclară: micșorează-o sau încarcă un fișier mai mare.",
    dtfOpaqueBg_title: "Imaginea are fundal — se va imprima și el",
    dtfOpaqueBg_fix: "DTF imprimă tot ce e în fișier, inclusiv un fundal alb sau colorat (un dreptunghi pe tricou). Apasă „Elimină fundalul” sau încarcă un PNG transparent.",
    dtfThinLine_title: "Linii foarte subțiri",
    dtfThinLine_fix: "Liniile sub 1 mm pot să nu se transfere pe țesătură. Fă-le mai groase.",
    dtfSmallText_title: "Text foarte mic pentru țesătură",
    dtfSmallText_fix: "Literele mai mici de ~2 mm ({pt} pt) se pot pierde pe tricou. Mărește textul la cel puțin 9 pt.",
    dtfEdge_title: "Designul atinge marginea zonei",
    dtfEdge_fix: "Ce iese peste marginea zonei de imprimare se taie. Mută-l sau micșorează-l puțin.",
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
    sampleNotPrinted_title: "Поле не заполнено — не печатается",
    sampleNotPrinted_fix: "«{text}» — только пример: впишите свои данные или оставьте пустым.",
    bleedShort_title: "Фон не доходит до края файла",
    bleedShort_fix: "Растяните его до внешнего края (за красную линию), иначе после резки останется белая полоска.",
    qrEmpty_title: "QR-код пустой",
    qrEmpty_fix: "Заполните ссылку, телефон или данные, либо удалите код.",
    outside_title: "Элемент вне зоны печати",
    outside_fix: "Он не напечатается. Верните его на изделие или удалите.",
    trim_title: "Элемент заходит за линию обреза",
    trim_fix: "Всё, что за красной линией, обрежется при печати. Сдвиньте внутрь синей линии.",
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
    qrContrast_title: "QR-код плохо виден на фоне",
    qrContrast_fix: "Телефон может его не прочитать. Включите «Белый фон» или выберите для кода цвет темнее.",
    qrQuiet_title: "Вокруг QR-кода нет чистого поля",
    qrQuiet_fix: "Под кодом или рядом фото или другой рисунок. Включите «Белый фон» или переместите код на свободное место.",
    qrCovered_title: "QR-код чем-то закрыт",
    qrCovered_fix: "Закрытый код не сканируется. Уберите текст или картинку с кода.",
    overlap_title: "Элементы наложились",
    overlap_fix: "Один элемент закрывает текст. Раздвиньте их.",
    lowContrast_title: "Цвет сливается с фоном",
    lowContrast_fix: "Цвет почти такой же, как под ним. Выберите более контрастный.",
    neonRgb_title: "Очень яркий цвет — при печати будет тусклее",
    neonRgb_fix: "Неоновые зелёный и синий с экрана тонер не передаёт так же ярко. Если это важно, выберите оттенок темнее.",
    dtfPhotoDpi_title: "Изображение мало для размера принта",
    dtfPhotoDpi_fix: "В реальном размере ~{dpi} dpi (рекомендуем не меньше 150). На футболке может выйти нечётко: уменьшите его или загрузите файл побольше.",
    dtfOpaqueBg_title: "У изображения есть фон — он тоже напечатается",
    dtfOpaqueBg_fix: "DTF печатает всё, что есть в файле, включая белый или цветной фон (прямоугольник на футболке). Нажмите «Убрать фон» или загрузите прозрачный PNG.",
    dtfThinLine_title: "Очень тонкие линии",
    dtfThinLine_fix: "Линии тоньше 1 мм могут не перенестись на ткань. Сделайте их толще.",
    dtfSmallText_title: "Слишком мелкий текст для ткани",
    dtfSmallText_fix: "Буквы меньше ~2 мм ({pt} pt) могут потеряться на футболке. Увеличьте текст хотя бы до 9 pt.",
    dtfEdge_title: "Дизайн касается края зоны",
    dtfEdge_fix: "Всё, что выходит за край зоны печати, обрежется. Сдвиньте или немного уменьшите.",
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
    sampleNotPrinted_title: "Empty field — not printed",
    sampleNotPrinted_fix: "“{text}” is only an example: type your details or leave it empty.",
    bleedShort_title: "The background does not reach the file edge",
    bleedShort_fix: "Stretch it to the outer edge (past the red line), or a white sliver stays after cutting.",
    qrEmpty_title: "The QR code is empty",
    qrEmpty_fix: "Fill in the link, phone or details, or delete the code.",
    outside_title: "Something is outside the print area",
    outside_fix: "It will not be printed. Move it back onto the product or delete it.",
    trim_title: "Something crosses the cut line",
    trim_fix: "Whatever is past the red line is cut off in print. Move it inside the blue line.",
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
    qrContrast_title: "The QR code is faint on its background",
    qrContrast_fix: "Phones may not read it. Turn on «White background» or pick a darker colour for the code.",
    qrQuiet_title: "The QR code has no clear margin",
    qrQuiet_fix: "There is a photo or a drawing under or next to it. Turn on «White background» or move the code to a clear spot.",
    qrCovered_title: "Something covers the QR code",
    qrCovered_fix: "A covered code does not scan. Move the text or picture off the code.",
    overlap_title: "Elements overlap",
    overlap_fix: "Something covers a text. Move them apart.",
    lowContrast_title: "The colour gets lost on the background",
    lowContrast_fix: "It is almost the same colour as what is under it. Pick a contrasting colour.",
    neonRgb_title: "Very bright colour — it prints duller",
    neonRgb_fix: "Neon screen greens and blues cannot be printed as bright on toner. If it matters, pick a deeper shade.",
    dtfPhotoDpi_title: "The image is small for this print size",
    dtfPhotoDpi_fix: "At its real size it has ~{dpi} dpi (we recommend at least 150). It may look blurry on the garment: make it smaller or upload a bigger file.",
    dtfOpaqueBg_title: "The image has a background — it will print too",
    dtfOpaqueBg_fix: "DTF prints everything in the file, a white or coloured background too (a box on the shirt). Tap «Remove background» or upload a transparent PNG.",
    dtfThinLine_title: "Very thin lines",
    dtfThinLine_fix: "Lines under 1 mm may not transfer onto fabric. Make them thicker.",
    dtfSmallText_title: "Text too small for fabric",
    dtfSmallText_fix: "Letters under ~2 mm ({pt} pt) can get lost on a shirt. Make the text at least 9 pt.",
    dtfEdge_title: "The design touches the zone edge",
    dtfEdge_fix: "Anything past the edge of the print zone is cut off. Move it in or make it a little smaller.",
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
