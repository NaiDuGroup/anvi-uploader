import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRINT_PROCESS,
  parsePrintProcess,
  printProcessForProductType,
} from "./printProcess";

describe("parsePrintProcess", () => {
  it("defaults legacy / invalid values to large_format_roll", () => {
    expect(parsePrintProcess(undefined)).toBe(DEFAULT_PRINT_PROCESS);
    expect(parsePrintProcess("nope")).toBe(DEFAULT_PRINT_PROCESS);
  });

  it("accepts valid codes", () => {
    expect(parsePrintProcess("uv_rigid")).toBe("uv_rigid");
    expect(parsePrintProcess("dtf_textile")).toBe("dtf_textile");
  });
});

describe("printProcessForProductType", () => {
  it("maps catalog families to ink lines", () => {
    expect(printProcessForProductType("large_format_print")).toBe("large_format_roll");
    expect(printProcessForProductType("notebook")).toBe("uv_rigid");
    expect(printProcessForProductType("mug")).toBe("uv_rigid");
  });
});
