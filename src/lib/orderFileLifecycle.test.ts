import { describe, expect, it } from "vitest";
import {
  ORDER_FILE_LIFECYCLE_DAYS,
  computeLifecycleStatus,
  parseOrderFileExpiryAt,
  parseOrderFileUploadedAt,
} from "./orderFileLifecycle";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

describe("parseOrderFileUploadedAt", () => {
  it("returns null for empty input", () => {
    expect(parseOrderFileUploadedAt("")).toBeNull();
  });

  it("returns null for absolute http(s) URLs (external links)", () => {
    expect(parseOrderFileUploadedAt("https://drive.google.com/file/abc")).toBeNull();
    expect(parseOrderFileUploadedAt("http://example.com/x.pdf")).toBeNull();
  });

  it("returns null for catalog/company keys (different bucket, no lifecycle)", () => {
    expect(parseOrderFileUploadedAt("catalog/mugs/1701234567890-abc-photo.png")).toBeNull();
    expect(parseOrderFileUploadedAt("company/logo/1701234567890-abc-logo.png")).toBeNull();
  });

  it("returns null when the timestamp prefix is missing or malformed", () => {
    expect(parseOrderFileUploadedAt("uploads/no-timestamp-here.pdf")).toBeNull();
    expect(parseOrderFileUploadedAt("uploads/123-short-ts.pdf")).toBeNull();
    expect(parseOrderFileUploadedAt("uploads/")).toBeNull();
  });

  it("parses the leading 13-digit timestamp from a valid uploads key", () => {
    const result = parseOrderFileUploadedAt("uploads/1701234567890-abc12345-document.pdf");
    expect(result).toEqual(new Date(1701234567890));
  });

  it("tolerates an accidental leading slash on the key", () => {
    const result = parseOrderFileUploadedAt("/uploads/1701234567890-abc12345-doc.pdf");
    expect(result).toEqual(new Date(1701234567890));
  });
});

describe("parseOrderFileExpiryAt", () => {
  it("returns null when the key is not parseable", () => {
    expect(parseOrderFileExpiryAt("https://example.com/x")).toBeNull();
  });

  it("returns uploadedAt + ORDER_FILE_LIFECYCLE_DAYS for a valid key", () => {
    const uploadedAtMs = 1701234567890;
    const result = parseOrderFileExpiryAt(
      `uploads/${uploadedAtMs}-abc12345-document.pdf`,
    );
    expect(result).toEqual(
      new Date(uploadedAtMs + ORDER_FILE_LIFECYCLE_DAYS * ONE_DAY_MS),
    );
  });
});

describe("computeLifecycleStatus", () => {
  it("reports 'expired' when the expiry is in the past", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date("2026-01-10T11:59:59Z");
    expect(computeLifecycleStatus(expiry, now)).toEqual({ kind: "expired" });
  });

  it("reports 'expired' exactly at expiry (msLeft === 0)", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(computeLifecycleStatus(now, now)).toEqual({ kind: "expired" });
  });

  it("reports 'expiresToday' when less than 24 hours remain", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date(now.getTime() + 12 * ONE_HOUR_MS);
    expect(computeLifecycleStatus(expiry, now)).toEqual({ kind: "expiresToday" });
  });

  it("reports 'expiresToday' at exactly 1 second under 24 hours", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date(now.getTime() + 24 * ONE_HOUR_MS - 1000);
    expect(computeLifecycleStatus(expiry, now)).toEqual({ kind: "expiresToday" });
  });

  it("reports 1 day left at exactly 24 hours remaining", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date(now.getTime() + 24 * ONE_HOUR_MS);
    expect(computeLifecycleStatus(expiry, now)).toEqual({ kind: "daysLeft", days: 1 });
  });

  it("rounds DOWN to full days (never optimistic)", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date(now.getTime() + (5 * ONE_DAY_MS + 23 * ONE_HOUR_MS));
    expect(computeLifecycleStatus(expiry, now)).toEqual({ kind: "daysLeft", days: 5 });
  });

  it("reports the full lifecycle window immediately after upload", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const expiry = new Date(now.getTime() + ORDER_FILE_LIFECYCLE_DAYS * ONE_DAY_MS);
    expect(computeLifecycleStatus(expiry, now)).toEqual({
      kind: "daysLeft",
      days: ORDER_FILE_LIFECYCLE_DAYS,
    });
  });
});
