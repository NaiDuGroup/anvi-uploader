import { describe, expect, it } from "vitest";
import { shopLineStudioSchema } from "@/lib/shop/designLine";
import { STUDIO_APPROVAL_CHECKS, parseLineStudio } from "@/lib/storefront/design";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioLayer } from "./document";
import { studioSurfaces, surfaceBase } from "./surfaces";
import { studioApprovalChecks, studioVariantChoiceKind, studioVerifyNotes } from "./verifyChecklist";

function doc(...layers: StudioLayer[]): StudioDoc {
  let d = emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
  for (const l of layers) d = addLayer(d, d.surfaces[0]!.id, l);
  return d;
}

describe("verify step", () => {
  it("names the variant choice: volume, colour or variant", () => {
    expect(studioVariantChoiceKind([{ label: "320 ml", hex: "#ffffff" }, { label: "450 ml", hex: "#ffffff" }])).toBe("volume");
    expect(studioVariantChoiceKind([{ label: "320 мл", hex: "#ffffff" }, { label: "450 мл", hex: "#FFFFFF" }])).toBe("volume");
    expect(studioVariantChoiceKind([{ label: "Albă", hex: "#ffffff" }, { label: "Neagră", hex: "#1c1c1c" }])).toBe("color");
    expect(studioVariantChoiceKind([{ label: "Clasică", hex: "#ffffff" }, { label: "Inimă", hex: "#ffffff" }])).toBe("variant");
  });

  it("stores the whole checklist with a new approval; old and new lines parse", () => {
    const base = { v: 1, docId: "d1", approvedAt: "2026-11-06T10:00:00.000Z" };
    const fresh = { ...base, checks: studioApprovalChecks() };
    expect(fresh.checks).toEqual([...STUDIO_APPROVAL_CHECKS]);
    expect(parseLineStudio(fresh)?.checks).toEqual([...STUDIO_APPROVAL_CHECKS]);
    expect(shopLineStudioSchema.safeParse(fresh).success).toBe(true);
    // Lines stored by the old four-checkbox step: any subset, including none.
    for (const checks of [[], ["text"], ["text", "edges", "quality", "product"]]) {
      expect(parseLineStudio({ ...base, checks })?.checks).toEqual(checks);
      expect(shopLineStudioSchema.safeParse({ ...base, checks }).success).toBe(true);
    }
    expect(parseLineStudio({ ...base, checks: ["bogus"] })).toBeNull();
  });

  it("lists sample texts (printed) and parts that are not printed", () => {
    const d = doc(
      { id: "t1", kind: "text", x: 80, y: 30, w: 50, h: 15, rotation: 0, text: "Numele tău", fontFamily: "Roboto", bold: true, sizePt: 24, color: "#14213d", align: "center", lineHeight: 1.2, placeholder: true },
      { id: "t2", kind: "text", x: 80, y: 50, w: 50, h: 15, rotation: 0, text: "Ana", fontFamily: "Roboto", bold: true, sizePt: 24, color: "#14213d", align: "center", lineHeight: 1.2 },
      { id: "p1", kind: "image", x: 20, y: 20, w: 40, h: 40, rotation: 0, src: null, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 } },
      { id: "q1", kind: "qr", x: 150, y: 30, w: 30, h: 30, rotation: 0, qr: { type: "url", data: { url: "" } }, color: "#000000", background: null },
      { id: "s1", kind: "shape", shape: "rect", x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: "#ff0000", hidden: true },
      { id: "p2", kind: "image", x: 20, y: 20, w: 40, h: 40, rotation: 0, src: null, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 }, hidden: true },
    );
    expect(studioVerifyNotes(d)).toEqual({
      samples: [{ layerId: "t1", text: "Numele tău" }],
      notPrinted: [
        { layerId: "p1", what: "photoSpot" },
        { layerId: "q1", what: "qrEmpty" },
        { layerId: "s1", what: "hidden" },
      ],
    });
  });
});
