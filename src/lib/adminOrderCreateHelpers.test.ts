import { describe, it, expect } from "vitest";
import { createAdminOrderSchema } from "./validations";
import { normalizeAdminOrderLineInputs } from "./adminOrderCreateHelpers";

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
});
