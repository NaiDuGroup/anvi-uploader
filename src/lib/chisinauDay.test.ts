import { describe, expect, it } from "vitest";
import { chisinauDayEndExclusive, chisinauDayStart } from "./chisinauDay";

describe("chisinauDayStart / chisinauDayEndExclusive", () => {
  it("winter day starts at 22:00Z the day before", () => {
    expect(chisinauDayStart("2026-11-09")?.toISOString()).toBe("2026-11-08T22:00:00.000Z");
    expect(chisinauDayEndExclusive("2026-11-09")?.toISOString()).toBe("2026-11-09T22:00:00.000Z");
  });

  it("summer day starts at 21:00Z the day before", () => {
    expect(chisinauDayStart("2026-07-15")?.toISOString()).toBe("2026-07-14T21:00:00.000Z");
    expect(chisinauDayEndExclusive("2026-07-15")?.toISOString()).toBe("2026-07-15T21:00:00.000Z");
  });

  it("spring-forward day (23 h) ends at the next summer midnight", () => {
    expect(chisinauDayStart("2026-03-29")?.toISOString()).toBe("2026-03-28T22:00:00.000Z");
    expect(chisinauDayEndExclusive("2026-03-29")?.toISOString()).toBe("2026-03-29T21:00:00.000Z");
  });

  it("fall-back day (25 h) ends at the next winter midnight", () => {
    expect(chisinauDayStart("2026-10-25")?.toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(chisinauDayEndExclusive("2026-10-25")?.toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });

  it("an order at 00:23 Chișinău on 09.11 falls into 09.11, not 08.11", () => {
    const created = new Date("2026-11-08T22:23:00Z");
    expect(created >= chisinauDayStart("2026-11-09")!).toBe(true);
    expect(created < chisinauDayEndExclusive("2026-11-08")!).toBe(false);
  });

  it("rejects invalid input", () => {
    expect(chisinauDayStart("")).toBeNull();
    expect(chisinauDayStart("2026-02-30")).toBeNull();
    expect(chisinauDayEndExclusive("09.11.2026")).toBeNull();
    expect(chisinauDayEndExclusive(undefined)).toBeNull();
  });
});
