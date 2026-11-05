import { mmToPt, ptToMm, type StudioDoc, type StudioImageLayer, type StudioImageSrc, type StudioLayer, type StudioSurface, type StudioTextLayer } from "./document";
import { TEXT_ASCENT, TEXT_DESCENT, TEXT_PAD, type MeasureText } from "./textFit";

/**
 * «Pix ca formular» (Pens.com style): the pen design from a short form —
 * optional logo, line 1, optional line 2, font, alignment — laid out on the
 * barrel print area as an ordinary Studio document (text + image layers), so
 * the editor, the quality check, the verify step and the print export stay
 * the same. Pure: text widths come from `measure` (the editor's canvas
 * measure in the browser, a stub in tests).
 *
 * Geometry works on the letters' ink box (`textInkBox`): ascent + descent of
 * one line = 1.08 em, inside the safe zone. Text never overflows: it shrinks
 * to fit the width; below 7 pt the form warns (`textSmall`). Two lines that
 * would be below 7 pt stacked (a 6 mm high pen print) go side by side on one
 * row when that gives a larger size (`inline`).
 */

export type PenAlign = "left" | "center" | "right";

/** Fonts offered by the form (all in the Studio font list, Cyrillic-capable). */
export const PEN_FORM_FONTS: readonly { family: string; bold: boolean; kind: "sans" | "serif" | "bold" | "script" | "hand" }[] = [
  { family: "Montserrat", bold: true, kind: "sans" },
  { family: "Merriweather", bold: false, kind: "serif" },
  { family: "Oswald", bold: true, kind: "bold" },
  { family: "Lobster", bold: false, kind: "script" },
  { family: "Caveat", bold: true, kind: "hand" },
];

export interface PenFormState {
  line1: string;
  line2: string;
  font: string;
  align: PenAlign;
  /** Logo picture (uploaded / local), natural size known. */
  logo: StudioImageSrc | null;
}

export const PEN_FORM_EMPTY: PenFormState = { line1: "", line2: "", font: "Montserrat", align: "center", logo: null };

/** Smallest readable text on the barrel (the quality check warns below it). */
export const PEN_MIN_TEXT_PT = 7;
/**
 * Logo legibility rule: a logo should print at least 6 mm (0.6 cm) high. When
 * the usable height of the print area (inside the safe margin) is lower than
 * that, the target is that usable height. Below 75 % of the target (a wide
 * logo squeezed by the width) the form warns `logoSmall`; when the area itself
 * is lower than 6 mm it explains it (`zoneShort`).
 */
export const PEN_LOGO_MIN_MM = 6;
export const PEN_LOGO_SMALL_SHARE = 0.75;
/** Largest letters (the form does not shout on a long barrel). */
export const PEN_MAX_TEXT_PT = 20;
/** Line 2 size relative to line 1 when stacked. */
const LINE2_RATIO = 0.8;
/** Gap between stacked lines (share of line 1 size). */
const LINE_GAP_EM = 0.2;
/** Gap logo ↔ text and line 1 ↔ line 2 side by side (mm). */
const GAP_MM = 2;
const INK_EM: number = TEXT_ASCENT + TEXT_DESCENT;
const LINE_HEIGHT = 1.2;

export const PEN_FORM_IDS = { line1: "pf-line1", line2: "pf-line2", logo: "pf-logo" } as const;
export const PEN_FORM_TEMPLATE_ID = "pen-form";

export type PenFormWarning =
  | { code: "textSmall"; pt: number }
  | { code: "logoSmall"; mm: number; targetMm: number }
  | { code: "zoneShort"; zoneMm: number; usableMm: number }
  | { code: "inline" };

export interface PenFormLayout {
  layers: StudioLayer[];
  /** Smallest text size used (pt), null without text. */
  minPt: number | null;
  /** Printed logo height (mm), null without logo. */
  logoMm: number | null;
  warnings: PenFormWarning[];
}

type Area = Pick<StudioSurface, "widthMm" | "heightMm" | "safeMm">;

function textLayer(id: string, text: string, state: PenFormState, ink: string, sizeMm: number): StudioTextLayer {
  const font = PEN_FORM_FONTS.find((f) => f.family === state.font) ?? PEN_FORM_FONTS[0]!;
  return {
    id,
    kind: "text",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    text,
    fontFamily: font.family,
    bold: font.bold,
    sizePt: Math.max(2, Math.floor(mmToPt(sizeMm) * 10) / 10),
    color: ink,
    align: state.align,
    lineHeight: LINE_HEIGHT,
  };
}

/** Ink width per mm of font size (linear in the size): measured box minus its inner padding. */
function inkPerMm(l: StudioTextLayer, measure: MeasureText): number {
  const s: number = ptToMm(l.sizePt);
  return Math.max(0.01, (measure(l).w - 2 * TEXT_PAD * s) / s);
}

/** Place a single-line text layer so its ink box starts at `inkX` and is centred on `cy`. */
function placeText(l: StudioTextLayer, measure: MeasureText, inkX: number, cy: number): StudioTextLayer {
  const s: number = ptToMm(l.sizePt);
  const m = measure(l);
  return { ...l, x: inkX - TEXT_PAD * s, y: cy - m.h / 2, w: Math.max(0.5, m.w), h: Math.max(0.5, m.h) };
}

function inkWidth(l: StudioTextLayer, measure: MeasureText): number {
  return inkPerMm(l, measure) * ptToMm(l.sizePt);
}

function startX(align: PenAlign, x0: number, room: number, w: number): number {
  return align === "left" ? x0 : align === "right" ? x0 + room - w : x0 + (room - w) / 2;
}

/** The form laid out on the print area. `ink` = text colour (contrasting with the barrel). */
export function penFormLayout(area: Area, state: PenFormState, ink: string, measure: MeasureText): PenFormLayout {
  const safe: number = Math.max(0, area.safeMm);
  const x0: number = safe;
  const availW: number = Math.max(1, area.widthMm - 2 * safe);
  const availH: number = Math.max(0.5, area.heightMm - 2 * safe);
  const cy: number = area.heightMm / 2;
  const warnings: PenFormWarning[] = [];
  const t1: string = state.line1.trim();
  const t2: string = state.line2.trim();
  const texts: string[] = [t1, t2].filter(Boolean);

  // ─── Logo box (aspect kept, full usable height, at most 40 % of the width when there is text) ──
  let logo: StudioImageLayer | null = null;
  let logoW = 0;
  if (state.logo) {
    const ratio: number = state.logo.naturalW / state.logo.naturalH;
    let h: number = availH;
    let w: number = h * ratio;
    const maxW: number = texts.length ? availW * 0.4 : availW;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    logoW = w;
    logo = { id: PEN_FORM_IDS.logo, kind: "image", x: 0, y: cy - h / 2, w, h, rotation: 0, src: state.logo, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 } };
    const target: number = Math.min(PEN_LOGO_MIN_MM, availH);
    if (availH < PEN_LOGO_MIN_MM) warnings.push({ code: "zoneShort", zoneMm: area.heightMm, usableMm: availH });
    if (h < target * PEN_LOGO_SMALL_SHARE) warnings.push({ code: "logoSmall", mm: h, targetMm: target });
  }

  // ─── Text: largest size that fits the column ──────────────────────────
  const colW: number = Math.max(1, availW - (logo && texts.length ? logoW + GAP_MM : 0));
  const maxMm: number = ptToMm(PEN_MAX_TEXT_PT);
  let lines: StudioTextLayer[] = [];
  let inline = false;
  if (texts.length === 1) {
    const probe = textLayer(t1 ? PEN_FORM_IDS.line1 : PEN_FORM_IDS.line2, texts[0]!, state, ink, 3);
    const s: number = Math.min(maxMm, availH / INK_EM, colW / inkPerMm(probe, measure));
    lines = [textLayer(probe.id, texts[0]!, state, ink, s)];
  } else if (texts.length === 2) {
    const p1 = textLayer(PEN_FORM_IDS.line1, t1, state, ink, 3);
    const p2 = textLayer(PEN_FORM_IDS.line2, t2, state, ink, 3);
    const k1: number = inkPerMm(p1, measure);
    const k2: number = inkPerMm(p2, measure);
    // Stacked: line 1 at s, line 2 at 0.8 s.
    const sStack: number = Math.min(maxMm, availH / (INK_EM + LINE_GAP_EM + INK_EM * LINE2_RATIO), colW / k1, colW / (k2 * LINE2_RATIO));
    // Side by side: one size for both.
    const sRow: number = Math.min(maxMm, availH / INK_EM, Math.max(0.1, colW - GAP_MM) / (k1 + k2));
    inline = mmToPt(sStack * LINE2_RATIO) < PEN_MIN_TEXT_PT && sRow > sStack * LINE2_RATIO;
    lines = inline
      ? [textLayer(PEN_FORM_IDS.line1, t1, state, ink, sRow), textLayer(PEN_FORM_IDS.line2, t2, state, ink, sRow)]
      : [textLayer(PEN_FORM_IDS.line1, t1, state, ink, sStack), textLayer(PEN_FORM_IDS.line2, t2, state, ink, sStack * LINE2_RATIO)];
    if (inline) warnings.push({ code: "inline" });
  }

  // ─── Place the group (logo + text block) by the alignment ─────────────
  const widths: number[] = lines.map((l) => inkWidth(l, measure));
  const textW: number = lines.length === 0 ? 0 : inline ? widths[0]! + GAP_MM + widths[1]! : Math.max(...widths);
  const groupW: number = (logo ? logoW : 0) + (logo && lines.length ? GAP_MM : 0) + textW;
  const gx: number = startX(state.align, x0, availW, groupW);
  if (logo) logo = { ...logo, x: gx };
  const tx: number = gx + (logo && lines.length ? logoW + GAP_MM : 0);
  if (inline) {
    lines = [placeText(lines[0]!, measure, tx, cy), placeText(lines[1]!, measure, tx + widths[0]! + GAP_MM, cy)];
  } else if (lines.length === 1) {
    lines = [placeText(lines[0]!, measure, tx, cy)];
  } else if (lines.length === 2) {
    const s1: number = ptToMm(lines[0]!.sizePt);
    const s2: number = ptToMm(lines[1]!.sizePt);
    const inkH: number = INK_EM * s1 + LINE_GAP_EM * s1 + INK_EM * s2;
    const top: number = cy - inkH / 2;
    lines = lines.map((l, i) => {
      const lineCy: number = i === 0 ? top + (INK_EM * s1) / 2 : top + INK_EM * s1 + LINE_GAP_EM * s1 + (INK_EM * s2) / 2;
      // The ink box is centred in the layer box (`textInkBox`).
      return placeText(l, measure, startX(state.align, tx, textW, widths[i]!), lineCy);
    });
  }

  const minPt: number | null = lines.length ? Math.min(...lines.map((l) => l.sizePt)) : null;
  if (minPt != null && minPt < PEN_MIN_TEXT_PT) warnings.unshift({ code: "textSmall", pt: minPt });
  return { layers: [...(logo ? [logo] : []), ...lines], minPt, logoMm: logo ? logo.h : null, warnings };
}

/** The form as the document (first surface only; the pen background is never printed). */
export function penFormDoc(base: StudioDoc, layout: PenFormLayout): StudioDoc {
  return {
    ...base,
    templateId: PEN_FORM_TEMPLATE_ID,
    surfaces: base.surfaces.map((s, i) => (i === 0 ? { ...s, background: null, layers: layout.layers } : s)),
  };
}

/** Form fields back from a document the form made (null when it is not one). */
export function readPenForm(doc: StudioDoc): PenFormState | null {
  const s = doc.surfaces[0];
  if (!s || doc.templateId !== PEN_FORM_TEMPLATE_ID) return null;
  const byId = (id: string) => s.layers.find((l) => l.id === id);
  const l1 = byId(PEN_FORM_IDS.line1);
  const l2 = byId(PEN_FORM_IDS.line2);
  const lg = byId(PEN_FORM_IDS.logo);
  const first = l1?.kind === "text" ? l1 : l2?.kind === "text" ? l2 : null;
  return {
    line1: l1?.kind === "text" ? l1.text : "",
    line2: l2?.kind === "text" ? l2.text : "",
    font: first?.fontFamily ?? PEN_FORM_EMPTY.font,
    align: first?.align ?? PEN_FORM_EMPTY.align,
    logo: lg?.kind === "image" ? lg.src : null,
  };
}

/** Layers compared without volatile fields: did the advanced editor change what the form made? */
export function penFormSignature(doc: StudioDoc): string {
  const s = doc.surfaces[0];
  return JSON.stringify({ t: doc.templateId ?? null, bg: s?.background ?? null, l: s?.layers ?? [] });
}

/** True when the document has nothing on it yet, or the form made it and nothing else was added. */
export function isPenFormDoc(doc: StudioDoc): boolean {
  const s = doc.surfaces[0];
  if (!s) return true;
  if (s.layers.length === 0 && !s.background) return true;
  const ids: Set<string> = new Set(Object.values(PEN_FORM_IDS));
  return doc.templateId === PEN_FORM_TEMPLATE_ID && !s.background && s.layers.every((l) => ids.has(l.id));
}
