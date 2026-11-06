import type { SmartTextKey, StudioLayer, StudioSurface, StudioTextLayer } from "./document";
import { ptToMm } from "./document";
import type { StudioLocalized } from "./i18n";
import type { StudioColorFieldKey, StudioFields } from "./smartFields";
import { TEXT_FIT_MIN_PT, type MeasureText } from "./textFit";

/**
 * Flyer «flows»: a column of texts (headline, subheadline, a paragraph, a
 * list, the date) that WRAP to the column width and are laid out one under
 * the other after measuring — a long Romanian / Russian headline goes to two
 * or three lines and pushes the rest down; an empty optional field is left
 * out and the others close up; when the whole column does not fit its box,
 * every text in it shrinks a little (never under 7 pt). Pure (the text
 * measure is passed in; without one a rough estimate is used).
 *
 * The flow is kept on its text layers as a layer name
 * `flow:<group>:<anchor>:<top mm>:<bottom mm>:<gap mm>:<slot>:<list marker>` so the
 * layout can be redone after the customer types (no side table).
 */

export type FlowAnchor = "top" | "middle" | "bottom";

export interface TplFlowItem {
  /** «Datele tale» field the text shows. */
  bind?: SmartTextKey;
  /** Own text (sample when bound). */
  text?: StudioLocalized;
  /** Free-text slot (`slot:<id>`), rewritten in the short edit. */
  slot?: string;
  /** Font size, share of the shorter side of the file. */
  size: number;
  font: import("./templates").StudioTemplateFont;
  color: string;
  bindColor?: StudioColorFieldKey;
  bold?: boolean;
  italic?: boolean;
  ls?: number;
  /** Line height (× size), 1.15 by default. */
  lh?: number;
  /** Space above the text, share of the file height. */
  gap?: number;
  /** List marker for a multi-line field (`bullets`): every line starts with it. */
  list?: string;
  /** Kept (its sample shows) even when the customer typed other details and left it empty. */
  keep?: boolean;
}

export interface TplFlow {
  k: "flow";
  /** Left edge (align left), middle (center) or right edge (right) of the column, share of the width. */
  x: number;
  /** Top and height of the box the column lives in, shares of the height. */
  y: number;
  h: number;
  w: number;
  align?: "left" | "center" | "right";
  anchor?: FlowAnchor;
  items: TplFlowItem[];
  /** Dropped when the customer typed details and left this field empty. */
  showIf?: SmartTextKey;
}

export interface FlowMeta {
  group: string;
  anchor: FlowAnchor;
  top: number;
  bottom: number;
  gap: number;
  list: string | null;
  /** Free-text slot of the short edit. */
  slot?: string;
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export function flowName(m: FlowMeta): string {
  return `flow:${m.group}:${m.anchor}:${r1(m.top)}:${r1(m.bottom)}:${r1(m.gap)}:${m.slot ?? ""}:${m.list ?? ""}`.slice(0, 80);
}

export function parseFlowName(name: string | undefined): FlowMeta | null {
  if (!name?.startsWith("flow:")) return null;
  const p: string[] = name.split(":");
  if (p.length < 8) return null;
  const anchor = p[2] as FlowAnchor;
  const top = Number(p[3]);
  const bottom = Number(p[4]);
  const gap = Number(p[5]);
  if (!["top", "middle", "bottom"].includes(anchor) || ![top, bottom, gap].every(Number.isFinite)) return null;
  const slot: string = p[6]!;
  const list: string = p.slice(7).join(":");
  return { group: p[1]!, anchor, top, bottom, gap, list: list || null, ...(slot ? { slot } : {}) };
}

/** A list field as printed: one line per item, each with the marker (empty lines dropped). */
export function formatList(value: string, marker: string): string {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => `${marker} ${s}`)
    .join("\n");
}

/** The field value as a flow text shows it (a list: one marker per line). */
export function flowText(value: string, list: string | null | undefined): string {
  return list ? formatList(value, list) : value;
}

/** The customer typed this field. */
export function hasField(fields: StudioFields, k: SmartTextKey): boolean {
  return (fields[k]?.trim() ?? "") !== "";
}

// ─── Layout (after measuring) ───────────────────────────────────────────

/** Rough width of a text (mm) when no measure is passed: ~0.56 em per character. */
function estimate(l: StudioTextLayer): { w: number; h: number } {
  const size: number = ptToMm(l.sizePt);
  const lines: string[] = (l.text || " ").split("\n");
  const w: number = Math.max(...lines.map((s) => s.length)) * size * (l.bold ? 0.6 : 0.56) + size * 0.16;
  const h: number = (lines.length - 1) * size * l.lineHeight + size * 1.2 + size * 0.16;
  return { w, h };
}

/** Lines of one paragraph broken at spaces so each fits `width` (a single too-long word is left whole). */
function wrapParagraph(l: StudioTextLayer, para: string, width: number, m: MeasureText, hang: string): string[] {
  const words: string[] = para.split(/ +/).filter((w) => w !== "");
  if (words.length === 0) return [""];
  const out: string[] = [];
  let line: string = words[0]!;
  for (const w of words.slice(1)) {
    const tryLine = `${line} ${w}`;
    if (m({ ...l, text: tryLine }).w <= width) line = tryLine;
    else {
      out.push(line);
      line = `${hang}${w}`;
    }
  }
  out.push(line);
  return out;
}

/** The text broken into lines that fit the width (list items keep a hanging indent). */
export function wrapText(l: StudioTextLayer, width: number, m: MeasureText, list: string | null): string {
  const hang: string = list ? "  " : "";
  return l.text
    .split("\n")
    .flatMap((p) => wrapParagraph(l, p, width, m, hang))
    .join("\n");
}

/**
 * Every flow of the surface wrapped, measured and stacked inside its box.
 * Layers keep their order; only the flow texts move / change. Run on a
 * freshly drawn surface (the texts as typed, not already wrapped).
 */
export function layoutFlows(surface: StudioSurface, measure?: MeasureText): StudioSurface {
  const m: MeasureText = measure ?? estimate;
  const groups = new Map<string, number[]>();
  surface.layers.forEach((l, i) => {
    const meta = l.kind === "text" ? parseFlowName(l.name) : null;
    if (!meta) return;
    const g = groups.get(meta.group) ?? [];
    g.push(i);
    groups.set(meta.group, g);
  });
  if (groups.size === 0) return surface;
  const layers: StudioLayer[] = [...surface.layers];
  for (const idx of groups.values()) {
    const items = idx.map((i) => ({ i, l: layers[i] as StudioTextLayer, meta: parseFlowName(layers[i]!.name)! }));
    const box = { top: items[0]!.meta.top, bottom: items[0]!.meta.bottom, anchor: items[0]!.meta.anchor };
    const avail: number = Math.max(1, box.bottom - box.top);
    // Big texts (the headline) give way first: each round they shrink by up to 10 %, the small ones by a third of that.
    const maxPt: number = Math.max(...items.map((it) => it.l.sizePt));
    const scales: number[] = items.map(() => 1);
    let laid: StudioTextLayer[] = [];
    for (let attempt = 0; attempt < 16; attempt++) {
      laid = items.map(({ l, meta }, k) => {
        const sizePt: number = Math.max(TEXT_FIT_MIN_PT, Math.round(l.sizePt * scales[k]! * 10) / 10);
        const src: StudioTextLayer = { ...l, sizePt };
        const text: string = wrapText(src, l.w, m, meta.list);
        const got = m({ ...src, text });
        return { ...src, text, h: Math.max(0.5, got.h) };
      });
      // A single word wider than the column (a long Russian word in a big headline) shrinks that text first.
      const wide: number[] = laid.map((l) => Math.max(...l.text.split("\n").map((s) => m({ ...l, text: s }).w)));
      const over: boolean[] = wide.map((w, k) => w > laid[k]!.w + 0.01 && laid[k]!.sizePt > TEXT_FIT_MIN_PT);
      if (over.some(Boolean)) {
        over.forEach((o, k) => {
          if (o) scales[k] = scales[k]! * Math.max(0.6, (laid[k]!.w / wide[k]!) * 0.98);
        });
        continue;
      }
      const total: number = laid.reduce((a, l, k) => a + l.h + (k > 0 ? items[k]!.meta.gap : 0), 0);
      if (total <= avail + 0.01 || laid.every((l) => l.sizePt <= TEXT_FIT_MIN_PT)) break;
      const step: number = Math.max(0.9, Math.min(0.98, Math.sqrt(avail / total)));
      items.forEach((it, k) => {
        const big: boolean = it.l.sizePt >= maxPt * 0.6;
        scales[k] = scales[k]! * (big ? step : 1 - (1 - step) / 3);
      });
    }
    const total: number = laid.reduce((a, l, k) => a + l.h + (k > 0 ? items[k]!.meta.gap : 0), 0);
    let y: number = box.anchor === "top" ? box.top : box.anchor === "bottom" ? box.bottom - total : box.top + (avail - total) / 2;
    laid.forEach((l, k) => {
      if (k > 0) y += items[k]!.meta.gap;
      layers[items[k]!.i] = { ...l, y };
      y += l.h;
    });
  }
  return { ...surface, layers };
}
