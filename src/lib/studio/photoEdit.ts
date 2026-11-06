import { z } from "zod";

/**
 * Photo adjustments (Vistaprint-like «Ajustează»): turn 90° / mirror,
 * brightness, contrast, saturation, a one-tap filter, auto-levels and a mild
 * sharpen from «Auto-îmbunătățire». Stored as numbers on the photo source
 * (`src.edit`), never baked into the upload: the original file is kept, and
 * every output (editor, thumbnails, 3D, verify, the 300 dpi print PNG) runs
 * this same pixel math through `render.ts`. Pure (no DOM): the math works on
 * RGBA arrays.
 *
 * Old designs have no `edit`: the photo draws exactly as before.
 */

export const PHOTO_FILTERS = ["none", "bw", "sepia", "warm", "cool", "vivid"] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];

const level = z.number().int().min(0).max(255);
const slider = z.number().finite().min(-100).max(100);

export const photoEditSchema = z.object({
  /** Clockwise quarter turns of the photo inside its frame. */
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  brightness: slider.optional(),
  contrast: slider.optional(),
  saturation: slider.optional(),
  filter: z.enum(PHOTO_FILTERS).optional(),
  /** Auto levels (per channel black / white points, 0–255), set by «Auto-îmbunătățire». */
  levels: z.object({ lo: z.tuple([level, level, level]), hi: z.tuple([level, level, level]) }).optional(),
  /** Unsharp amount 0–1 (3 × 3, at the photo's own resolution). */
  sharpen: z.number().finite().min(0).max(1).optional(),
});

export type PhotoEdit = z.infer<typeof photoEditSchema>;

/** Sliders only (the «Resetează» of the sliders keeps turn / mirror). */
export const PHOTO_SLIDER_KEYS = ["brightness", "contrast", "saturation"] as const;
export type PhotoSliderKey = (typeof PHOTO_SLIDER_KEYS)[number];

/** True when the colours are untouched (no pixel work needed). */
export function isColorIdentity(e: PhotoEdit | null | undefined): boolean {
  if (!e) return true;
  return (
    !e.brightness &&
    !e.contrast &&
    !e.saturation &&
    (e.filter ?? "none") === "none" &&
    !e.sharpen &&
    (!e.levels || (e.levels.lo.every((v) => v === 0) && e.levels.hi.every((v) => v === 255)))
  );
}

/** True when the photo draws as uploaded. */
export function isIdentityEdit(e: PhotoEdit | null | undefined): boolean {
  return !e || (!e.rotate && !e.flipX && !e.flipY && isColorIdentity(e));
}

/** Canonical form: identity fields dropped; undefined when nothing is left. */
export function cleanPhotoEdit(e: PhotoEdit | null | undefined): PhotoEdit | undefined {
  if (!e) return undefined;
  const out: PhotoEdit = {};
  if (e.rotate) out.rotate = e.rotate;
  if (e.flipX) out.flipX = true;
  if (e.flipY) out.flipY = true;
  for (const k of PHOTO_SLIDER_KEYS) {
    const v = Math.round(Math.max(-100, Math.min(100, e[k] ?? 0)));
    if (v) out[k] = v;
  }
  if (e.filter && e.filter !== "none") out.filter = e.filter;
  if (e.levels && !(e.levels.lo.every((v) => v === 0) && e.levels.hi.every((v) => v === 255))) out.levels = e.levels;
  if (e.sharpen) out.sharpen = Math.round(Math.max(0, Math.min(1, e.sharpen)) * 100) / 100;
  return Object.keys(out).length ? out : undefined;
}

/** Cache key of an edit (same key ⇒ same pixels). */
export function photoEditKey(e: PhotoEdit | null | undefined): string {
  const c = cleanPhotoEdit(e);
  return c ? JSON.stringify(c) : "";
}

/** The photo source with an edit applied (identity removes the field). */
export function withPhotoEdit<T extends { naturalW: number; naturalH: number; edit?: PhotoEdit }>(src: T, patch: Partial<PhotoEdit> | null): T {
  const next: PhotoEdit | undefined = patch === null ? undefined : cleanPhotoEdit({ ...src.edit, ...patch });
  const { edit: _old, ...rest } = src;
  void _old;
  return (next ? { ...rest, edit: next } : rest) as T;
}

/** Turn a quarter clockwise. */
export function rotateQuarter(e: PhotoEdit | undefined): Partial<PhotoEdit> {
  return { rotate: ((((e?.rotate ?? 0) + 90) % 360) as PhotoEdit["rotate"]) };
}

/** Size of the photo as drawn (width / height swap when turned 90° / 270°). */
export function orientedSize(src: { naturalW: number; naturalH: number; edit?: PhotoEdit }): { w: number; h: number } {
  const r = src.edit?.rotate ?? 0;
  return r === 90 || r === 270 ? { w: src.naturalH, h: src.naturalW } : { w: src.naturalW, h: src.naturalH };
}

/**
 * A free photo whose frame shows the whole picture (its shape, no zoom):
 * after a quarter turn the frame turns with it (width ↔ height around the
 * centre), so nothing gets cut. A template slot or a cropped photo keeps its
 * frame (null): the turned photo fills it again.
 */
export function frameAfterTurn(
  box: { x: number; y: number; w: number; h: number; crop: { zoom: number } },
  before: { w: number; h: number },
  after: { w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
  if (before.w / before.h === after.w / after.h) return null;
  if (box.crop.zoom > 1.001) return null;
  if (Math.abs(box.w / box.h - before.w / before.h) > 0.02 * (before.w / before.h)) return null;
  const cx: number = box.x + box.w / 2;
  const cy: number = box.y + box.h / 2;
  return { x: cx - box.h / 2, y: cy - box.w / 2, w: box.h, h: box.w };
}

// ─── Pixel math ─────────────────────────────────────────────────────────

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Per-channel lookup tables: levels, then brightness (±80 levels at ±100),
 * then contrast around mid-grey (×0…×2.5).
 */
export function photoLuts(e: PhotoEdit): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const b: number = ((e.brightness ?? 0) / 100) * 80;
  const c: number = e.contrast ?? 0;
  const k: number = c >= 0 ? 1 + (c / 100) * 1.5 : 1 + c / 100;
  return [0, 1, 2].map((ch) => {
    const lo: number = e.levels?.lo[ch] ?? 0;
    const hi: number = Math.max(lo + 1, e.levels?.hi[ch] ?? 255);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let x: number = ((v - lo) / (hi - lo)) * 255;
      x += b;
      x = (x - 128) * k + 128;
      lut[v] = Math.round(clamp255(x));
    }
    return lut;
  }) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

/** Saturation multiplier of the edit (the «Vivid» filter adds +35 %). */
function satFactor(e: PhotoEdit): number {
  const s: number = 1 + (e.saturation ?? 0) / 100;
  return Math.max(0, e.filter === "vivid" ? s * 1.35 : s);
}

/**
 * Apply the colour part of an edit to RGBA pixels in place (alpha kept):
 * levels → brightness → contrast → saturation → filter → sharpen.
 */
export function applyPhotoColor(data: Uint8ClampedArray, w: number, h: number, e: PhotoEdit): void {
  if (isColorIdentity(e)) return;
  const [lr, lg, lb] = photoLuts(e);
  const sat: number = satFactor(e);
  const f: PhotoFilter = e.filter ?? "none";
  const vividContrast: boolean = f === "vivid";
  for (let i = 0; i < data.length; i += 4) {
    let r: number = lr[data[i]!]!;
    let g: number = lg[data[i + 1]!]!;
    let b: number = lb[data[i + 2]!]!;
    if (sat !== 1 || f === "bw" || f === "sepia") {
      const y: number = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (f === "bw") {
        r = g = b = y;
      } else if (f === "sepia") {
        const sr: number = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg: number = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb: number = 0.272 * r + 0.534 * g + 0.131 * b;
        r = sr;
        g = sg;
        b = sb;
      } else {
        r = y + (r - y) * sat;
        g = y + (g - y) * sat;
        b = y + (b - y) * sat;
      }
    }
    if (f === "warm") {
      r += 18;
      g += 6;
      b -= 16;
    } else if (f === "cool") {
      r -= 14;
      g += 2;
      b += 18;
    } else if (vividContrast) {
      r = (r - 128) * 1.08 + 128;
      g = (g - 128) * 1.08 + 128;
      b = (b - 128) * 1.08 + 128;
    }
    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
  if (e.sharpen) sharpenRgba(data, w, h, e.sharpen);
}

/** Unsharp mask, 3 × 3 box blur, in place (edges kept). */
export function sharpenRgba(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  if (amount <= 0 || w < 3 || h < 3) return;
  const src = new Uint8ClampedArray(data);
  const row: number = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i: number = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const j: number = i + c;
        const sum: number =
          src[j - row - 4]! + src[j - row]! + src[j - row + 4]! + src[j - 4]! + src[j]! + src[j + 4]! + src[j + row - 4]! + src[j + row]! + src[j + row + 4]!;
        data[j] = clamp255(src[j]! + amount * (src[j]! - sum / 9));
      }
    }
  }
}

/**
 * «Auto-îmbunătățire»: black / white points at 0.5 % / 99.5 % of the
 * histogram, the same for the three channels (a dull photo gets its full
 * range, its colours keep their balance: stretching each channel apart turned
 * a greyish photo green), a little saturation and a mild sharpen. Computed
 * once on a small copy when the customer taps it and stored as numbers:
 * preview and print stay identical.
 */
export function autoEnhanceParams(data: Uint8ClampedArray): Pick<PhotoEdit, "levels" | "sharpen" | "saturation"> {
  const hist: number[] = new Array(256).fill(0);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 16) continue;
    hist[data[i]!]!++;
    hist[data[i + 1]!]!++;
    hist[data[i + 2]!]!++;
    n += 3;
  }
  const cut: number = Math.max(1, n * 0.005);
  let acc = 0;
  let lo = 0;
  while (lo < 255 && acc + hist[lo]! <= cut) acc += hist[lo++]!;
  acc = 0;
  let hi = 255;
  while (hi > 0 && acc + hist[hi]! <= cut) acc += hist[hi--]!;
  // Never stretch more than ×2 (a nearly flat picture stays a picture), never invert.
  if (hi - lo < 128) {
    const mid: number = (hi + lo) / 2;
    lo = Math.max(0, Math.round(mid - 64));
    hi = Math.min(255, Math.round(mid + 64));
  }
  lo = Math.min(lo, 254);
  hi = Math.max(hi, lo + 1);
  return { levels: { lo: [lo, lo, lo], hi: [hi, hi, hi] }, saturation: 10, sharpen: 0.4 };
}
