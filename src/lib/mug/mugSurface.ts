/**
 * How a mug's outside looks in the 3D preview, on top of the plain part colours:
 * surface finish plus an optional colour band fading up from the bottom
 * (e.g. NEVEX mugs: white body, coloured base).
 *
 * Browser-safe: shared by the catalog API, order snapshots and the 3D previews.
 */

export const MUG_FINISHES = ["glossy", "matte", "metallic", "glitter", "marble"] as const;
export type MugFinish = (typeof MUG_FINISHES)[number];

export const MUG_FINISH_LABELS_RU: Record<MugFinish, string> = {
  glossy: "Глянец",
  matte: "Мат",
  metallic: "Металлик",
  glitter: "Блёстки",
  marble: "Мрамор",
};

export type MugSurface = {
  finish: MugFinish;
  /** Colour at the very bottom of the body; null = no gradient. */
  gradientColorHex: string | null;
  /** How far up the body the colour fades out, in % of the body height (5–100). */
  gradientHeightPct: number;
};

export const MUG_SURFACE_DEFAULTS: MugSurface = {
  finish: "glossy",
  gradientColorHex: null,
  gradientHeightPct: 30,
};

export const MUG_GRADIENT_HEIGHT_MIN = 5;
export const MUG_GRADIENT_HEIGHT_MAX = 100;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isMugFinish(v: unknown): v is MugFinish {
  return typeof v === "string" && (MUG_FINISHES as readonly string[]).includes(v);
}

export function clampGradientHeightPct(v: number): number {
  return Math.min(MUG_GRADIENT_HEIGHT_MAX, Math.max(MUG_GRADIENT_HEIGHT_MIN, Math.round(v)));
}

/** Read surface fields from any loose object (item attributes, order snapshot). */
export function parseMugSurface(raw: unknown): MugSurface {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pct: number = typeof r.gradientHeightPct === "string" ? Number(r.gradientHeightPct) : (r.gradientHeightPct as number);
  return {
    finish: isMugFinish(r.finish) ? r.finish : MUG_SURFACE_DEFAULTS.finish,
    gradientColorHex:
      typeof r.gradientColorHex === "string" && HEX_RE.test(r.gradientColorHex) ? r.gradientColorHex : null,
    gradientHeightPct:
      typeof pct === "number" && Number.isFinite(pct)
        ? clampGradientHeightPct(pct)
        : MUG_SURFACE_DEFAULTS.gradientHeightPct,
  };
}
