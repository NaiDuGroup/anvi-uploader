import { z } from "zod";

/**
 * ANVI Studio design document: one JSON for every product, in millimetres
 * relative to the print area of each surface (mug wrap, notebook cover, pen
 * barrel). Layers are drawn bottom → top. Pure and client/server safe: the
 * editor, autosave, the print export and the checkout share it.
 *
 * Geometry of a layer: `x`, `y` are the top-left corner of its unrotated box,
 * `w` × `h` its size; `rotation` (degrees, clockwise) turns it around the
 * box centre. Text size is in typographic points (1 pt = 0.3528 mm), so it
 * prints at the same physical size on any product.
 */

export const STUDIO_DOC_VERSION = 1 as const;
export const STUDIO_KINDS = ["mug", "notebook", "pen"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const MM_PER_PT = 25.4 / 72;
export const MM_PER_INCH = 25.4;

export const SMART_FIELD_KEYS = [
  "name",
  "title",
  "company",
  "phone",
  "email",
  "site",
  "address",
  "logo",
  "brandColor1",
  "brandColor2",
  "brandColor3",
] as const;
export type SmartFieldKey = (typeof SMART_FIELD_KEYS)[number];
/** Text-bearing smart fields (logo and colours are bound differently). */
export type SmartTextKey = Exclude<SmartFieldKey, "logo" | "brandColor1" | "brandColor2" | "brandColor3">;

export const STUDIO_LIMITS = {
  layers: 60,
  text: 400,
  surfaceMm: 2000,
  /** Serialized document (autosave / checkout), bytes. */
  docBytes: 120_000,
} as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const mm = num(-STUDIO_LIMITS.surfaceMm, STUDIO_LIMITS.surfaceMm);
const sizeMm = num(0.1, STUDIO_LIMITS.surfaceMm);

const layerBase = {
  id: z.string().min(1).max(40),
  x: mm,
  y: mm,
  w: sizeMm,
  h: sizeMm,
  rotation: num(-3600, 3600).default(0),
  opacity: num(0, 1).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  name: z.string().max(80).optional(),
};

export const studioTextLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("text"),
  text: z.string().max(STUDIO_LIMITS.text),
  fontFamily: z.string().min(1).max(60),
  bold: z.boolean().default(true),
  italic: z.boolean().optional(),
  sizePt: num(2, 600),
  color: hex,
  align: z.enum(["left", "center", "right"]).default("center"),
  lineHeight: num(0.6, 3).default(1.2),
  letterSpacingEm: num(-0.2, 1).optional(),
  /** Arc bend in degrees of the circle the baseline follows: 0 straight, + arches up (∩), − down (∪). */
  arcDeg: num(-330, 330).optional(),
  stroke: z.object({ color: hex, widthMm: num(0.05, 5) }).optional(),
  shadow: z.object({ color: hex, blurMm: num(0, 10), dxMm: num(-20, 20), dyMm: num(-20, 20) }).optional(),
  /** Smart field this text shows («Datele mele»). */
  bind: z.enum(SMART_FIELD_KEYS).optional(),
  /** Template sample text the customer has not replaced yet (quality: empty placeholder). */
  placeholder: z.boolean().optional(),
});

export const studioImageSrcSchema = z.object({
  /** Upload key (`uploads/…`) once uploaded; absent while only local. */
  key: z.string().max(500).optional(),
  /** Local blob id (IndexedDB) of the original. */
  localId: z.string().max(80).optional(),
  naturalW: num(1, 100_000),
  naturalH: num(1, 100_000),
  mime: z.string().max(40).optional(),
});

export const studioImageLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("image"),
  /** null = empty photo placeholder («Adaugă fotografia»). */
  src: studioImageSrcSchema.nullable(),
  mask: z.enum(["rect", "rounded", "circle", "heart"]).default("rect"),
  /** Zoom over «cover» (≥ 1) and centre offset as a share of the overflow (−1…1). */
  crop: z.object({ zoom: num(1, 10), ox: num(-1, 1), oy: num(-1, 1) }).default({ zoom: 1, ox: 0, oy: 0 }),
  frame: z.object({ color: hex, widthMm: num(0.1, 20) }).optional(),
  bind: z.literal("logo").optional(),
});

export const studioShapeLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("shape"),
  shape: z.enum(["rect", "rounded", "ellipse", "line", "triangle", "star", "heart", "snowflake", "balloon", "tree"]),
  fill: hex.nullable(),
  stroke: hex.nullable().optional(),
  strokeMm: num(0, 20).optional(),
  /** Brand colour this shape takes («Datele mele»). */
  bindColor: z.enum(["brandColor1", "brandColor2", "brandColor3"]).optional(),
});

export const QR_TYPES = ["url", "tel", "wifi", "vcard"] as const;
export type StudioQrType = (typeof QR_TYPES)[number];

export const studioQrLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("qr"),
  qr: z.object({
    type: z.enum(QR_TYPES),
    /** Type-specific fields (url / phone / ssid+password+security / vCard fields). */
    data: z.record(z.string().max(40), z.string().max(300)),
  }),
  color: hex,
  background: hex.nullable(),
});

export const studioLayerSchema = z.discriminatedUnion("kind", [
  studioTextLayerSchema,
  studioImageLayerSchema,
  studioShapeLayerSchema,
  studioQrLayerSchema,
]);

export const studioSurfaceSchema = z.object({
  id: z.string().min(1).max(30),
  /** Print area (trim size), mm. */
  widthMm: sizeMm,
  heightMm: sizeMm,
  bleedMm: num(0, 20).default(0),
  safeMm: num(0, 50).default(3),
  background: hex.nullable().default(null),
  layers: z.array(studioLayerSchema).max(STUDIO_LIMITS.layers),
});

export const studioDocSchema = z.object({
  v: z.literal(STUDIO_DOC_VERSION),
  id: z.string().min(1).max(60),
  kind: z.enum(STUDIO_KINDS),
  templateId: z.string().max(80).nullable().default(null),
  surfaces: z.array(studioSurfaceSchema).min(1).max(4),
  updatedAt: z.number().int().nonnegative().default(0),
});

export type StudioTextLayer = z.infer<typeof studioTextLayerSchema>;
export type StudioImageSrc = z.infer<typeof studioImageSrcSchema>;
export type StudioImageLayer = z.infer<typeof studioImageLayerSchema>;
export type StudioShapeLayer = z.infer<typeof studioShapeLayerSchema>;
export type StudioQrLayer = z.infer<typeof studioQrLayerSchema>;
export type StudioLayer = z.infer<typeof studioLayerSchema>;
export type StudioLayerKind = StudioLayer["kind"];
export type StudioSurface = z.infer<typeof studioSurfaceSchema>;
export type StudioDoc = z.infer<typeof studioDocSchema>;

export function isStudioKind(v: unknown): v is StudioKind {
  return v === "mug" || v === "notebook" || v === "pen";
}

/** A stored document (autosave, cart, checkout); null when malformed or too big. */
export function parseStudioDoc(v: unknown): StudioDoc | null {
  const r = studioDocSchema.safeParse(v);
  if (!r.success) return null;
  if (JSON.stringify(r.data).length > STUDIO_LIMITS.docBytes) return null;
  return r.data;
}

let idSeq = 0;
/** Short random id for layers / documents. */
export function studioId(prefix = "l"): string {
  idSeq = (idSeq + 1) % 1_000_000;
  const rnd: string =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}${rnd}${idSeq.toString(36)}`;
}

/** Empty document for a product's surfaces. */
export function emptyStudioDoc(kind: StudioKind, surfaces: readonly Omit<StudioSurface, "layers">[]): StudioDoc {
  return {
    v: STUDIO_DOC_VERSION,
    id: studioId("d"),
    kind,
    templateId: null,
    surfaces: surfaces.map((s) => ({ ...s, layers: [] })),
    updatedAt: 0,
  };
}

// ─── Geometry helpers ─────────────────────────────────────────────────────

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}
export function mmToPt(mm: number): number {
  return mm / MM_PER_PT;
}
export function mmToPx(mmv: number, dpi: number): number {
  return (mmv / MM_PER_INCH) * dpi;
}
export function pxToMm(px: number, dpi: number): number {
  return (px * MM_PER_INCH) / dpi;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounds of a (rotated) layer box, mm. */
export function layerBounds(l: Pick<StudioLayer, "x" | "y" | "w" | "h" | "rotation">): Rect {
  const rot: number = ((l.rotation ?? 0) * Math.PI) / 180;
  if (Math.abs(Math.sin(rot)) < 1e-9) return { x: l.x, y: l.y, w: l.w, h: l.h };
  const cx: number = l.x + l.w / 2;
  const cy: number = l.y + l.h / 2;
  const c: number = Math.abs(Math.cos(rot));
  const s: number = Math.abs(Math.sin(rot));
  const bw: number = l.w * c + l.h * s;
  const bh: number = l.w * s + l.h * c;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Where an image is drawn inside its box (mm, box-local): «cover» scaled by
 * `zoom`, moved by the crop offset, always covering the box.
 */
export function imageDrawRect(layer: Pick<StudioImageLayer, "w" | "h" | "crop">, naturalW: number, naturalH: number): Rect {
  const cover: number = Math.max(layer.w / naturalW, layer.h / naturalH);
  const s: number = cover * Math.max(1, layer.crop.zoom);
  const dw: number = naturalW * s;
  const dh: number = naturalH * s;
  const overX: number = (dw - layer.w) / 2;
  const overY: number = (dh - layer.h) / 2;
  return {
    x: (layer.w - dw) / 2 + layer.crop.ox * overX,
    y: (layer.h - dh) / 2 + layer.crop.oy * overY,
    w: dw,
    h: dh,
  };
}

/** Effective print resolution of an image layer (pixels per inch of the drawn photo). */
export function imageEffectiveDpi(layer: Pick<StudioImageLayer, "w" | "h" | "crop" | "src">): number | null {
  if (!layer.src) return null;
  const r: Rect = imageDrawRect(layer, layer.src.naturalW, layer.src.naturalH);
  return layer.src.naturalW / (r.w / MM_PER_INCH);
}

/** Crop offsets that keep the image covering the box after a drag of (dxMm, dyMm). */
export function panCrop(
  layer: Pick<StudioImageLayer, "w" | "h" | "crop">,
  naturalW: number,
  naturalH: number,
  dxMm: number,
  dyMm: number,
): StudioImageLayer["crop"] {
  const r: Rect = imageDrawRect(layer, naturalW, naturalH);
  const overX: number = (r.w - layer.w) / 2;
  const overY: number = (r.h - layer.h) / 2;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    zoom: layer.crop.zoom,
    ox: overX > 1e-6 ? clamp(layer.crop.ox + dxMm / overX) : 0,
    oy: overY > 1e-6 ? clamp(layer.crop.oy + dyMm / overY) : 0,
  };
}

// ─── Document edits (pure, return new documents) ─────────────────────────

export function surfaceOf(doc: StudioDoc, surfaceId?: string | null): StudioSurface {
  return doc.surfaces.find((s) => s.id === surfaceId) ?? doc.surfaces[0]!;
}

export function mapSurface(doc: StudioDoc, surfaceId: string, fn: (s: StudioSurface) => StudioSurface): StudioDoc {
  return { ...doc, surfaces: doc.surfaces.map((s) => (s.id === surfaceId ? fn(s) : s)) };
}

export function updateLayer(doc: StudioDoc, layerId: string, patch: Partial<StudioLayer>): StudioDoc {
  return {
    ...doc,
    surfaces: doc.surfaces.map((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch, kind: l.kind, id: l.id } as StudioLayer) : l)),
    })),
  };
}

export function addLayer(doc: StudioDoc, surfaceId: string, layer: StudioLayer): StudioDoc {
  return mapSurface(doc, surfaceId, (s) =>
    s.layers.length >= STUDIO_LIMITS.layers ? s : { ...s, layers: [...s.layers, layer] },
  );
}

export function removeLayer(doc: StudioDoc, layerId: string): StudioDoc {
  return { ...doc, surfaces: doc.surfaces.map((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== layerId) })) };
}

/** Move a layer up (+1, towards the front) or down (−1); `"top"` / `"bottom"` jump to the end. */
export function reorderLayer(doc: StudioDoc, layerId: string, to: 1 | -1 | "top" | "bottom"): StudioDoc {
  return {
    ...doc,
    surfaces: doc.surfaces.map((s) => {
      const i: number = s.layers.findIndex((l) => l.id === layerId);
      if (i < 0) return s;
      const layers = [...s.layers];
      const [l] = layers.splice(i, 1);
      const j: number =
        to === "top" ? layers.length : to === "bottom" ? 0 : Math.max(0, Math.min(layers.length, i + to));
      layers.splice(j, 0, l!);
      return { ...s, layers };
    }),
  };
}

export function duplicateLayer(doc: StudioDoc, layerId: string, offsetMm = 3): StudioDoc {
  for (const s of doc.surfaces) {
    const i: number = s.layers.findIndex((l) => l.id === layerId);
    if (i < 0) continue;
    const src = s.layers[i]!;
    const copy = { ...src, id: studioId(), x: src.x + offsetMm, y: src.y + offsetMm, locked: false } as StudioLayer;
    return mapSurface(doc, s.id, (sf) => {
      const layers = [...sf.layers];
      layers.splice(i + 1, 0, copy);
      return { ...sf, layers };
    });
  }
  return doc;
}

export function findLayer(doc: StudioDoc, layerId: string | null | undefined): StudioLayer | null {
  if (!layerId) return null;
  for (const s of doc.surfaces) for (const l of s.layers) if (l.id === layerId) return l;
  return null;
}

/** Every text in the document (fonts to load, legacy caption). */
export function docTexts(doc: StudioDoc): StudioTextLayer[] {
  return doc.surfaces.flatMap((s) => s.layers.filter((l): l is StudioTextLayer => l.kind === "text" && !l.hidden));
}

export function docImages(doc: StudioDoc): StudioImageLayer[] {
  return doc.surfaces.flatMap((s) => s.layers.filter((l): l is StudioImageLayer => l.kind === "image"));
}

/** Change the print area (another size of the same product): layers scale with it. */
export function fitDocToSurfaces(doc: StudioDoc, surfaces: readonly Omit<StudioSurface, "layers">[]): StudioDoc {
  return {
    ...doc,
    surfaces: surfaces.map((target, i) => {
      const src: StudioSurface | undefined = doc.surfaces.find((s) => s.id === target.id) ?? doc.surfaces[i];
      if (!src) return { ...target, layers: [] };
      return {
        ...target,
        background: src.background,
        layers: src.layers.map((l) => scaleLayer(l, src, target)),
      };
    }),
  };
}

/**
 * A layer moved onto another surface size: positions follow the area
 * proportionally, sizes scale uniformly (by the smaller ratio) so text and
 * photos keep their shape, centred where they were.
 */
export function scaleLayer(l: StudioLayer, from: Pick<StudioSurface, "widthMm" | "heightMm">, to: Pick<StudioSurface, "widthMm" | "heightMm">): StudioLayer {
  const sx: number = to.widthMm / from.widthMm;
  const sy: number = to.heightMm / from.heightMm;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return l;
  const k: number = Math.min(sx, sy);
  const cx: number = (l.x + l.w / 2) * sx;
  const cy: number = (l.y + l.h / 2) * sy;
  const w: number = l.w * k;
  const h: number = l.h * k;
  const base = { ...l, x: cx - w / 2, y: cy - h / 2, w, h };
  if (l.kind === "text") {
    return {
      ...base,
      kind: "text",
      sizePt: Math.max(2, l.sizePt * k),
      ...(l.stroke ? { stroke: { ...l.stroke, widthMm: Math.max(0.05, l.stroke.widthMm * k) } } : {}),
    } as StudioTextLayer;
  }
  return base as StudioLayer;
}
