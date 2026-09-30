import { describe, expect, it } from "vitest";
import {
  buildBatchStorageKey,
  isWorkshopBatchKey,
  sanitizeBatchFileName,
} from "./storageKey";

describe("sanitizeBatchFileName", () => {
  it("keeps Unicode letters and numbers", () => {
    expect(sanitizeBatchFileName("notebook-batch_negru_roșu.png")).toBe(
      "notebook-batch_negru_roșu.png",
    );
  });

  it("collapses forbidden characters into single dashes", () => {
    expect(sanitizeBatchFileName("weird  name @@@ !!!.png")).toBe(
      "weird-name-.png",
    );
  });

  it("trims stray separators from both ends", () => {
    expect(sanitizeBatchFileName("---__batch.png__---")).toBe("batch.png");
  });

  it("truncates very long names but preserves a suffix", () => {
    const long = `${"a".repeat(200)}.png`;
    const out = sanitizeBatchFileName(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.startsWith("a")).toBe(true);
  });

  it("falls back when the name would collapse to empty", () => {
    expect(sanitizeBatchFileName("###")).toBe("batch.png");
    expect(sanitizeBatchFileName("")).toBe("batch.png");
  });
});

describe("buildBatchStorageKey", () => {
  it("nests inside uploads/workshop-batches with a stable shape", () => {
    const key = buildBatchStorageKey({
      timestampMs: 1738000000000,
      nanoid: "abcd1234",
      fileName: "pen-batch_rosu_2026-01-01.png",
    });
    expect(key).toBe(
      "uploads/workshop-batches/1738000000000-abcd1234-pen-batch_rosu_2026-01-01.png",
    );
  });

  it("still starts with uploads/ (R2 lifecycle prefix)", () => {
    const key = buildBatchStorageKey({
      timestampMs: 1,
      nanoid: "x",
      fileName: "a.png",
    });
    expect(key.startsWith("uploads/")).toBe(true);
  });
});

describe("isWorkshopBatchKey", () => {
  it("recognises our own keys", () => {
    expect(
      isWorkshopBatchKey("uploads/workshop-batches/123-abc-x.png"),
    ).toBe(true);
  });

  it("rejects generic order uploads and catalog assets", () => {
    expect(isWorkshopBatchKey("uploads/123-abc-x.png")).toBe(false);
    expect(
      isWorkshopBatchKey("catalog/mugs/abc.png"),
    ).toBe(false);
    expect(isWorkshopBatchKey("")).toBe(false);
  });
});
