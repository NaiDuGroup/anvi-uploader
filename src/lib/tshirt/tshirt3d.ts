/**
 * The 3D T-shirt of Previzualizare (`public/studio/apparel/tshirt3d`, a CLO
 * export): front, back, two sleeves and the collar rib as separate panels.
 * Each panel's texture coordinates are its flat sewing pattern in real
 * millimetres, so a print is painted on the pattern at its true size and
 * position — the same cm the workshop presses.
 *
 * Pattern axes (measured on the model): u across (0 = the panel's middle,
 * + = to the right as you look at that side; a sleeve: + = towards the back
 * on the left sleeve, the front on the right one — again the viewer's right
 * seen from that side), v down (+ = towards the hem). Pure.
 */
import { TSHIRT_REFERENCE_SIZE, type TshirtSide } from "./tshirtRules";
import { photoSizeFactor } from "./tshirtPhoto";

export const TSHIRT_3D_URL = "/studio/apparel/tshirt3d/tshirt.gltf";

/** The model is about a size M: flat chest of the front panel and HPS → hem (cm). */
export const MODEL_CHEST_CM = 51;
export const MODEL_LENGTH_CM = 70.4;
/** Model metres of the HPS level (the shirt is resized around it, so the collar stays on the mannequin). */
export const MODEL_HPS_Y = 1.627;
/** Pattern v (mm) of the sleeve cap's top. */
const SLEEVE_CAP_V = -102;

export type Panel = "front" | "back" | "sleeve_left" | "sleeve_right" | "rib";

/** Pattern v (mm) of the design's y = 0: the HPS on the body panels, the top of the print square on a sleeve. */
export const PANEL_ORIGIN_V: Record<Exclude<Panel, "rib">, number> = {
  front: -406.5,
  back: -385.6,
  // Sleeve cap top at −102 mm; the print square starts 5 cm under it (the sleeve is ~20 cm long there).
  sleeve_left: -52,
  sleeve_right: -52,
};

/** Texture px per pattern mm. */
export const TEXTURE_PX_PER_MM = 2;

/** Which panel a side is printed on. */
export function panelOf(side: TshirtSide): Exclude<Panel, "rib"> {
  return side;
}

/**
 * Where a design (cm, its bounds `rect`) lands on its panel's pattern (mm),
 * on a shirt `scale` times the model (the chest of the shown size against the
 * model's): a smaller shirt has a smaller pattern, so the same print covers more of it.
 */
/**
 * Landmarks of the editor's Roly photos (photo cm from the photo's origin, the
 * Studio's calibration, size L) and of the 3D panels (pattern mm): the collar
 * seam in the middle, the hem, and half the body's width. A body print is put
 * on the 3D shirt by the same proportions it has on the editor's photo, so it
 * looks the same there: its top as the same share of collar → hem, its middle
 * round the body (the photo sees the chest from the front); its size by the
 * mean of both scales (a print is never stretched).
 */
const PHOTO_MARKS = {
  front: { collar: 4.6, hem: (2000 - 10) / 18.6, half: 53.2 / 2 },
  back: { collar: (36 + 10) / 18.3, hem: (1998 + 10) / 18.3, half: 51.5 / 2 },
} as const;
const MODEL_MARKS = {
  front: { collar: -298.2, hem: 297.7, half: 256 },
  back: { collar: -344.5, hem: 344, half: 256 },
} as const;

/**
 * Where a design (cm as in the editor, its bounds `rect`) lands on its
 * panel's pattern (mm). Body: by the editor photo's proportions (above), on
 * the shown size (its photo is the L photo × the chest ratio). A sleeve: its
 * print square's top `sleeveTopCm` under the cap's top.
 */
export function designOnPattern(
  side: TshirtSide,
  rect: { x: number; y: number; w: number; h: number },
  _sx = 1,
  _sy = 1,
  sleeveTopCm = 5,
  size: string = TSHIRT_REFERENCE_SIZE,
): { u: number; v: number; w: number; h: number } {
  if (side === "sleeve_left" || side === "sleeve_right") {
    const k = 10;
    return { u: rect.x * k, v: SLEEVE_CAP_V + (sleeveTopCm + rect.y) * k, w: rect.w * k, h: rect.h * k };
  }
  const f = photoSizeFactor(size).x;
  const p = PHOTO_MARKS[side as "front" | "back"];
  const m = MODEL_MARKS[side as "front" | "back"];
  // The photo shows the shirt from the front: the chest curves away to the side seams, so a point
  // r of the way out on the photo is asin(r) round the body — on the flat panel that share of its half.
  const top = rect.y / f;
  const mid = (rect.x + rect.w / 2) / f;
  const r = Math.max(-0.95, Math.min(0.95, mid / p.half));
  const uMid = m.half * (2 / Math.PI) * Math.asin(r);
  // mm of the model per photo cm: across (at the design's middle, round the curve) and along
  const across = (m.half * (2 / Math.PI)) / (p.half * Math.sqrt(1 - r * r));
  const along = (m.hem - m.collar) / (p.hem - p.collar);
  const k = Math.sqrt(across * along) / f; // mm per design cm
  const w = rect.w * k;
  const h = rect.h * k;
  return { u: uMid - w / 2, v: m.collar + (top - p.collar) * along, w, h };
}

/** How much a size's shirt is resized against the model: across (chest) and lengthwise (length). */
export function modelScaleFor(garment: { chest: number; length: number }): { sx: number; sy: number } {
  return { sx: garment.chest / MODEL_CHEST_CM, sy: garment.length / MODEL_LENGTH_CM };
}

// ─── Roly's photos on the 3D shirt ─────────────────────────────────────────

/** Model metres: the HPS level, the hem, and the sleeves' middle (front-back) and their top / bottom. */
const MODEL = { hpsY: 1.627, sleeveZ: -0.035, sleeveTop: 1.576, sleeveBottom: 1.358 } as const;

/**
 * Roly photo (2000 px, `PHOTO_VIEWS` calibration: centre / HPS px, 18.6 px per
 * photo cm) for a point of the model, per view: the model's body maps onto the
 * photo's body (≈1.6× — the photo shows the shirt laid flat, the model wraps a
 * body), the sleeves onto the side photos. Returns photo px.
 */
export function modelToPhotoPx(view: "front" | "back" | "left" | "right", x: number, y: number, z: number): [number, number] {
  const PX = 18.6;
  const down = (MODEL.hpsY - y) * 100 * 1.557;
  switch (view) {
    case "front":
      return [992 + x * 100 * 1.6 * PX, 10 + down * PX];
    case "back":
      return [1000 - x * 100 * 1.55 * PX, -10 + down * PX];
    case "left":
    case "right": {
      // The sleeve from under its cap (≈10 photo cm under the HPS: the shoulder above it is narrow on
      // the photo) to its hem (≈32 cm); across: 1.25× (stays inside the sleeve on the photo).
      const t = (MODEL.sleeveTop - y) / (MODEL.sleeveTop - MODEL.sleeveBottom);
      const ys = 10 + t * 22;
      const across = (z - MODEL.sleeveZ) * 100 * 1.25;
      // Left photo: the shirt faces the viewer's left (front = −); the right one is mirrored.
      return view === "left" ? [1090 - across * PX, 10 + ys * PX] : [910 + across * PX, 10 + ys * PX];
    }
  }
}

/** Which Roly photo dresses a panel (the collar rib: its front half the front photo, its back half the back). */
export function photoOfPanel(panel: Panel, centreZ: number): "front" | "back" | "left" | "right" {
  if (panel === "sleeve_left") return "left";
  if (panel === "sleeve_right") return "right";
  if (panel === "back") return "back";
  if (panel === "rib") return centreZ < -0.02 ? "back" : "front";
  return "front";
}
