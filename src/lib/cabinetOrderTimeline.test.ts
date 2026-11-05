import { describe, expect, it } from "vitest";
import { toCabinetStatusTimeline } from "./cabinetOrderTimeline";

const d = (s: string) => new Date(`2026-11-0${s}Z`);

describe("toCabinetStatusTimeline", () => {
  it("keeps every client step apart: accepted, queued, printing, workshop, moved to studio, delivered", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "IN_PROGRESS", createdAt: d("1T11:00:00") },
      { newValue: "SENT_TO_WORKSHOP", createdAt: d("1T12:00:00") },
      { newValue: "WORKSHOP_PRINTING", createdAt: d("1T14:00:00") },
      { newValue: "WORKSHOP_READY", createdAt: d("2T09:00:00") },
      { newValue: "RETURNED_TO_STUDIO", createdAt: d("2T15:00:00") },
      { newValue: "DELIVERED", createdAt: d("3T10:00:00") },
    ]);
    expect(steps.map((s) => s.status)).toEqual([
      "accepted",
      "queued",
      "printing",
      "readyInWorkshop",
      "readyInStudio",
      "delivered",
    ]);
    expect(steps[3].at).toBe("2026-11-02T09:00:00.000Z");
    expect(steps[4].movedFromWorkshop).toBe(true);
    expect(steps.filter((s) => s.movedFromWorkshop)).toHaveLength(1);
  });

  it("WORKSHOP_READY → READY_IN_STUDIO is a move from the workshop too", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "WORKSHOP_READY", createdAt: d("1T11:00:00") },
      { newValue: "READY_IN_STUDIO", createdAt: d("1T12:00:00") },
    ]);
    expect(steps.map((s) => [s.status, s.movedFromWorkshop ?? false])).toEqual([
      ["accepted", false],
      ["readyInWorkshop", false],
      ["readyInStudio", true],
    ]);
  });

  it("an order finished in the studio is plain «ready at the studio»", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "IN_PROGRESS", createdAt: d("1T11:00:00") },
      { newValue: "READY_IN_STUDIO", createdAt: d("1T12:00:00") },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["accepted", "readyInStudio"]);
    expect(steps[1]).not.toHaveProperty("movedFromWorkshop");
  });

  it("sorts by time, skips empty values and keeps an issue → back to work cycle", () => {
    const steps = toCabinetStatusTimeline(d("1T10:00:00"), [
      { newValue: "IN_PROGRESS", createdAt: d("1T13:00:00") },
      { newValue: "ISSUE", createdAt: d("1T12:00:00") },
      { newValue: null, createdAt: d("1T12:30:00") },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["accepted", "issue", "accepted"]);
    expect(Object.keys(steps[0]).sort()).toEqual(["at", "status"]);
  });

  it("starts from the status the order was created in", () => {
    // Dealer cabinet orders are created «SENT_TO_WORKSHOP» with no log row.
    expect(toCabinetStatusTimeline(d("1T10:00:00"), [], "SENT_TO_WORKSHOP").map((s) => s.status)).toEqual(["queued"]);
    const steps = toCabinetStatusTimeline(
      d("1T10:00:00"),
      [{ oldValue: "SENT_TO_WORKSHOP", newValue: "WORKSHOP_PRINTING", createdAt: d("1T11:00:00") }],
      "WORKSHOP_PRINTING",
    );
    expect(steps.map((s) => s.status)).toEqual(["queued", "printing"]);
    expect(toCabinetStatusTimeline(d("1T10:00:00"), []).map((s) => s.status)).toEqual(["accepted"]);
  });
});
