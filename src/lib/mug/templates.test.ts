import { describe, it, expect } from "vitest";
import { buildMugTemplates, MUG_DEFAULT_CANVAS } from "./templates";
import {
  cmToPx,
  MUG_DEFAULT_PRINT,
  pxFromProduct,
} from "@/lib/printDimensions";

/**
 * These tests guard the core invariant of the mug template system:
 * the rendered canvas must always be exactly the catalog product's print
 * area (printWidthCm × printHeightCm @ printDpi). The composite PNG that
 * goes to print is `canvas.width × canvas.height`, so if any template
 * stops respecting the (W, H) it was instantiated with, the printed mug
 * will be the wrong size — silently.
 *
 * We test the legacy catalog default (21×9.6 cm @ 300 DPI = 2480×1134 px)
 * plus two off-catalog shapes that the system already supports.
 */

const NEW_IDS = [
  "panorama",
  "three_photos",
  "polaroid_trio",
  "big_quote",
  "heart_love",
] as const;

const LEGACY_IDS = [
  "photo_text",
  "text_photo",
  "classic",
  "photo_text_photo",
] as const;

const ALL_IDS = [...LEGACY_IDS, ...NEW_IDS];

/**
 * Maximum extent (from centre) of a slot after rotation. Used to verify the
 * polaroid trio never spills past the canvas edge for any product shape.
 */
function rotatedExtent(size: number, rotation: number): number {
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  return (size / 2) * (c + s);
}

describe("buildMugTemplates", () => {
  it("returns all 9 templates (4 legacy + 5 creative)", () => {
    const ids = buildMugTemplates().map((t) => t.id);
    for (const id of ALL_IDS) expect(ids).toContain(id);
    expect(ids).toHaveLength(ALL_IDS.length);
  });

  it("uses the legacy catalog default (21×9.6 cm @ 300 DPI = 2480×1134 px) when called with no args", () => {
    const expectedW = cmToPx(MUG_DEFAULT_PRINT.widthCm, MUG_DEFAULT_PRINT.dpi);
    const expectedH = cmToPx(MUG_DEFAULT_PRINT.heightCm, MUG_DEFAULT_PRINT.dpi);
    expect(expectedW).toBe(MUG_DEFAULT_CANVAS.width);
    expect(expectedH).toBe(MUG_DEFAULT_CANVAS.height);

    for (const t of buildMugTemplates()) {
      expect(t.canvasWidth).toBe(expectedW);
      expect(t.canvasHeight).toBe(expectedH);
    }
  });
});

describe.each([
  { name: "legacy 21×9.6 cm @ 300 DPI", W: 2480, H: 1134 },
  { name: "catalog 21×9.6 cm @ 600 DPI", W: cmToPx(21, 600), H: cmToPx(9.6, 600) },
  { name: "square mug 1500×1500 px", W: 1500, H: 1500 },
  { name: "mini wrap 1800×900 px", W: 1800, H: 900 },
])("template geometry stays inside the catalog canvas — $name", ({ W, H }) => {
  const templates = buildMugTemplates(W, H);

  it.each(ALL_IDS)(
    "%s reports the requested canvas size",
    (id) => {
      const t = templates.find((tmpl) => tmpl.id === id)!;
      expect(t.canvasWidth).toBe(W);
      expect(t.canvasHeight).toBe(H);
    },
  );

  it.each(ALL_IDS)(
    "%s photo slots stay inside the canvas (axis-aligned bounds)",
    (id) => {
      const t = templates.find((tmpl) => tmpl.id === id)!;
      for (const slot of t.photoSlots) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.x + slot.width).toBeLessThanOrEqual(W);
        expect(slot.y + slot.height).toBeLessThanOrEqual(H);
        expect(slot.width).toBeGreaterThan(0);
        expect(slot.height).toBeGreaterThan(0);
      }
    },
  );

  it.each(ALL_IDS)(
    "%s text slot stays inside the canvas with a positive area",
    (id) => {
      const t = templates.find((tmpl) => tmpl.id === id)!;
      const ts = t.textSlot;
      expect(ts.width).toBeGreaterThan(0);
      expect(ts.height).toBeGreaterThan(0);
      expect(ts.x).toBeGreaterThanOrEqual(0);
      expect(ts.x).toBeLessThanOrEqual(W);
      expect(ts.y).toBeGreaterThanOrEqual(0);
      expect(ts.y).toBeLessThanOrEqual(H);
    },
  );

  it("polaroid_trio rotated bounding boxes fit inside the canvas", () => {
    const t = templates.find((tmpl) => tmpl.id === "polaroid_trio")!;
    for (const slot of t.photoSlots) {
      const rotation = slot.rotation ?? 0;
      const extent = rotatedExtent(slot.width, rotation);
      const cx = slot.x + slot.width / 2;
      const cy = slot.y + slot.height / 2;
      // The rotated square's bounding box [cx-extent, cx+extent] × [cy-extent, cy+extent]
      // must fit entirely within the canvas so the white polaroid frame is not clipped.
      expect(cx - extent).toBeGreaterThanOrEqual(0);
      expect(cx + extent).toBeLessThanOrEqual(W);
      expect(cy - extent).toBeGreaterThanOrEqual(0);
      expect(cy + extent).toBeLessThanOrEqual(H);
    }
  });
});

/**
 * End-to-end style: simulate the real production code path that runs whenever
 * a user picks a mug from the catalog. Whatever `printWidthCm × printHeightCm
 * @ printDpi` the admin entered shows up as the canvas size of every template.
 *
 * This is exactly what the public `/mug` flow, the cabinet order form, and the
 * admin order form all do — each computes `cmToPx(product.printWidthCm,
 * product.printDpi) × cmToPx(product.printHeightCm, product.printDpi)` and
 * passes it into `buildMugTemplates(W, H)`.
 */
describe("catalog → canvas: a selected MugProduct drives every template's pixel size", () => {
  const catalogProducts = [
    {
      label: "default mug (21 × 9.6 cm @ 300 DPI → 2480 × 1134 px)",
      product: { printWidthCm: 21, printHeightCm: 9.6, printDpi: 300 },
      expected: { width: 2480, height: 1134 },
    },
    {
      label: "the same mug at 600 DPI (catalog upgrade)",
      product: { printWidthCm: 21, printHeightCm: 9.6, printDpi: 600 },
      expected: { width: cmToPx(21, 600), height: cmToPx(9.6, 600) },
    },
    {
      label: "wide travel mug (24 × 11 cm @ 300 DPI)",
      product: { printWidthCm: 24, printHeightCm: 11, printDpi: 300 },
      expected: { width: cmToPx(24, 300), height: cmToPx(11, 300) },
    },
    {
      label: "Prisma Decimal-shaped strings tolerated by pxFromProduct",
      product: { printWidthCm: "21.0", printHeightCm: "9.6", printDpi: 300 },
      expected: { width: 2480, height: 1134 },
    },
  ];

  it.each(catalogProducts)(
    "$label → templates render at the catalog dimensions",
    ({ product, expected }) => {
      // Mirrors the exact two calls every order form makes:
      //   1. compute the catalog pixel size
      //   2. (re)build templates against that size
      const px = pxFromProduct(product);
      expect(px.width).toBe(expected.width);
      expect(px.height).toBe(expected.height);

      const templates = buildMugTemplates(px.width, px.height);
      for (const tmpl of templates) {
        expect(tmpl.canvasWidth).toBe(expected.width);
        expect(tmpl.canvasHeight).toBe(expected.height);
      }
    },
  );

  it("switching product mid-edit re-instantiates the templates at the new dimensions", () => {
    // First product chosen: legacy 21×9.6 cm
    const firstPx = pxFromProduct({
      printWidthCm: 21,
      printHeightCm: 9.6,
      printDpi: 300,
    });
    const first = buildMugTemplates(firstPx.width, firstPx.height);
    expect(first.every((t) => t.canvasWidth === 2480)).toBe(true);
    expect(first.every((t) => t.canvasHeight === 1134)).toBe(true);

    // User switches to a wider travel mug — every template must redraw at the new size.
    const secondPx = pxFromProduct({
      printWidthCm: 24,
      printHeightCm: 11,
      printDpi: 300,
    });
    const second = buildMugTemplates(secondPx.width, secondPx.height);
    expect(second.every((t) => t.canvasWidth === cmToPx(24, 300))).toBe(true);
    expect(second.every((t) => t.canvasHeight === cmToPx(11, 300))).toBe(true);
  });
});

describe("template photo counts", () => {
  const templates = buildMugTemplates();
  const expectedMaxPhotos: Record<string, number> = {
    photo_text: 1,
    text_photo: 1,
    classic: 2,
    photo_text_photo: 2,
    panorama: 1,
    three_photos: 3,
    polaroid_trio: 3,
    big_quote: 1,
    heart_love: 1,
  };

  it.each(Object.entries(expectedMaxPhotos))(
    "%s exposes maxPhotos = %s",
    (id, expected) => {
      const t = templates.find((tmpl) => tmpl.id === id)!;
      expect(t.maxPhotos).toBe(expected);
      expect(t.photoSlots).toHaveLength(expected);
    },
  );
});
