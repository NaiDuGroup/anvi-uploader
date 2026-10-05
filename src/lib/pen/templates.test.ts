import { describe, it, expect } from "vitest";
import {
  buildPenTemplates,
  PEN_DEFAULT_CANVAS,
  type PenTemplate,
  type TextSlot,
} from "./templates";

/** Horizontal span a centred text slot actually occupies. */
function textBounds(slot: TextSlot): { left: number; right: number } {
  return { left: slot.x - slot.width / 2, right: slot.x + slot.width / 2 };
}

function byId(templates: PenTemplate[], id: string): PenTemplate {
  const found = templates.find((tmpl) => tmpl.id === id);
  if (!found) throw new Error(`Template "${id}" is missing`);
  return found;
}

describe("buildPenTemplates", () => {
  const { width: W, height: H } = PEN_DEFAULT_CANVAS;
  const templates = buildPenTemplates();

  it("offers the full set with unique ids", () => {
    expect(templates.map((tmpl) => tmpl.id)).toEqual([
      "text_only",
      "logo_text",
      "text_logo",
      "logo_only",
      "photo_only",
    ]);
  });

  it("scales every slot to the requested canvas", () => {
    const scaled = buildPenTemplates(W * 2, H * 2);
    for (const tmpl of scaled) {
      expect(tmpl.canvasWidth).toBe(W * 2);
      expect(tmpl.canvasHeight).toBe(H * 2);
      for (const slot of tmpl.photoSlots) {
        expect(slot.x + slot.width).toBeLessThanOrEqual(W * 2);
        expect(slot.y + slot.height).toBeLessThanOrEqual(H * 2);
      }
    }
  });

  it("keeps text clear of the logo in the logo+text templates", () => {
    for (const id of ["logo_text", "text_logo"]) {
      const tmpl = byId(templates, id);
      const logo = tmpl.photoSlots[0]!;
      const { left, right } = textBounds(tmpl.textSlot!);

      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(W);
      // The two bands must sit side by side, whichever edge the logo is on.
      expect(left >= logo.x + logo.width || right <= logo.x).toBe(true);
    }
  });

  it("mirrors text_logo against logo_text", () => {
    const logoLeft = byId(templates, "logo_text").photoSlots[0]!;
    const logoRight = byId(templates, "text_logo").photoSlots[0]!;
    expect(logoRight.width).toBe(logoLeft.width);
    expect(W - (logoRight.x + logoRight.width)).toBe(logoLeft.x);
  });

  it("groups the logo with the caption only where both are present", () => {
    const grouped = templates
      .filter((tmpl) => tmpl.groupPhotoWithText)
      .map((tmpl) => tmpl.id);
    expect(grouped).toEqual(["logo_text", "text_logo"]);
  });

  it("never crops a logo but lets ready-made artwork bleed", () => {
    expect(byId(templates, "logo_only").defaultFitMode).toBe("contain");
    expect(byId(templates, "logo_text").defaultFitMode).toBe("contain");
    expect(byId(templates, "photo_only").defaultFitMode).toBe("cover");
  });

  it("hides the text controls only on the image-only templates", () => {
    const noText = templates.filter((tmpl) => tmpl.noText).map((tmpl) => tmpl.id);
    expect(noText).toEqual(["logo_only", "photo_only"]);
    for (const tmpl of templates) {
      expect(tmpl.noText === true).toBe(tmpl.textSlot === null);
    }
  });

  // Catalog pens may have a print area well under 1 cm tall. Deriving the
  // padding from the width alone used to eat most of that height and shrink
  // the logo square to a few pixels.
  it("leaves a usable logo square on a thin print area", () => {
    const thinH = 59;
    const thin = buildPenTemplates(W, thinH);

    for (const tmpl of thin) {
      for (const slot of tmpl.photoSlots) {
        expect(slot.width).toBeGreaterThan(0);
        expect(slot.height).toBeGreaterThan(0);
        expect(slot.y + slot.height).toBeLessThanOrEqual(thinH);
      }
      if (tmpl.textSlot) {
        expect(tmpl.textSlot.width).toBeGreaterThan(0);
        expect(tmpl.textSlot.height).toBeGreaterThan(0);
      }
    }

    // Roomy enough for the "Photo 1" placeholder once its font scales down.
    expect(byId(thin, "logo_text").photoSlots[0]!.width).toBeGreaterThanOrEqual(
      thinH / 2,
    );
  });

  it("keeps the padding unchanged on the default canvas", () => {
    // text_only is inset by the padding on both sides.
    expect(byId(templates, "text_only").textSlot!.width).toBe(W - 19 * 2);
  });
});
