/**
 * Client t-shirt designer (/tshirt): what can be printed where.
 * Front and back: up to 30 × 42 cm (A3). Left / right sleeve: up to the DTF
 * sleeve size (`sleeveMaxCm`, 10 × 10 cm). Shared by the page and the API.
 * The side ids are the DTF placements (`sleeve_left` = the wearer's left sleeve).
 */
export const TSHIRT_SIDES = ["front", "back", "sleeve_left", "sleeve_right"] as const;
export type TshirtSide = (typeof TSHIRT_SIDES)[number];
export type TshirtSleeve = "sleeve_left" | "sleeve_right";
export const TSHIRT_SLEEVES: readonly TshirtSleeve[] = ["sleeve_left", "sleeve_right"];
export function isSleeve(side: TshirtSide): side is TshirtSleeve {
  return side === "sleeve_left" || side === "sleeve_right";
}
/** Sleeve print square (cm) when the DTF settings don't say otherwise (`sleeveMaxCm`). */
export const TSHIRT_SLEEVE_CM = 10;

/** One print frame (cm): a print fits when it fits inside it. */
export type Frame = { w: number; h: number };

/**
 * The largest print allowed: `maxWidthCm` × `maxHeightCm` (upright), and when
 * `frames` is given, any of them (e.g. also 42 × 30 lying down on XXL).
 */
export type PrintArea = { maxWidthCm: number; maxHeightCm: number; frames?: Frame[] };

/** Largest print of any size (front and back: 30 × 42 cm, or 42 × 30 on the biggest shirts). */
export const TSHIRT_PRINT_AREA: Record<TshirtSide, PrintArea> = {
  front: { maxWidthCm: 30, maxHeightCm: 42 },
  back: { maxWidthCm: 30, maxHeightCm: 42 },
  sleeve_left: { maxWidthCm: TSHIRT_SLEEVE_CM, maxHeightCm: TSHIRT_SLEEVE_CM },
  sleeve_right: { maxWidthCm: TSHIRT_SLEEVE_CM, maxHeightCm: TSHIRT_SLEEVE_CM },
};

export const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

/**
 * Garment measurements per size (cm): flat chest width × body length, Roly
 * DOGO Premium (6502) chart on roly.eu. DOGO has no adult XS: estimated one
 * step below S (−3 cm chest, −2 cm length) — check against the shirts in stock.
 */
export const TSHIRT_GARMENT_CM: Record<string, { chest: number; length: number }> = {
  XS: { chest: 46, length: 67 },
  S: { chest: 49, length: 69 },
  M: { chest: 52, length: 71 },
  L: { chest: 55, length: 73 },
  XL: { chest: 58, length: 75 },
  XXL: { chest: 62, length: 77 },
  XXXL: { chest: 66, length: 79 },
};
export const TSHIRT_DEFAULT_PREVIEW_SIZE = "M";

/** Size label → the tables' key (3XL = XXXL, 2XL = XXL); unknown → M. */
export function sizeKey(size: string | null | undefined): string {
  const k = (size ?? "").toUpperCase().replace(/^3XL$/, "XXXL").replace(/^2XL$/, "XXL");
  return TSHIRT_GARMENT_CM[k] ? k : TSHIRT_DEFAULT_PREVIEW_SIZE;
}

/** Measurements for a size label; unknown → M. */
export function garmentCm(size: string | null | undefined): { chest: number; length: number } {
  return TSHIRT_GARMENT_CM[sizeKey(size)]!;
}

/**
 * Largest print per size, front and back: proportional to the chest, never
 * more than 30 × 42; XXL and XXXL also take it lying down, 42 × 30.
 */
const BODY_FRAMES: Record<string, Frame[]> = {
  XS: [{ w: 25, h: 35 }],
  S: [{ w: 26.5, h: 37 }],
  M: [{ w: 28, h: 39.5 }],
  L: [{ w: 30, h: 42 }],
  XL: [{ w: 30, h: 42 }],
  XXL: [{ w: 30, h: 42 }, { w: 42, h: 30 }],
  XXXL: [{ w: 30, h: 42 }, { w: 42, h: 30 }],
};

/** Largest sleeve print per size (a square; the DTF sleeve size caps it too): the sleeve is narrower on XS / S. */
const SLEEVE_MAX: Record<string, number> = { XS: 9, S: 9.5, M: 10, L: 10, XL: 10, XXL: 10, XXXL: 10 };

/** The frames a print on this size may fill. */
export function sizeFrames(side: TshirtSide, size: string, sleeveCm: number = TSHIRT_SLEEVE_CM): Frame[] {
  if (isSleeve(side)) {
    const m = Math.min(sleeveCm, SLEEVE_MAX[sizeKey(size)]!);
    return [{ w: m, h: m }];
  }
  return BODY_FRAMES[sizeKey(size)]!;
}

function areaOf(frames: Frame[]): PrintArea {
  const first = frames[0]!;
  return { maxWidthCm: first.w, maxHeightCm: first.h, ...(frames.length > 1 ? { frames } : {}) };
}

/** The largest print of one size (its own cm). */
export function sizePrintArea(side: TshirtSide, size: string, sleeveCm: number = TSHIRT_SLEEVE_CM): PrintArea {
  return areaOf(sizeFrames(side, size, sleeveCm));
}

/** Kept for older callers: every size's largest print. */
export const TSHIRT_PRINT_AREA_BY_SIZE: Record<string, Record<TshirtSide, PrintArea>> = Object.fromEntries(
  TSHIRT_SIZES.map((size) => [
    size,
    {
      front: sizePrintArea("front", size),
      back: sizePrintArea("back", size),
      sleeve_left: sizePrintArea("sleeve_left", size),
      sleeve_right: sizePrintArea("sleeve_right", size),
    },
  ]),
);

// ─── One design, every size ─────────────────────────────────────────────

/**
 * The design is kept on M (100 %). Every ordered size gets it scaled by how
 * much wider that shirt is than M (its chest): XS 88 %, S 94 %, L 106 %,
 * XL 112 %, XXL 119 %, XXXL 127 % — the print looks the same on every shirt.
 */
export const TSHIRT_REFERENCE_SIZE = "M";

/** A size against M, by the chest width (1 = 100 %). */
export function sizeRatio(size: string): number {
  return garmentCm(size).chest / garmentCm(TSHIRT_REFERENCE_SIZE).chest;
}

/** Frames that fit in all of `a` and all of `b` (each pair's overlap; dominated ones dropped). */
/**
 * Largest design on M (M's cm), the way Canva resizes: the client designs on M
 * only; it may be as big as the largest print any ordered size takes, scaled
 * back to M — e.g. XXL ordered → 42 × 30 on the XXL, so 35.2 × 25.1 on M. A size
 * that can't take that much gets it shrunk to its own largest print when it is
 * sent (`layersForOrderSize`). No size yet: M's own.
 */
export function printAreaForSizes(side: TshirtSide, sizes: readonly string[], sleeveCm: number = TSHIRT_SLEEVE_CM): PrintArea {
  const list = sizes.length ? sizes : [TSHIRT_REFERENCE_SIZE];
  const all: Frame[] = [];
  for (const size of list) {
    const r = sizeRatio(size);
    // a hair under: the print files' sizes are rounded up to 0.1 cm
    for (const f of sizeFrames(side, size, sleeveCm)) all.push({ w: Math.floor((f.w / r) * 10) / 10, h: Math.floor((f.h / r) * 10) / 10 });
  }
  // keep only the frames no other frame contains
  const frames = all.filter((f, i) => !all.some((g, j) => j !== i && g.w >= f.w && g.h >= f.h && (g.w > f.w || g.h > f.h || j < i)));
  frames.sort((a, b) => b.h - a.h);
  return areaOf(frames);
}

/** Scale of the M design on a size (its chest ratio). */
export function sizeScale(_side: TshirtSide, size: string): number {
  return sizeRatio(size);
}

// ─── Where a print sits on each size ──────────────────────────────────

/**
 * Standard positions per size (cm), print shops' placement guides (DTF Linko,
 * Rush Order Tees): from the collar seam to the top of a front print 4.5 (XS)
 * … 7.5 (XXL); a back print ~2.5 cm lower; a chest logo 7–10 cm down and
 * 12.5–17 cm off the middle (its centre, about half-way to the side: on the wearer's chest); under the back collar 2.5; a sleeve
 * print's top 4–6.5 cm under the shoulder seam. `logoDown`: a chest logo's top
 * under the front collar seam (6–9 cm; print shops: 3–4 in). `neckFront` / `neckBack`: the
 * collar seam's drop under the shoulder top (HPS) in the middle, estimated.
 */
export const TSHIRT_PLACEMENT_CM: Record<
  string,
  { neckFront: number; neckBack: number; front: number; back: number; logoDown: number; logoX: number; nape: number; sleeveTop: number }
> = {
  XS: { neckFront: 8.5, neckBack: 2, front: 4.5, back: 7, logoDown: 6, logoX: 12.5, nape: 2.5, sleeveTop: 4 },
  S: { neckFront: 9, neckBack: 2, front: 5, back: 7.5, logoDown: 6.5, logoX: 13, nape: 2.5, sleeveTop: 4.5 },
  M: { neckFront: 9.5, neckBack: 2, front: 5.5, back: 8, logoDown: 7, logoX: 14, nape: 2.5, sleeveTop: 5 },
  L: { neckFront: 10, neckBack: 2, front: 6.5, back: 9, logoDown: 7.5, logoX: 14.5, nape: 2.5, sleeveTop: 5.5 },
  XL: { neckFront: 10.5, neckBack: 2, front: 7, back: 9.5, logoDown: 8, logoX: 15, nape: 2.5, sleeveTop: 6 },
  XXL: { neckFront: 11, neckBack: 2.5, front: 7.5, back: 10, logoDown: 8.5, logoX: 16, nape: 2.5, sleeveTop: 6.5 },
  XXXL: { neckFront: 11.5, neckBack: 2.5, front: 7.5, back: 10, logoDown: 9, logoX: 17, nape: 2.5, sleeveTop: 7 },
};

export function placementCm(size: string | null | undefined) {
  return TSHIRT_PLACEMENT_CM[sizeKey(size)]!;
}

/** Collar seam under the HPS in the middle of a side (cm; a sleeve: 0). */
export function neckDropCm(side: TshirtSide, size: string): number {
  if (isSleeve(side)) return 0;
  const p = placementCm(size);
  return side === "back" ? p.neckBack : p.neckFront;
}

/**
 * Where the standard print starts on a side of a size (cm under the HPS; a
 * sleeve: the top of its print square = 0): the M design keeps its distance
 * from this line, scaled by the size's ratio.
 */
export function anchorTopCm(side: TshirtSide, size: string): number {
  if (isSleeve(side)) return 0;
  const p = placementCm(size);
  return side === "back" ? p.neckBack + p.back : p.neckFront + p.front;
}

/** Stock category whose items the designer offers. */
export const TSHIRT_CATEGORY_CODE = "tshirts";

/** Print files are rendered at this resolution. */
export const TSHIRT_PRINT_DPI = 300;
/**
 * Image quality at its printed size. Any image may be ordered; the client is
 * told how clear it will be (below WARN: a warning, below MIN: "blurry").
 */
export const TSHIRT_DPI_WARN = 150;
export const TSHIRT_DPI_MIN = 100;
export const TSHIRT_DPI_EXCELLENT = 250;

export type PrintClarity = "excellent" | "good" | "ok" | "poor";
export function printClarity(dpi: number): PrintClarity {
  if (dpi >= TSHIRT_DPI_EXCELLENT) return "excellent";
  if (dpi >= TSHIRT_DPI_WARN) return "good";
  if (dpi >= TSHIRT_DPI_MIN) return "ok";
  return "poor";
}

/** Smallest design we print (cm, either side). */
export const TSHIRT_MIN_DESIGN_CM = 2;

const EPS = 0.05;

/** Does a design of this size fit the print area? */
export function fitsTshirtArea(a: PrintArea, widthCm: number, heightCm: number): boolean {
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return false;
  if (widthCm < TSHIRT_MIN_DESIGN_CM - EPS || heightCm < TSHIRT_MIN_DESIGN_CM - EPS) return false;
  return fitsFrames(a, widthCm, heightCm, EPS);
}

/** Does w × h fit the area (any of its frames)? */
export function fitsFrames(a: PrintArea, widthCm: number, heightCm: number, eps = 0.001): boolean {
  const frames = a.frames ?? [{ w: a.maxWidthCm, h: a.maxHeightCm }];
  return frames.some((f) => widthCm <= f.w + eps && heightCm <= f.h + eps);
}

/** DPI of an image of `naturalPx` pixels printed `printedCm` wide. */
export function printedDpi(naturalPx: number, printedCm: number): number {
  if (!(printedCm > 0)) return 0;
  return Math.round(naturalPx / (printedCm / 2.54));
}
