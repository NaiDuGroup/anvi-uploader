import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENTS,
  activeAnnouncementIds,
  announcementsForRole,
  hintKey,
  isHintVisible,
  isKnownSeenKey,
  pendingAnnouncementIds,
  stepsForRole,
  type Announcement,
} from "./announcements";
import { announcementsEn } from "./i18n/announcements/en";
import { announcementsRo } from "./i18n/announcements/ro";
import { announcementsRu } from "./i18n/announcements/ru";

const LIST: Announcement[] = [
  {
    id: "old",
    startsAt: "2026-10-01T00:00:00Z",
    until: "2026-10-15T00:00:00Z",
    roles: ["admin", "superadmin", "workshop"],
    steps: [{ key: "a", icon: "bookmarkPlus" }],
  },
  {
    id: "a",
    startsAt: "2026-11-01T00:00:00Z",
    until: "2026-12-01T00:00:00Z",
    roles: ["admin", "superadmin", "workshop"],
    steps: [
      { key: "one", icon: "bookmarkPlus" },
      { key: "two", icon: "repeat", roles: ["admin", "superadmin"] },
    ],
    hints: ["h"],
  },
  {
    id: "b",
    startsAt: "2026-11-05T00:00:00Z",
    until: "2026-12-01T00:00:00Z",
    roles: ["superadmin"],
    steps: [],
  },
  {
    id: "future",
    startsAt: "2026-12-10T00:00:00Z",
    until: "2027-01-01T00:00:00Z",
    roles: ["admin", "superadmin", "workshop"],
    steps: [],
  },
];

const NOW = new Date("2026-11-08T12:00:00Z");

describe("announcements registry", () => {
  it("shows active ones for the role, oldest first, minus seen", () => {
    expect(pendingAnnouncementIds("superadmin", [], NOW, LIST)).toEqual(["a", "b"]);
    expect(pendingAnnouncementIds("superadmin", ["a"], NOW, LIST)).toEqual(["b"]);
    expect(pendingAnnouncementIds("admin", [], NOW, LIST)).toEqual(["a"]);
    expect(pendingAnnouncementIds("workshop", ["a"], NOW, LIST)).toEqual([]);
  });

  it("never shows anything to customers / dealers / unknown roles", () => {
    expect(pendingAnnouncementIds("customer", [], NOW, LIST)).toEqual([]);
    expect(announcementsForRole("customer", NOW, LIST)).toEqual([]);
  });

  it("respects the date window (startsAt inclusive, until exclusive)", () => {
    expect(activeAnnouncementIds("admin", new Date("2026-11-01T00:00:00Z"), LIST)).toEqual(["a"]);
    expect(activeAnnouncementIds("admin", new Date("2026-12-01T00:00:00Z"), LIST)).toEqual([]);
    expect(activeAnnouncementIds("admin", new Date("2026-10-31T23:59:59Z"), LIST)).toEqual([]);
  });

  it("lists started ones (seen and expired too) newest first, without future ones", () => {
    expect(announcementsForRole("admin", NOW, LIST).map((a) => a.id)).toEqual(["a", "old"]);
    expect(announcementsForRole("superadmin", NOW, LIST).map((a) => a.id)).toEqual(["b", "a", "old"]);
  });

  it("drops role-limited steps", () => {
    expect(stepsForRole(LIST[1], "admin").map((s) => s.key)).toEqual(["one", "two"]);
    expect(stepsForRole(LIST[1], "workshop").map((s) => s.key)).toEqual(["one"]);
  });

  it("shows a hint while active and not used", () => {
    const active = activeAnnouncementIds("admin", NOW, LIST);
    expect(isHintVisible("a", "h", active, [], LIST)).toBe(true);
    // Seeing the modal doesn't hide the hint — using the feature does.
    expect(isHintVisible("a", "h", active, ["a"], LIST)).toBe(true);
    expect(isHintVisible("a", "h", active, [hintKey("a", "h")], LIST)).toBe(false);
    expect(isHintVisible("a", "h", [], [], LIST)).toBe(false);
    expect(isHintVisible("a", "nope", active, [], LIST)).toBe(false);
  });

  it("accepts only known seen keys", () => {
    expect(isKnownSeenKey("a", LIST)).toBe(true);
    expect(isKnownSeenKey("a:h", LIST)).toBe(true);
    expect(isKnownSeenKey("a:x", LIST)).toBe(false);
    expect(isKnownSeenKey("zzz", LIST)).toBe(false);
  });

  it("has the library announcement for all staff, workshop without «Повторить заказ»", () => {
    const lib = ANNOUNCEMENTS.find((a) => a.id === "library-2026-11")!;
    expect(lib.roles).toEqual(["admin", "superadmin", "workshop"]);
    expect(stepsForRole(lib, "workshop").map((s) => s.key)).toEqual(["save", "insert"]);
    expect(pendingAnnouncementIds("workshop", [], NOW)).toContain("library-2026-11");
    expect(pendingAnnouncementIds("admin", [], new Date("2026-12-02T00:00:00Z"))).not.toContain("library-2026-11");
    expect(isKnownSeenKey("library-2026-11:save-hint")).toBe(true);
  });
});

describe("announcement texts", () => {
  it("have a text for every registry step in every language", () => {
    for (const dict of [announcementsRu, announcementsRo, announcementsEn]) {
      for (const a of ANNOUNCEMENTS) {
        const text = dict.items[a.id];
        expect(text.title).toBeTruthy();
        expect(text.listTitle).toBeTruthy();
        expect(text.title).toContain(text.listTitle);
        for (const step of a.steps) expect(text.steps[step.key]).toBeTruthy();
      }
    }
  });
});
