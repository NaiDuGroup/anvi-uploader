import { describe, expect, it } from "vitest";
import { ru } from "@/lib/i18n/ru";
import { orderLineSummaryText } from "./OrderLineStatusBadges";

const lines = (...s: string[]) => s.map((productionStatus) => ({ productionStatus }));

describe("orderLineSummaryText (admin list)", () => {
  it("«Печатается · готово 1 из 3» for a mixed workshop order", () => {
    expect(orderLineSummaryText({ status: "WORKSHOP_PRINTING", orderLines: lines("DONE", "WAITING", "PRINTING") }, ru)).toBe(
      "Печатается · готово 1 из 3",
    );
    expect(orderLineSummaryText({ status: "WORKSHOP_PRINTING", orderLines: lines("DONE", "WAITING") }, ru)).toBe(
      "Печатается · готово 1 из 2",
    );
  });

  it("nothing when all lines agree, for one line, or outside the workshop phase", () => {
    expect(orderLineSummaryText({ status: "WORKSHOP_PRINTING", orderLines: lines("PRINTING", "PRINTING") }, ru)).toBeNull();
    expect(orderLineSummaryText({ status: "SENT_TO_WORKSHOP", orderLines: lines("WAITING", "WAITING") }, ru)).toBeNull();
    expect(orderLineSummaryText({ status: "WORKSHOP_PRINTING", orderLines: lines("PRINTING") }, ru)).toBeNull();
    expect(orderLineSummaryText({ status: "DELIVERED", orderLines: lines("DONE", "WAITING") }, ru)).toBeNull();
    expect(orderLineSummaryText({ status: "IN_PROGRESS" }, ru)).toBeNull();
  });
});
