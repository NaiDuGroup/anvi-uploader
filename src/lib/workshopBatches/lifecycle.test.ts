import { describe, expect, it } from "vitest";
import {
  workshopBatchExpiryAt,
  workshopBatchLifecycleStatus,
} from "./lifecycle";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("workshopBatchExpiryAt", () => {
  it("adds exactly 7 days to the createdAt", () => {
    const createdAt = new Date("2026-01-10T08:00:00Z");
    const expiry = workshopBatchExpiryAt(createdAt);
    expect(expiry.getTime() - createdAt.getTime()).toBe(7 * ONE_DAY_MS);
  });
});

describe("workshopBatchLifecycleStatus", () => {
  it("reports full days remaining at day 0", () => {
    const createdAt = new Date("2026-01-10T08:00:00Z");
    const now = new Date("2026-01-10T08:00:00Z");
    expect(workshopBatchLifecycleStatus(createdAt, now)).toEqual({
      kind: "daysLeft",
      days: 7,
    });
  });

  it("reports expiresToday when < 24h left", () => {
    const createdAt = new Date("2026-01-10T08:00:00Z");
    const now = new Date("2026-01-16T20:00:00Z"); // 12h from expiry
    expect(workshopBatchLifecycleStatus(createdAt, now)).toEqual({
      kind: "expiresToday",
    });
  });

  it("reports expired after the 7-day window", () => {
    const createdAt = new Date("2026-01-10T08:00:00Z");
    const now = new Date("2026-01-17T09:00:00Z"); // past expiry
    expect(workshopBatchLifecycleStatus(createdAt, now)).toEqual({
      kind: "expired",
    });
  });
});
