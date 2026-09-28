import { describe, it, expect } from "vitest";
import { createAdminOrderSchema } from "./validations";
import {
  expandToOneFilePerLine,
  MAX_ORDER_LINES,
  normalizeAdminOrderLineInputs,
  OrderLineLimitError,
} from "./adminOrderCreateHelpers";

const validFile = {
  fileName: "a.pdf",
  fileUrl: "uploads/k",
  copies: 1,
  color: "bw" as const,
  paperType: "A4",
};

describe("normalizeAdminOrderLineInputs", () => {
  it("returns lines as-is when lines are present", () => {
    const validated = createAdminOrderSchema.parse({
      phone: "+37379123456",
      lines: [
        {
          productType: "paper_print",
          files: [validFile],
        },
        {
          productType: "mug",
          mugOther: true,
          files: [validFile],
        },
      ],
    });
    const out = normalizeAdminOrderLineInputs(validated);
    expect(out).toHaveLength(2);
    expect(out[0].productType).toBe("paper_print");
    expect(out[1].mugOther).toBe(true);
  });

  it("builds single synthetic line from legacy body", () => {
    const validated = createAdminOrderSchema.parse({
      phone: "+37379123456",
      productType: "paper_print",
      files: [validFile],
    });
    const out = normalizeAdminOrderLineInputs(validated);
    expect(out).toHaveLength(1);
    expect(out[0].productType).toBe("paper_print");
    expect(out[0].files).toEqual([validFile]);
  });

  it("defaults productType to paper_print when legacy omits it", () => {
    const validated = createAdminOrderSchema.parse({
      phone: "+37379123456",
      files: [validFile],
    });
    const out = normalizeAdminOrderLineInputs(validated);
    expect(out[0].productType).toBe("paper_print");
  });

  it("splits a legacy body with several files into one line each", () => {
    const second = { ...validFile, fileName: "b.pdf", copies: 3 };
    const validated = createAdminOrderSchema.parse({
      phone: "+37379123456",
      productType: "paper_print",
      files: [validFile, second],
    });
    const out = normalizeAdminOrderLineInputs(validated);
    expect(out).toHaveLength(2);
    expect(out[0].files).toEqual([validFile]);
    expect(out[1].files).toEqual([second]);
  });
});

const lfFile = {
  fileName: "photo.jpg",
  fileUrl: "uploads/photo",
  copies: 1,
  color: "color" as const,
  paperType: "large_format",
};

describe("expandToOneFilePerLine", () => {
  it("leaves a single-file line untouched", () => {
    const line = {
      productType: "large_format_print" as const,
      quantity: 5,
      files: [{ ...lfFile, copies: 5 }],
    };
    const out = expandToOneFilePerLine([line]);
    expect(out).toEqual([line]);
  });

  it("splits large format so each file's copies become that line's quantity", () => {
    const files = [
      { ...lfFile, fileName: "a.jpg", copies: 1 },
      { ...lfFile, fileName: "b.jpg", copies: 1 },
      { ...lfFile, fileName: "c.jpg", copies: 2 },
    ];
    const out = expandToOneFilePerLine([
      {
        productType: "large_format_print" as const,
        quantity: 1,
        largeFormatMaterialId: "mat",
        printWidthCm: 42,
        printHeightCm: 52,
        files,
      },
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((l) => l.quantity)).toEqual([1, 1, 2]);
    expect(out.map((l) => l.files[0]?.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(out.every((l) => l.printWidthCm === 42 && l.largeFormatMaterialId === "mat")).toBe(
      true,
    );
  });

  it("keeps paper copies on each file and does not invent a quantity", () => {
    const out = expandToOneFilePerLine([
      {
        productType: "paper_print" as const,
        files: [validFile, { ...validFile, fileName: "b.pdf", copies: 4 }],
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.files).toEqual([validFile]);
    expect(out[1]?.files[0]?.copies).toBe(4);
  });

  it("keeps the original order line id on the first file only", () => {
    const out = expandToOneFilePerLine([
      {
        productType: "paper_print" as const,
        orderLineId: "line-1",
        files: [validFile, { ...validFile, fileName: "b.pdf" }],
      },
    ]);
    expect(out[0]?.orderLineId).toBe("line-1");
    expect(out[1]?.orderLineId).toBeUndefined();
  });

  it("rejects more positions than the cap", () => {
    const files = Array.from({ length: MAX_ORDER_LINES + 1 }, (_, i) => ({
      ...validFile,
      fileName: `${i}.pdf`,
    }));
    expect(() =>
      expandToOneFilePerLine([{ productType: "paper_print" as const, files }]),
    ).toThrow(OrderLineLimitError);
  });
});
