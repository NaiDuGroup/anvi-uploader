import { describe, expect, it } from "vitest";
import { ru } from "@/lib/i18n/ru";
import { ro } from "@/lib/i18n/ro";
import { en } from "@/lib/i18n/en";
import { chatLinks, offHoursNotice, toOrderContactInfo } from "./orderContact";
import {
  DEFAULT_STUDIO_CHAT,
  DEFAULT_STUDIO_INFO,
  instagramDmHref,
  resolveStudioInfo,
  studioInfoSchema,
  telegramUsernameHref,
  viberHref,
} from "./studioInfo";

const H = DEFAULT_STUDIO_INFO.hours;
const TZ = "Europe/Chisinau";
const RU = ru.success.contact;
// 2026-11-06 is a Friday; Chișinău is UTC+2 in November.
const at = (iso: string) => new Date(iso);

describe("offHoursNotice", () => {
  it("open → no notice", () => {
    expect(offHoursNotice(H, at("2026-11-06T08:00:00Z"), TZ, RU)).toBeNull();
  });
  it("Friday evening → Saturday is tomorrow", () => {
    expect(offHoursNotice(H, at("2026-11-06T17:00:00Z"), TZ, RU)).toEqual({
      title: "Сейчас студия закрыта.",
      body: "Мы свяжемся с вами завтра с 10:00, в рабочее время.",
    });
  });
  it("Friday evening without Saturday hours → Monday", () => {
    const hours = { ...H, sat: [] };
    expect(offHoursNotice(hours, at("2026-11-06T17:00:00Z"), TZ, RU)?.body).toBe(
      "Мы свяжемся с вами в понедельник с 9:00, в рабочее время.",
    );
  });
  it("Saturday after closing → Monday", () => {
    expect(offHoursNotice(H, at("2026-11-07T14:00:00Z"), TZ, RU)?.body).toBe(
      "Мы свяжемся с вами в понедельник с 9:00, в рабочее время.",
    );
  });
  it("Sunday (day off) → tomorrow", () => {
    expect(offHoursNotice(H, at("2026-11-08T10:00:00Z"), TZ, RU)?.body).toBe(
      "Мы свяжемся с вами завтра с 9:00, в рабочее время.",
    );
  });
  it("before opening the same day → today", () => {
    // 07:30 Monday in Chișinău.
    expect(offHoursNotice(H, at("2026-11-09T05:30:00Z"), TZ, RU)?.body).toBe(
      "Мы свяжемся с вами сегодня с 9:00, в рабочее время.",
    );
  });
  it("lunch break → after the break", () => {
    expect(offHoursNotice(H, at("2026-11-09T10:45:00Z"), TZ, RU)).toEqual({
      title: "Сейчас обеденный перерыв.",
      body: "Мы ответим после перерыва, с 13:10.",
    });
  });
  it("no hours at all → generic text", () => {
    const empty = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    expect(offHoursNotice(empty, at("2026-11-09T10:45:00Z"), TZ, RU)?.body).toBe("Мы свяжемся с вами в рабочее время.");
  });
  it("Romanian and English", () => {
    expect(offHoursNotice(H, at("2026-11-07T14:00:00Z"), TZ, ro.success.contact)?.body).toBe(
      "Vă vom contacta luni de la 9:00, în orele de lucru.",
    );
    expect(offHoursNotice(H, at("2026-11-07T14:00:00Z"), TZ, en.success.contact)?.body).toBe(
      "We'll get back to you on Monday from 9:00, during working hours.",
    );
  });
});

describe("chat hrefs", () => {
  const url = "https://print.anvi.md/track/abc-123?x=1&y=2";
  const msg = RU.message("0042", url);

  it("prefill text per language", () => {
    expect(msg).toBe(`Здравствуйте! Мой заказ #0042: ${url}`);
    expect(ro.success.contact.message("0042", url)).toBe(`Bună ziua! Comanda mea #0042: ${url}`);
    expect(en.success.contact.message("0042", url)).toBe(`Hello! My order #0042: ${url}`);
  });
  it("Viber draft encodes # and the URL; plain viberHref unchanged", () => {
    const href = viberHref("+37379545631", "#0042: https://a.b/c?d=1&e=2");
    expect(href).toBe(
      "viber://chat?number=%2B37379545631&draft=%230042%3A%20https%3A%2F%2Fa.b%2Fc%3Fd%3D1%26e%3D2",
    );
    expect(viberHref("+37379545631")).toBe("viber://chat?number=%2B37379545631");
  });
  it("Telegram username link with text; Instagram without", () => {
    expect(telegramUsernameHref("@anvi_studio", "#1 & 2")).toBe("https://t.me/anvi_studio?text=%231%20%26%202");
    expect(telegramUsernameHref("anvi_studio")).toBe("https://t.me/anvi_studio");
    expect(instagramDmHref("anvi_studio_md")).toBe("https://ig.me/m/anvi_studio_md");
  });
  it("chatLinks decodes back to the message and hides empty contacts", () => {
    const links = chatLinks(DEFAULT_STUDIO_CHAT, msg);
    expect(links.map((l) => l.kind)).toEqual(["viber", "telegram", "instagram"]);
    expect(new URL(links[1]!.href).searchParams.get("text")).toBe(msg);
    expect(links[2]).toMatchObject({ copyMessage: true, href: "https://ig.me/m/anvi_studio_md" });
    expect(chatLinks({ viberPhone: "", telegramUsername: "x_y", instagramUsername: "" }, msg).map((l) => l.kind)).toEqual([
      "telegram",
    ]);
  });
});

describe("studio chat settings", () => {
  it("defaults when missing or broken", () => {
    expect(toOrderContactInfo(resolveStudioInfo({})).chat).toEqual(DEFAULT_STUDIO_CHAT);
    expect(resolveStudioInfo({ chat: { viberPhone: "1", telegramUsername: "a b", instagramUsername: "" } }).chat).toEqual(
      DEFAULT_STUDIO_CHAT,
    );
  });
  it("schema accepts a form without chat and validates usernames", () => {
    const rest: Partial<typeof DEFAULT_STUDIO_INFO> = { ...DEFAULT_STUDIO_INFO };
    delete rest.chat;
    expect(studioInfoSchema.safeParse(rest).success).toBe(true);
    expect(studioInfoSchema.safeParse({ ...rest, chat: { ...DEFAULT_STUDIO_CHAT, instagramUsername: "" } }).success).toBe(true);
    expect(studioInfoSchema.safeParse({ ...rest, chat: { ...DEFAULT_STUDIO_CHAT, telegramUsername: "ab" } }).success).toBe(false);
  });
});
