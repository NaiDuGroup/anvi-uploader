import { describe, it, expect } from "vitest";
import { parseProductionCostsJson, inkMlPerSqmForPrintProcess } from "./types";

describe("parseProductionCostsJson", () => {
  it("merges legacy inkMlPerSqm into inkMlPerSqmLargeFormatRoll when new key absent", () => {
    const p = parseProductionCostsJson({
      mugPrintPerUnit: 1,
      inkMlPerSqm: 12.5,
    });
    expect(p.inkMlPerSqmLargeFormatRoll).toBe(12.5);
    expect(p.inkMlPerSqmUvRigid).toBe(0);
    expect(p.inkMlPerSqmDtfTextile).toBe(0);
  });

  it("prefers explicit inkMlPerSqmLargeFormatRoll over legacy", () => {
    const p = parseProductionCostsJson({
      inkMlPerSqm: 99,
      inkMlPerSqmLargeFormatRoll: 3,
    });
    expect(p.inkMlPerSqmLargeFormatRoll).toBe(3);
  });

  it("reads UV and DTF norms", () => {
    const p = parseProductionCostsJson({
      inkMlPerSqmUvRigid: 8,
      inkMlPerSqmDtfTextile: 15,
    });
    expect(p.inkMlPerSqmUvRigid).toBe(8);
    expect(p.inkMlPerSqmDtfTextile).toBe(15);
  });
});

describe("inkMlPerSqmForPrintProcess", () => {
  it("maps print processes to tank norms", () => {
    const p = parseProductionCostsJson({
      inkMlPerSqmLargeFormatRoll: 1,
      inkMlPerSqmUvRigid: 2,
      inkMlPerSqmDtfTextile: 3,
    });
    expect(inkMlPerSqmForPrintProcess(p, "large_format_roll")).toBe(1);
    expect(inkMlPerSqmForPrintProcess(p, "uv_rigid")).toBe(2);
    expect(inkMlPerSqmForPrintProcess(p, "dtf_textile")).toBe(3);
  });
});
