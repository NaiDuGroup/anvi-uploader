/**
 * Physical shape of a mug for the 3D preview: the body is built from these
 * sizes (no GLB per mug), the handle is one of a few styles.
 *
 * Browser-safe: shared by the catalog API, order snapshots and the 3D previews.
 */

export const MUG_HANDLE_STYLES = ["classic", "heart", "none"] as const;
export type MugHandleStyle = (typeof MUG_HANDLE_STYLES)[number];

export type MugShape = {
  bodyHeightCm: number;
  topDiameterCm: number;
  bottomDiameterCm: number;
  handleStyle: MugHandleStyle;
};

/** Standard 11 oz (320–350 ml) sublimation mug. */
export const MUG_SHAPE_DEFAULTS: MugShape = {
  bodyHeightCm: 9.6,
  topDiameterCm: 8.2,
  bottomDiameterCm: 8.2,
  handleStyle: "classic",
};

export const MUG_SHAPE_LIMITS = { minCm: 4, maxCm: 30 } as const;

export type MugShapePresetKey = "std330" | "tall450" | "conical" | "enamel" | "tumbler";
export type MugShapePreset = { key: MugShapePresetKey; shape: MugShape };

/** Quick picks in the admin form; any size can still be typed in. */
export const MUG_SHAPE_PRESETS: readonly MugShapePreset[] = [
  { key: "std330", shape: MUG_SHAPE_DEFAULTS },
  {
    key: "tall450",
    shape: { bodyHeightCm: 12, topDiameterCm: 8.7, bottomDiameterCm: 8.7, handleStyle: "classic" },
  },
  {
    key: "conical",
    shape: { bodyHeightCm: 11.5, topDiameterCm: 9, bottomDiameterCm: 6.5, handleStyle: "classic" },
  },
  {
    key: "enamel",
    shape: { bodyHeightCm: 8, topDiameterCm: 8.5, bottomDiameterCm: 8.5, handleStyle: "classic" },
  },
  {
    key: "tumbler",
    shape: { bodyHeightCm: 17, topDiameterCm: 7.5, bottomDiameterCm: 6.8, handleStyle: "none" },
  },
];

export function isMugHandleStyle(v: unknown): v is MugHandleStyle {
  return typeof v === "string" && (MUG_HANDLE_STYLES as readonly string[]).includes(v);
}

function cm(v: unknown, fallback: number): number {
  const n: number = typeof v === "string" ? Number(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(MUG_SHAPE_LIMITS.maxCm, Math.max(MUG_SHAPE_LIMITS.minCm, Math.round(n * 10) / 10));
}

/** Read shape fields from any loose object (item attributes, order snapshot). */
export function parseMugShape(raw: unknown): MugShape {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = MUG_SHAPE_DEFAULTS;
  return {
    bodyHeightCm: cm(r.bodyHeightCm, d.bodyHeightCm),
    topDiameterCm: cm(r.topDiameterCm, d.topDiameterCm),
    bottomDiameterCm: cm(r.bottomDiameterCm, d.bottomDiameterCm),
    handleStyle: isMugHandleStyle(r.handleStyle) ? r.handleStyle : d.handleStyle,
  };
}
