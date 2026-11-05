"use client";

import { FONT_OPTIONS } from "@/lib/editor/editorPalette";
import {
  FONT_LOAD_TIMEOUT_MS,
  ensureFontsLoaded,
  ensureFontsLoadedForExport,
  fontLoadSpec,
  fontSampleKey,
  resolveCanvasFontFamily,
  type FontRequest,
} from "@/lib/editor/fontLoading";
import type { StudioDoc, StudioTextLayer } from "./document";
import { docTexts } from "./document";
import { measureTextBox } from "./render";
import { fitDocTexts, type TextBandMode } from "./textFit";

/**
 * Studio fonts: the editor fonts are `next/font` faces whose real family name
 * sits in a CSS variable on the page wrapper (`EDITOR_FONT_VARIABLE_CLASSES`).
 * Canvas text needs that name, and the face loaded first.
 */

const VAR_BY_FAMILY = new Map<string, string>(FONT_OPTIONS.map((f) => [f.family, f.cssVar]));
const resolved = new Map<string, string>();

function fontRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-studio-fonts]") ?? document.documentElement;
}

/** Canvas family name of a Studio font. */
export function resolveStudioFamily(family: string): string {
  const hit = resolved.get(family);
  if (hit) return hit;
  const root = fontRoot();
  if (!root) return family;
  const style = getComputedStyle(root);
  const name: string = resolveCanvasFontFamily(family, VAR_BY_FAMILY.get(family), (v) => style.getPropertyValue(v));
  if (name !== family || !VAR_BY_FAMILY.has(family)) resolved.set(family, name);
  return name;
}

function requestOf(l: Pick<StudioTextLayer, "fontFamily" | "bold" | "italic">): FontRequest {
  return { family: resolveStudioFamily(l.fontFamily), weight: l.bold ? 700 : 400, style: l.italic ? "italic" : "normal" };
}

/**
 * Load the faces of these text layers (editor: redraw when it resolves).
 * The shared loader remembers what it loaded; a face the browser no longer
 * has ready (its `@font-face` re-created when the page refreshed, e.g. after
 * the language switch) is loaded again here instead of trusting that memory.
 */
export async function loadTextFonts(layers: readonly StudioTextLayer[]): Promise<boolean> {
  const text: string = layers.map((l) => l.text).join("");
  const requests: FontRequest[] = layers.map(requestOf);
  const ok: boolean = await ensureFontsLoaded(requests, { text });
  const set = typeof document !== "undefined" ? document.fonts : undefined;
  if (!set) return ok;
  const sample: string = fontSampleKey(text);
  const stale: string[] = [...new Set(requests.map((r) => fontLoadSpec(r)))].filter((spec) => {
    try {
      return !set.check(spec, sample);
    } catch {
      return false;
    }
  });
  if (stale.length === 0) return ok;
  const loaded = await Promise.race([
    Promise.all(stale.map((spec) => set.load(spec, sample).catch(() => []))).then((r) => r.every((faces) => faces.length > 0)),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FONT_LOAD_TIMEOUT_MS)),
  ]);
  return loaded;
}

/**
 * Calls `fn` whenever the browser finished loading font files (a face that
 * came late, after a timeout or a page refresh): canvases drawn with a
 * fallback redraw then. Returns the unsubscribe.
 */
export function onStudioFontsLoaded(fn: () => void): () => void {
  const set = typeof document !== "undefined" ? document.fonts : undefined;
  if (!set || typeof set.addEventListener !== "function") return () => undefined;
  const on = () => fn();
  set.addEventListener("loadingdone", on);
  return () => set.removeEventListener("loadingdone", on);
}

/** Export-grade wait for every face the document draws. */
export async function prepareStudioFonts(doc: StudioDoc): Promise<boolean> {
  const texts = docTexts(doc);
  const ok: boolean = await ensureFontsLoadedForExport(texts.map(requestOf), { text: texts.map((t) => t.text).join("") });
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  }
  return ok;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Box size (mm) of a text layer for its current text and style. */
export function measureText(layer: StudioTextLayer): { w: number; h: number } {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return { w: layer.w, h: layer.h };
  return measureTextBox(measureCtx, layer, resolveStudioFamily);
}

/** The layer with its box re-measured, kept centred where it was. */
export function fitTextBox(layer: StudioTextLayer): StudioTextLayer {
  const m = measureText(layer);
  if (Math.abs(m.w - layer.w) < 0.01 && Math.abs(m.h - layer.h) < 0.01) return layer;
  const cx: number = layer.x + layer.w / 2;
  const cy: number = layer.y + layer.h / 2;
  return { ...layer, x: cx - m.w / 2, y: cy - m.h / 2, w: Math.max(0.5, m.w), h: Math.max(0.5, m.h) };
}

/**
 * Every text box of the document re-measured (after fonts load); same object
 * when nothing changed. `band`: template / bound texts that got wider than
 * their box shrink to fit it (see textFit.ts).
 */
export function fitAllTextBoxes(doc: StudioDoc, band: TextBandMode = "none"): StudioDoc {
  return fitDocTexts(doc, measureText, band);
}
