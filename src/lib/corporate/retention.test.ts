import { describe, expect, it } from "vitest";
import { CORPORATE_IP_RETENTION_MONTHS, corporateIpEraseArgs, corporateIpRetentionCutoff } from "./retention";

describe("corporate request IP retention", () => {
  it("keeps 12 months", () => {
    expect(CORPORATE_IP_RETENTION_MONTHS).toBe(12);
  });

  it("cuts off exactly 12 calendar months before now (UTC)", () => {
    expect(corporateIpRetentionCutoff(new Date("2026-11-05T03:45:12.345Z"))).toEqual(new Date("2025-11-05T03:45:12.345Z"));
    expect(corporateIpRetentionCutoff(new Date("2027-01-31T00:00:00.000Z"))).toEqual(new Date("2026-01-31T00:00:00.000Z"));
  });

  it("clamps a missing day to the month's last day", () => {
    expect(corporateIpRetentionCutoff(new Date("2028-02-29T12:00:00.000Z"))).toEqual(new Date("2027-02-28T12:00:00.000Z"));
    expect(corporateIpRetentionCutoff(new Date("2026-03-31T00:00:00.000Z"), 1)).toEqual(new Date("2026-02-28T00:00:00.000Z"));
  });

  it("crosses the year backwards for other spans", () => {
    expect(corporateIpRetentionCutoff(new Date("2026-02-15T00:00:00.000Z"), 3)).toEqual(new Date("2025-11-15T00:00:00.000Z"));
    expect(corporateIpRetentionCutoff(new Date("2026-02-15T00:00:00.000Z"), 0)).toEqual(new Date("2026-02-15T00:00:00.000Z"));
  });

  it("only touches older rows that still hold an IP or user agent", () => {
    expect(corporateIpEraseArgs(new Date("2026-11-05T03:45:00.000Z"))).toEqual({
      where: {
        createdAt: { lt: new Date("2025-11-05T03:45:00.000Z") },
        OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
      },
      data: { ip: null, userAgent: null },
    });
  });
});
