import { describe, expect, it } from "vitest";
import { CLIENT_VISIBLE_STATUSES, cabinetStatusFilterMembers } from "./cabinetOrdersList";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";

describe("cabinetStatusFilterMembers", () => {
  it("one status filters by itself", () => {
    for (const s of CLIENT_VISIBLE_STATUSES) expect(cabinetStatusFilterMembers(s)).toEqual([s]);
  });
  it("«Можно забрать» covers both ready states", () => {
    expect(cabinetStatusFilterMembers("pickup")).toEqual(["readyInWorkshop", "readyInStudio"]);
  });
  it("maps the pre-split values", () => {
    expect(cabinetStatusFilterMembers("inProgress")).toEqual(["accepted", "queued", "printing"]);
    expect(cabinetStatusFilterMembers("ready")).toEqual(["delivered"]);
  });
  it("empty / unknown = no filter", () => {
    expect(cabinetStatusFilterMembers("")).toBeNull();
    expect(cabinetStatusFilterMembers(null)).toBeNull();
    expect(cabinetStatusFilterMembers("toString")).toBeNull();
    expect(cabinetStatusFilterMembers("bogus")).toBeNull();
  });
  it("every status has a RU and RO label", () => {
    for (const s of CLIENT_VISIBLE_STATUSES) {
      expect(ru.clientStatuses[s]).toBeTruthy();
      expect(ro.clientStatuses[s]).toBeTruthy();
    }
    expect(ru.clientStatuses.accepted).toBe("Принят");
    expect(ru.clientStatuses.delivered).toBe("Выдан");
  });
});
