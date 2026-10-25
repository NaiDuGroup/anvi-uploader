import { describe, expect, it } from "vitest";
import {
  categoryCodeForRole,
  formatUnitCost,
  isPrinterConsumableCategory,
  isPrinterSlotRole,
  percentInputToShare,
  printerFooterKind,
  printerSlotCreateSchema,
  printerSlotUpdateSchema,
  printerUpdateSchema,
  shareSum,
  shareSumProblem,
  shareToPercent,
  sheetsInputToYield,
  slotChipColor,
  slotFieldRoleProblem,
  variantFitsRole,
} from "./printerAdmin";
import { PrinterSlotRole } from "./printerMath";

const UUID = "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b";

describe("slot role ↔ category", () => {
  it("maps each role to its consumable category", () => {
    expect(categoryCodeForRole(PrinterSlotRole.Ink)).toBe("ink");
    expect(categoryCodeForRole(PrinterSlotRole.Toner)).toBe("toner");
    expect(categoryCodeForRole(PrinterSlotRole.Film)).toBe("dtf_film");
    expect(categoryCodeForRole(PrinterSlotRole.Powder)).toBe("dtf_powder");
    expect(categoryCodeForRole(PrinterSlotRole.Paper)).toBe("sublimation_paper");
    expect(categoryCodeForRole(PrinterSlotRole.Tape)).toBe("thermal_tape");
  });

  it("accepts only variants from the matching category", () => {
    expect(variantFitsRole(PrinterSlotRole.Ink, "ink")).toBe(true);
    expect(variantFitsRole(PrinterSlotRole.Ink, "toner")).toBe(false);
    expect(variantFitsRole(PrinterSlotRole.Film, "dtf_powder")).toBe(false);
    expect(variantFitsRole(PrinterSlotRole.Powder, "dtf_powder")).toBe(true);
    expect(variantFitsRole(PrinterSlotRole.Toner, "tshirts")).toBe(false);
  });

  it("recognises roles and consumable categories", () => {
    expect(isPrinterSlotRole("ink")).toBe(true);
    expect(isPrinterSlotRole("paper")).toBe(true);
    expect(isPrinterSlotRole("tape")).toBe(true);
    expect(isPrinterSlotRole("ribbon")).toBe(false);
    expect(isPrinterConsumableCategory("dtf_film")).toBe(true);
    expect(isPrinterConsumableCategory("sublimation_paper")).toBe(true);
    expect(isPrinterConsumableCategory("thermal_tape")).toBe(true);
    expect(isPrinterConsumableCategory("tshirts")).toBe(false);
  });

  it("flags share on non-ink and yield on non-toner slots", () => {
    expect(slotFieldRoleProblem(PrinterSlotRole.Ink, { share: 0.2 })).toBeNull();
    expect(slotFieldRoleProblem(PrinterSlotRole.Toner, { share: 0.2 })).toBe("share");
    expect(slotFieldRoleProblem(PrinterSlotRole.Toner, { sheetsPerUnit: 8000 })).toBeNull();
    expect(slotFieldRoleProblem(PrinterSlotRole.Ink, { sheetsPerUnit: 8000 })).toBe("sheetsPerUnit");
    expect(slotFieldRoleProblem(PrinterSlotRole.Film, { share: null, sheetsPerUnit: null })).toBeNull();
  });
});

describe("share sum", () => {
  it("sums shares, unset counts as zero", () => {
    expect(shareSum([0.25, 0.25, null, 0.5])).toBeCloseTo(1);
  });

  it("reports under / over 100 %", () => {
    expect(shareSumProblem([0.125, 0.125, 0.125, 0.125, 0.5])).toBeNull();
    expect(shareSumProblem([0.2, 0.2, 0.2, 0.2, 0.15, 0.05])).toBeNull();
    expect(shareSumProblem([0.25, 0.25, 0.25])).toBe("under");
    expect(shareSumProblem([0.5, 0.6])).toBe("over");
    expect(shareSumProblem([null, null])).toBe("under");
    expect(shareSumProblem([])).toBeNull();
  });
});

describe("input parsing", () => {
  it("converts percent input to a 0–1 share", () => {
    expect(percentInputToShare("12,5")).toBe(0.125);
    expect(percentInputToShare("25 %")).toBe(0.25);
    expect(percentInputToShare("")).toBeNull();
    expect(percentInputToShare("101")).toBeUndefined();
    expect(percentInputToShare("-1")).toBeUndefined();
    expect(percentInputToShare("abc")).toBeUndefined();
  });

  it("shows shares as percent", () => {
    expect(shareToPercent(0.125)).toBe(12.5);
    expect(shareToPercent(0.05)).toBe(5);
    expect(shareToPercent(null)).toBeNull();
  });

  it("accepts whole-sheet yields ≥ 1", () => {
    expect(sheetsInputToYield("15 000")).toBe(15000);
    expect(sheetsInputToYield("")).toBeNull();
    expect(sheetsInputToYield("0")).toBeUndefined();
    expect(sheetsInputToYield("12.5")).toBeUndefined();
  });
});

describe("cost display", () => {
  it("keeps more digits for small unit costs", () => {
    expect(formatUnitCost(12.5)).toBe("12.50");
    expect(formatUnitCost(0.456)).toBe("0.456");
    expect(formatUnitCost(0.00412)).toBe("0.0041");
    expect(formatUnitCost(0)).toBe("0.00");
    expect(formatUnitCost(null)).toBe("—");
  });

  it("picks the printer footer by slot roles", () => {
    expect(printerFooterKind([{ role: PrinterSlotRole.Ink }, { role: PrinterSlotRole.Film }])).toBe("ink");
    expect(printerFooterKind([{ role: PrinterSlotRole.Toner }])).toBe("toner");
    expect(printerFooterKind([{ role: PrinterSlotRole.Film }])).toBeNull();
  });

  it("colours CMYK / White / Varnish chips only", () => {
    expect(slotChipColor("Cyan")).toBe("#00AEEF");
    expect(slotChipColor("K")).toBe("#231F20");
    expect(slotChipColor("Light Cyan")).toBe("#7FD6F7");
    expect(slotChipColor("Light Magenta")).toBe("#F59AC9");
    expect(slotChipColor("Бумага")).toBeNull();
    expect(slotChipColor("White")).toBe("#FFFFFF");
    expect(slotChipColor("Лак")).toBe("#E5E7EB");
    expect(slotChipColor("Плёнка")).toBeNull();
    expect(slotChipColor("Clear")).toBeNull();
  });
});

describe("schemas", () => {
  it("validates slot patches", () => {
    expect(printerSlotUpdateSchema.parse({ share: 0.2 })).toEqual({ share: 0.2 });
    expect(printerSlotUpdateSchema.parse({ variantId: null, sheetsPerUnit: null })).toEqual({
      variantId: null,
      sheetsPerUnit: null,
    });
    expect(printerSlotUpdateSchema.safeParse({ share: 1.2 }).success).toBe(false);
    expect(printerSlotUpdateSchema.safeParse({ sheetsPerUnit: 0 }).success).toBe(false);
    expect(printerSlotUpdateSchema.safeParse({ sheetsPerUnit: 12.5 }).success).toBe(false);
    expect(printerSlotUpdateSchema.safeParse({ variantId: "nope" }).success).toBe(false);
    expect(printerSlotUpdateSchema.safeParse({ label: "  " }).success).toBe(false);
    expect(printerSlotUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates new slots", () => {
    expect(printerSlotCreateSchema.parse({ label: " Light Cyan ", role: "ink", variantId: UUID })).toEqual({
      label: "Light Cyan",
      role: "ink",
      variantId: UUID,
    });
    expect(printerSlotCreateSchema.safeParse({ label: "X", role: "ribbon" }).success).toBe(false);
    expect(printerSlotCreateSchema.safeParse({ label: "Бумага", role: "paper" }).success).toBe(true);
    expect(printerSlotCreateSchema.safeParse({ role: "ink" }).success).toBe(false);
  });

  it("validates printer patches", () => {
    expect(printerUpdateSchema.parse({ name: " Ricoh ", isActive: false })).toEqual({ name: "Ricoh", isActive: false });
    expect(printerUpdateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(printerUpdateSchema.safeParse({}).success).toBe(false);
  });
});
