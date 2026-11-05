import type { TranslationDictionary } from "@/lib/i18n/types";
import { displayTime, studioStatus, type WeekHours } from "./studioHours";
import {
  DEFAULT_STUDIO_CHAT,
  instagramDmHref,
  telegramUsernameHref,
  viberHref,
  type StudioChat,
  type StudioInfo,
} from "./studioInfo";

/**
 * Guest order success screen: «Написать нам» links with the order number and
 * tracking link prefilled, plus an off-hours notice. Pure — the caller passes `now`.
 */

/** What the server hands to the guest pages (no private studio data). */
export interface OrderContactInfo {
  hours: WeekHours;
  timezone: string;
  chat: StudioChat;
}

export function toOrderContactInfo(info: StudioInfo): OrderContactInfo {
  return { hours: info.hours, timezone: info.timezone, chat: info.chat ?? DEFAULT_STUDIO_CHAT };
}

type ContactTexts = TranslationDictionary["success"]["contact"];

/** `null` while the studio is open. */
export function offHoursNotice(
  hours: WeekHours,
  now: Date,
  timeZone: string,
  t: ContactTexts,
): { title: string; body: string } | null {
  const s = studioStatus(hours, now, timeZone);
  if (s.kind === "open") return null;
  if (s.kind === "lunch") return { title: t.lunchTitle, body: t.lunchBody(displayTime(s.until)) };
  if (!s.opensDay || !s.opensAt) return { title: t.closedTitle, body: t.closedBodyNoHours };
  const at = displayTime(s.opensAt);
  const when =
    s.opensIn === "today"
      ? t.whenToday(at)
      : s.opensIn === "tomorrow"
        ? t.whenTomorrow(at)
        : t.whenOn(t.weekdayOn[s.opensDay], at);
  return { title: t.closedTitle, body: t.closedBody(when) };
}

export interface ChatLink {
  kind: "viber" | "telegram" | "instagram";
  label: string;
  href: string;
  /** Prefill unsupported → copy `message` to the clipboard on click. */
  copyMessage: boolean;
}

/**
 * Links for the configured messengers; an empty contact hides its button.
 * Telegram `?text=` prefills only for a user/bot username (t.me/anvi_studio is
 * a user account) — a channel link would open the channel instead.
 */
export function chatLinks(chat: StudioChat, message: string): ChatLink[] {
  const out: ChatLink[] = [];
  if (chat.viberPhone.trim()) {
    out.push({ kind: "viber", label: "Viber", href: viberHref(chat.viberPhone, message), copyMessage: false });
  }
  if (chat.telegramUsername.trim()) {
    out.push({
      kind: "telegram",
      label: "Telegram",
      href: telegramUsernameHref(chat.telegramUsername.trim(), message),
      copyMessage: false,
    });
  }
  if (chat.instagramUsername.trim()) {
    out.push({
      kind: "instagram",
      label: "Instagram",
      href: instagramDmHref(chat.instagramUsername.trim()),
      copyMessage: true,
    });
  }
  return out;
}
