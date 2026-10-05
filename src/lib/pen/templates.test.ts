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
      "text_two_lines",
      "logo_text",
      "text_logo",
      "logo_two_lines",
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
    for (const id of ["logo_text", "text_logo", "logo_two_lines"]) {
      const tmpl = byId(templates, id);
      const logo = tmpl.photoSlots[0]!;
      const slots = [tmpl.textSlot, tmpl.textSlotSecondary].filter(
        (slot): slot is TextSlot => slot != null,
      );
      expect(slots.length).toBeGreaterThan(0);

      for (const slot of slots) {
        const { left, right } = textBounds(slot);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(W);
        // The two bands must sit side by side, whichever edge the logo is on.
        const clearsLogo = left >= logo.x + logo.width || right <= logo.x;
        expect(clearsLogo).toBe(true);
      }
    }
  });

  it("mirrors text_logo against logo_text", () => {
    const logoLeft = byId(templates, "logo_text").photoSlots[0]!;
    const logoRight = byId(templates, "text_logo").photoSlots[0]!;
    expect(logoRight.width).toBe(logoLeft.width);
    expect(W - (logoRight.x + logoRight.width)).toBe(logoLeft.x);
  });

  it("stacks the two caption lines without overlap", () => {
    for (const id of ["text_two_lines", "logo_two_lines"]) {
      const tmpl = byId(templates, id);
      const primary = tmpl.textSlot!;
      const secondary = tmpl.textSlotSecondary!;
      expect(primary.y).toBeLessThan(secondary.y);
      // The headline gets the taller slot, so it auto-sizes bigger.
      expect(primary.height).toBeGreaterThan(secondary.height);
      expect(secondary.y + secondary.height / 2).toBeLessThanOrEqual(H);
    }
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
});
