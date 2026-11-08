import { describe, expect, it } from "vitest";
import { DEFAULT_GIFT_SET_TEMPLATES } from "@/lib/giftSet/giftSet";
import { readyZoneExpectedPx } from "@/lib/giftSet/giftSetReadyLines";
import { adminOrderLineSchema } from "@/lib/validations";
import { readySetRowLine } from "./giftSetLines";

const C = DEFAULT_GIFT_SET_TEMPLATES[2]!;
const VAR = "11111111-1111-4111-8111-111111111111";
const gs = (zoneId: string) => ({ groupId: "g", templateId: C.id, role: "ready" as const, quantity: 3, manualUnitPriceMdl: null, zoneId, readyVariantId: VAR });
const file = { fileName: "a.png", fileUrl: "https://x/a.png", copies: 3, color: "color" as const };

describe("ready set rows → order lines", () => {
  it("thermos = UV client item with its one zone, notebook / pen = «другой» notebook / pen lines", () => {
    const th = readySetRowLine(C, gs("thermos"), "retail", "чёрный");
    expect(th.line).toMatchObject({
      productType: "uv_print",
      uv: { source: "client", quantity: 3, zones: [{ id: "thermos", widthCm: 17, heightCm: 2.5 }] },
      set: { zoneId: "thermos", readyVariantId: VAR },
    });
    expect(th.paperType).toBe("uv:thermos");
    const nb = readySetRowLine(C, gs("notebook"), "retail", null);
    expect(nb.line).toMatchObject({ productType: "notebook", notebookOther: true });
    const pen = readySetRowLine(C, gs("pen"), "dealer", null);
    expect(pen.line).toMatchObject({ productType: "pen", penOther: true, customerType: "dealer" });
    for (const r of [th, nb, pen]) {
      const parsed = adminOrderLineSchema.safeParse({ ...r.line, files: [{ ...file, ...(r.paperType ? { paperType: r.paperType } : {}) }] });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    expect(() => readySetRowLine(C, { ...gs("thermos"), readyVariantId: undefined }, "retail", null)).toThrow();
    expect(readyZoneExpectedPx({ widthCm: 5, heightCm: 0.6 })).toEqual({ width: 591, height: 71 });
  });
});
