import { describe, expect, it } from "vitest";
import {
  designDocSchema,
  emptyDesignDoc,
  MAX_DESIGN_ELEMENTS,
  type DesignDoc,
} from "./doc";

describe("designDocSchema", () => {
  it("accepts an empty document", () => {
    const doc = emptyDesignDoc("#ff0000");
    const parsed = designDocSchema.parse(doc);
    expect(parsed.background.color).toBe("#ff0000");
    expect(parsed.elements).toEqual([]);
  });

  it("applies element defaults", () => {
    const parsed = designDocSchema.parse({
      version: 1,
      background: { color: "transparent" },
      elements: [
        {
          kind: "text",
          id: "t1",
          x: 10,
          y: 20,
          width: 300,
          height: 80,
          text: "Dița Marcela",
          fontId: "greatVibes",
          fontSizePx: 120,
          color: "#ffffff",
        },
        {
          kind: "image",
          id: "i1",
          x: 0,
          y: 0,
          width: 500,
          height: 500,
          srcKind: "asset",
          fileKey: "catalog/design-assets/123-flowers.png",
        },
        {
          kind: "shape",
          id: "s1",
          x: 5,
          y: 5,
          width: 100,
          height: 100,
          shape: "rect",
        },
      ],
    });

    const [text, image, shape] = parsed.elements;
    expect(text.kind).toBe("text");
    if (text.kind === "text") {
      expect(text.align).toBe("center");
      expect(text.fontWeight).toBe(400);
      expect(text.lineHeight).toBeCloseTo(1.25);
      expect(text.rotation).toBe(0);
      expect(text.opacity).toBe(1);
    }
    if (image.kind === "image") {
      expect(image.fit).toBe("contain");
      expect(image.mask).toBe("none");
    }
    if (shape.kind === "shape") {
      expect(shape.fillColor).toBe("#000000");
      expect(shape.strokeWidthPx).toBe(0);
    }
  });

  it("rejects unknown element kinds", () => {
    const result = designDocSchema.safeParse({
      version: 1,
      background: { color: "#fff" },
      elements: [{ kind: "video", id: "v1", x: 0, y: 0, width: 10, height: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects documents with too many elements", () => {
    const element = {
      kind: "shape" as const,
      id: "s",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      shape: "rect" as const,
    };
    const doc: DesignDoc = {
      ...emptyDesignDoc(),
      elements: Array.from({ length: MAX_DESIGN_ELEMENTS + 1 }, (_, i) => ({
        ...element,
        id: `s${i}`,
        rotation: 0,
        opacity: 1,
        fillColor: "#000000",
        strokeColor: "#000000",
        strokeWidthPx: 0,
        cornerRadiusPx: 0,
      })),
    };
    expect(designDocSchema.safeParse(doc).success).toBe(false);
  });
});
