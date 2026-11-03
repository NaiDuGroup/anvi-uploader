import { describe, expect, it } from "vitest";
import { toCabinetStatusTimeline } from "./cabinetOrderTimeline";

const d = (s: string) => new Date(`2026-11-0${s}Z`);

describe("toCabinetStatusTimeline", () => {
  it("collapses internal statuses into client-visible steps", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "IN_PROGRESS", createdAt: d("1T11:00:00") },
      { newValue: "SENT_TO_WORKSHOP", createdAt: d("1T12:00:00") },
      { newValue: "WORKSHOP_READY", createdAt: d("2T09:00:00") },
      { newValue: "RETURNED_TO_STUDIO", createdAt: d("2T15:00:00") },
      { newValue: "DELIVERED", createdAt: d("3T10:00:00") },
    ]);
    expect(steps.map((s) => s.status)).toEqual([
      "inProgress",
      "readyInWorkshop",
      "readyInStudio",
      "ready",
    ]);
    expect(steps[1].at).toBe("2026-11-02T09:00:00.000Z");
  });

  it("sorts by time, skips empty values and keeps an issue → back to work cycle", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "IN_PROGRESS", createdAt: d("1T13:00:00") },
      { newValue: "ISSUE", createdAt: d("1T12:00:00") },
      { newValue: null, createdAt: d("1T12:30:00") },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["inProgress", "issue", "inProgress"]);
    expect(Object.keys(steps[0]).sort()).toEqual(["at", "status"]);
  });
});
