import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_INFO, formatPhone, resolveStudioInfo, viberHref, whatsappHref } from "./studioInfo";
import { formatIntervals, hoursSummary, parseIntervals, studioStatus } from "./studioHours";

const H = DEFAULT_STUDIO_INFO.hours;
const TZ = "Europe/Chisinau";
// 2026-11-02 is a Monday; Chișinău is UTC+2 in November.
const at = (iso: string) => new Date(iso);

describe("studioStatus", () => {
  it("open in the morning shows the day end", () => {
    expect(studioStatus(H, at("2026-11-02T08:00:00Z"), TZ)).toEqual({ kind: "open", until: "18:00" });
  });
  it("lunch break", () => {
    expect(studioStatus(H, at("2026-11-02T10:45:00Z"), TZ)).toEqual({ kind: "lunch", until: "13:10" });
  });
  it("before opening today", () => {
    expect(studioStatus(H, at("2026-11-02T06:30:00Z"), TZ)).toMatchObject({ kind: "closed", opensIn: "today", opensAt: "09:00" });
  });
  it("Saturday evening → opens Monday", () => {
    expect(studioStatus(H, at("2026-11-07T14:00:00Z"), TZ)).toEqual({
      kind: "closed", opensDay: "mon", opensIn: "later", opensAt: "09:00",
    });
  });
  it("Friday evening → Saturday is tomorrow at 10:00", () => {
    expect(studioStatus(H, at("2026-11-06T17:00:00Z"), TZ)).toMatchObject({ opensIn: "tomorrow", opensDay: "sat", opensAt: "10:00" });
  });
  it("uses the studio zone, not UTC", () => {
    // 22:30 UTC Sunday = 00:30 Monday in Chișinău → opens today at 9:00.
    expect(studioStatus(H, at("2026-11-01T22:30:00Z"), TZ)).toMatchObject({ opensIn: "today", opensDay: "mon" });
  });
});

describe("hoursSummary", () => {
  it("groups the week and finds the shared lunch", () => {
    const s = hoursSummary(H);
    expect(s.rows).toEqual([
      { fromDay: "mon", toDay: "fri", span: { from: "09:00", to: "18:00" } },
      { fromDay: "sat", toDay: "sat", span: { from: "10:00", to: "15:00" } },
      { fromDay: "sun", toDay: "sun", span: null },
    ]);
    expect(s.lunch).toEqual({ from: "12:30", to: "13:10" });
  });
});

describe("intervals text", () => {
  it("round-trips", () => {
    expect(formatIntervals(H.mon)).toBe("9:00–12:30, 13:10–18:00");
    expect(parseIntervals("9:00-12:30, 13.10–18:00")).toEqual(H.mon);
    expect(parseIntervals("")).toEqual([]);
    expect(parseIntervals("18:00-9:00")).toBeNull();
    expect(parseIntervals("closed")).toBeNull();
  });
});

describe("studio info", () => {
  it("falls back per key", () => {
    const r = resolveStudioInfo({ mainPhone: "+37360000000", contacts: "broken" });
    expect(r.mainPhone).toBe("+37360000000");
    expect(r.contacts).toEqual(DEFAULT_STUDIO_INFO.contacts);
    expect(resolveStudioInfo(null)).toEqual(DEFAULT_STUDIO_INFO);
  });
  it("formats phones and messenger links", () => {
    expect(formatPhone("+37379545631")).toBe("+373 79 545 631");
    expect(formatPhone("079545631")).toBe("+373 79 545 631");
    expect(viberHref("+373 79 545 631")).toBe("viber://chat?number=%2B37379545631");
    expect(whatsappHref("+37379545631")).toBe("https://wa.me/37379545631");
  });
});
