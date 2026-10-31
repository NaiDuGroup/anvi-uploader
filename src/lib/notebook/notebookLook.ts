/**
 * Physical look of a notebook for the 3D preview: the model is built from
 * these fields (no GLB per notebook). Stored flat in `StockItem.attributes`
 * next to the colours, and frozen into the order snapshot.
 *
 * Browser-safe: shared by the catalog API, order snapshots and the 3D previews.
 */
import { z } from "zod";

export const NOTEBOOK_BINDINGS = ["hardcover", "spiral"] as const;
export type NotebookBinding = (typeof NOTEBOOK_BINDINGS)[number];

/** leather: imitation-leather sheen; matte: cardboard / paper cover. */
export const NOTEBOOK_FINISHES = ["leather", "matte"] as const;
export type NotebookFinish = (typeof NOTEBOOK_FINISHES)[number];

/** A second material on the front cover: lower part (Iris cork) or a strip at the binding (Renat). */
export const NOTEBOOK_ACCENTS = ["none", "bottom", "spine"] as const;
export type NotebookAccent = (typeof NOTEBOOK_ACCENTS)[number];

export const NOTEBOOK_ACCENT_TEXTURES = ["plain", "cork"] as const;
export type NotebookAccentTexture = (typeof NOTEBOOK_ACCENT_TEXTURES)[number];

export type NotebookLook = {
  /** Cover size, portrait: width across, height along the binding. */
  widthCm: number;
  heightCm: number;
  thicknessCm: number;
  binding: NotebookBinding;
  finish: NotebookFinish;
  hasStrap: boolean;
  hasBookmark: boolean;
  hasPen: boolean;
  wireColorHex: string;
  penColorHex: string;
  accent: NotebookAccent;
  accentColorHex: string;
  /** Share of the cover the accent takes (height for «bottom», width for «spine»). */
  accentSharePct: number;
  accentTexture: NotebookAccentTexture;
};

/** The legacy A5 hardcover with elastic and ribbon (the old GLB). */
export const NOTEBOOK_LOOK_DEFAULTS: NotebookLook = {
  widthCm: 14,
  heightCm: 21,
  thicknessCm: 1.6,
  binding: "hardcover",
  finish: "leather",
  hasStrap: true,
  hasBookmark: true,
  hasPen: false,
  wireColorHex: "#c8c8c8",
  penColorHex: "#1f1f1f",
  accent: "none",
  accentColorHex: "#b98a5a",
  accentSharePct: 45,
  accentTexture: "cork",
};

export const NOTEBOOK_LOOK_LIMITS = {
  minCm: 5,
  maxCm: 40,
  minThicknessCm: 0.3,
  maxThicknessCm: 6,
  minAccentPct: 5,
  maxAccentPct: 90,
} as const;

export const NOTEBOOK_LOOK_KEYS = Object.keys(NOTEBOOK_LOOK_DEFAULTS) as (keyof NotebookLook)[];

export type NotebookLookPresetKey = "a5Hard" | "a6Hard" | "a5Spiral" | "spiralPen";
export type NotebookLookPreset = { key: NotebookLookPresetKey; look: Partial<NotebookLook> };

/** Quick picks in the admin form; any size can still be typed in. */
export const NOTEBOOK_LOOK_PRESETS: readonly NotebookLookPreset[] = [
  {
    key: "a5Hard",
    look: { widthCm: 14, heightCm: 21, thicknessCm: 1.6, binding: "hardcover", finish: "leather", hasStrap: true, hasBookmark: true, hasPen: false },
  },
  {
    key: "a6Hard",
    look: { widthCm: 9.3, heightCm: 14.3, thicknessCm: 1.5, binding: "hardcover", finish: "leather", hasStrap: true, hasBookmark: true, hasPen: false },
  },
  {
    key: "a5Spiral",
    look: { widthCm: 15, heightCm: 21, thicknessCm: 1.2, binding: "spiral", finish: "matte", hasStrap: false, hasBookmark: false, hasPen: false },
  },
  {
    key: "spiralPen",
    look: { widthCm: 15, heightCm: 18.2, thicknessCm: 1.9, binding: "spiral", finish: "matte", hasStrap: false, hasBookmark: false, hasPen: true },
  },
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function num(v: unknown): number | null {
  const n: number = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function clampRound(v: unknown, min: number, max: number, fallback: number): number {
  const n = num(v);
  if (n == null) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Read look fields from any loose object (item attributes, order snapshot). */
export function parseNotebookLook(raw: unknown): NotebookLook {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = NOTEBOOK_LOOK_DEFAULTS;
  const L = NOTEBOOK_LOOK_LIMITS;
  const bool = (v: unknown, f: boolean) => (typeof v === "boolean" ? v : f);
  const hex = (v: unknown, f: string) => (typeof v === "string" && HEX_RE.test(v) ? v.toLowerCase() : f);
  return {
    widthCm: clampRound(r.widthCm, L.minCm, L.maxCm, d.widthCm),
    heightCm: clampRound(r.heightCm, L.minCm, L.maxCm, d.heightCm),
    thicknessCm: clampRound(r.thicknessCm, L.minThicknessCm, L.maxThicknessCm, d.thicknessCm),
    binding: oneOf(NOTEBOOK_BINDINGS, r.binding, d.binding),
    finish: oneOf(NOTEBOOK_FINISHES, r.finish, d.finish),
    hasStrap: bool(r.hasStrap, d.hasStrap),
    hasBookmark: bool(r.hasBookmark, d.hasBookmark),
    hasPen: bool(r.hasPen, d.hasPen),
    wireColorHex: hex(r.wireColorHex, d.wireColorHex),
    penColorHex: hex(r.penColorHex, d.penColorHex),
    accent: oneOf(NOTEBOOK_ACCENTS, r.accent, d.accent),
    accentColorHex: hex(r.accentColorHex, d.accentColorHex),
    accentSharePct: Math.round(clampRound(r.accentSharePct, L.minAccentPct, L.maxAccentPct, d.accentSharePct)),
    accentTexture: oneOf(NOTEBOOK_ACCENT_TEXTURES, r.accentTexture, d.accentTexture),
  };
}

/** Look fields as a plain JSON object (attributes / snapshot). */
export function notebookLookJson(l: NotebookLook): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of NOTEBOOK_LOOK_KEYS) out[k] = l[k];
  return out;
}

const hexSchema = z.string().regex(HEX_RE);
const L = NOTEBOOK_LOOK_LIMITS;

/** Optional look fields for API bodies and order snapshots. */
export const notebookLookPartialSchema = z.object({
  widthCm: z.number().min(L.minCm).max(L.maxCm).optional(),
  heightCm: z.number().min(L.minCm).max(L.maxCm).optional(),
  thicknessCm: z.number().min(L.minThicknessCm).max(L.maxThicknessCm).optional(),
  binding: z.enum(NOTEBOOK_BINDINGS).optional(),
  finish: z.enum(NOTEBOOK_FINISHES).optional(),
  hasStrap: z.boolean().optional(),
  hasBookmark: z.boolean().optional(),
  hasPen: z.boolean().optional(),
  wireColorHex: hexSchema.optional(),
  penColorHex: hexSchema.optional(),
  accent: z.enum(NOTEBOOK_ACCENTS).optional(),
  accentColorHex: hexSchema.optional(),
  accentSharePct: z.number().min(L.minAccentPct).max(L.maxAccentPct).optional(),
  accentTexture: z.enum(NOTEBOOK_ACCENT_TEXTURES).optional(),
});

/**
 * Print area that fits the cover face: the accent zone and the spiral's hole
 * margin are left out (cm, rounded to 0.1).
 */
export function notebookPrintableArea(l: NotebookLook): { widthCm: number; heightCm: number } {
  let w = l.widthCm;
  let h = l.heightCm;
  if (l.binding === "spiral") w -= SPIRAL_HOLE_MARGIN_CM;
  if (l.accent === "bottom") h *= 1 - l.accentSharePct / 100;
  if (l.accent === "spine") w -= l.widthCm * (l.accentSharePct / 100);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { widthCm: r(Math.max(1, w)), heightCm: r(Math.max(1, h)) };
}

/** Holes and wire take this much of the cover next to a spiral binding (cm). */
export const SPIRAL_HOLE_MARGIN_CM = 1.2;

/** Only the look fields that are set (for API bodies). */
export function pickNotebookLook(o: Record<string, unknown>): Partial<NotebookLook> {
  const out: Record<string, unknown> = {};
  for (const k of NOTEBOOK_LOOK_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out as Partial<NotebookLook>;
}
