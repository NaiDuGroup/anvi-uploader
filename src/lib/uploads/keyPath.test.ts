import { describe, expect, it } from "vitest";
import { hasDotSegment, isSafeKeyPath } from "./keyPath";

describe("hasDotSegment", () => {
  it("allows dots inside a file name", () => {
    expect(hasDotSegment("a..png")).toBe(false);
    expect(hasDotSegment("uploads/1700000000000-abcdefgh-name....png")).toBe(false);
    expect(hasDotSegment("uploads/...hidden")).toBe(false);
  });

  it("finds `.` / `..` segments split on / and \\", () => {
    expect(hasDotSegment("uploads/../x")).toBe(true);
    expect(hasDotSegment("uploads/..")).toBe(true);
    expect(hasDotSegment("../x")).toBe(true);
    expect(hasDotSegment("..\\x")).toBe(true);
    expect(hasDotSegment("uploads/./x")).toBe(true);
    expect(hasDotSegment("..")).toBe(true);
  });
});

describe("isSafeKeyPath", () => {
  it("accepts keys with double-dot file names", () => {
    expect(isSafeKeyPath("a..png")).toBe(true);
    expect(isSafeKeyPath("uploads/1700000000000-abcdefgh-DTF_spate_ A3_tricou_negru_L....png")).toBe(true);
  });

  it("rejects traversal, backslashes and control characters", () => {
    expect(isSafeKeyPath("uploads/../x")).toBe(false);
    expect(isSafeKeyPath("uploads/..")).toBe(false);
    expect(isSafeKeyPath("..\\x")).toBe(false);
    expect(isSafeKeyPath("uploads/a\\b.png")).toBe(false);
    expect(isSafeKeyPath("uploads/a\u0000.png")).toBe(false);
  });
});
