import { z } from "zod";

/**
 * Studio card shown in the cabinet and admin footers: public contacts, opening
 * hours and short customer texts. Stored as one JSON on `CompanyProfile.studioInfo`;
 * a missing/null key falls back to `DEFAULT_STUDIO_INFO`, so a fresh database
 * (or prod right after the migration) shows the real studio data.
 *
 * Pure module — safe on server and client.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const CONTACT_PURPOSES = ["platform", "wholesale", "general"] as const;
export type ContactPurpose = (typeof CONTACT_PURPOSES)[number];

const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const studioIntervalSchema = z.object({
  from: z.string().regex(timeRe),
  to: z.string().regex(timeRe),
});
export type StudioInterval = z.infer<typeof studioIntervalSchema>;

export const studioContactSchema = z.object({
  /** Empty = shown as «Студия» in the viewer’s language. */
  name: z.string().trim().max(80),
  phone: z.string().trim().min(3).max(32),
  purpose: z.enum(CONTACT_PURPOSES),
  viber: z.boolean(),
  whatsapp: z.boolean(),
  telegram: z.boolean(),
});
export type StudioContact = z.infer<typeof studioContactSchema>;

const localizedTextSchema = z.object({
  ro: z.string().max(5000),
  ru: z.string().max(5000),
  en: z.string().max(5000),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

/** Instagram/Telegram handle without `@`; empty = button hidden. */
const usernameSchema = z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9_.]{3,32}$/)]);

/** «Написать нам» buttons on the guest order success screen. */
export const studioChatSchema = z.object({
  /** Empty = Viber button hidden. */
  viberPhone: z.string().trim().max(32),
  telegramUsername: usernameSchema,
  instagramUsername: usernameSchema,
});
export type StudioChat = z.infer<typeof studioChatSchema>;

export const DEFAULT_STUDIO_CHAT: StudioChat = {
  viberPhone: "+37379545631",
  telegramUsername: "anvi_studio",
  instagramUsername: "anvi_studio_md",
};

export const studioInfoSchema = z.object({
  studioName: z.string().trim().max(120),
  address: z.string().trim().max(200),
  mapUrl: z.string().trim().max(1000),
  reviewsUrl: z.string().trim().max(1000),
  mainPhone: z.string().trim().max(32),
  /** Public e-mail (shop footer). Optional so older saved forms still validate; empty = hidden. */
  email: z.union([z.literal(""), z.string().trim().email().max(120)]).optional(),
  contacts: z.array(studioContactSchema).max(20),
  timezone: z.string().trim().min(1).max(64),
  /** Open intervals per weekday; a gap between two intervals is the lunch break. */
  hours: z.object(
    Object.fromEntries(WEEKDAYS.map((d) => [d, z.array(studioIntervalSchema).max(4)])) as Record<
      Weekday,
      z.ZodArray<typeof studioIntervalSchema>
    >,
  ),
  artworkRequirements: localizedTextSchema,
  /** Empty in every language = block hidden. */
  leadTimes: localizedTextSchema,
  /** Empty = link hidden. */
  priceListUrl: z.string().trim().max(1000),
  /** Optional so older saved forms still validate; `resolveStudioInfo` fills the default. */
  chat: studioChatSchema.optional(),
});
export type StudioInfo = z.infer<typeof studioInfoSchema>;

const MAP_URL =
  "https://www.google.com/maps/search/?api=1&query=Foto+video+studio+ANVI+Alba-Iulia+77%2F18+Chi%C8%99in%C4%83u";

const WEEKDAY_HOURS: StudioInterval[] = [
  { from: "09:00", to: "12:30" },
  { from: "13:10", to: "18:00" },
];

export const DEFAULT_ARTWORK_REQUIREMENTS: LocalizedText = {
  ru: [
    "- Размер макета = заказанный размер печати. Если файл больше — укажите реальный размер, иначе заказ не отправится.",
    "- Пропорции файла должны совпадать с заказанными, иначе при печати он будет обрезан или растянут.",
    "- Разрешение: от 300 dpi в размере печати; меньше 150 dpi — печать будет нечёткой.",
    "- Сохраняйте dpi в файле — без него мы сверяем только пропорции.",
    "- DTF и UV-DTF: PNG с прозрачным фоном — белая подложка печатается под каждым непрозрачным пикселем, фон без прозрачности напечатается прямоугольником.",
    "- Форматы: PDF, PNG, JPG. Текст в PDF переведите в кривые или встройте шрифты.",
  ].join("\n"),
  ro: [
    "- Dimensiunea machetei = dimensiunea comandată. Dacă fișierul e mai mare, indicați dimensiunea reală, altfel comanda nu se trimite.",
    "- Proporțiile fișierului trebuie să coincidă cu cele comandate, altfel la tipar va fi tăiat sau întins.",
    "- Rezoluția: de la 300 dpi la dimensiunea de tipar; sub 150 dpi tiparul va fi neclar.",
    "- Păstrați dpi în fișier — fără el verificăm doar proporțiile.",
    "- DTF și UV-DTF: PNG cu fundal transparent — albul se tipărește sub fiecare pixel opac, un fundal netransparent iese dreptunghi.",
    "- Formate: PDF, PNG, JPG. Textul din PDF — în curbe sau cu fonturile încorporate.",
  ].join("\n"),
  en: [
    "- Artwork size = ordered print size. If the file is larger, enter the real size, otherwise the order can't be sent.",
    "- File proportions must match the order, otherwise the print gets cropped or stretched.",
    "- Resolution: 300 dpi at print size; below 150 dpi the print will be blurry.",
    "- Keep the dpi in the file — without it we can only check proportions.",
    "- DTF and UV-DTF: PNG with a transparent background — white is printed under every opaque pixel, a solid background prints as a rectangle.",
    "- Formats: PDF, PNG, JPG. Convert PDF text to outlines or embed the fonts.",
  ].join("\n"),
};

export const DEFAULT_STUDIO_INFO: StudioInfo = {
  studioName: "ANVI-STUDIO GROUP SRL",
  address: "str. Alba-Iulia 77/18, Chișinău",
  mapUrl: MAP_URL,
  reviewsUrl: MAP_URL,
  mainPhone: "+37379545631",
  email: "",
  contacts: [
    { name: "Анатолий", phone: "+37379187003", purpose: "platform", viber: true, whatsapp: true, telegram: false },
    { name: "Ангелина", phone: "+37379503585", purpose: "wholesale", viber: true, whatsapp: true, telegram: false },
    { name: "", phone: "+37379545631", purpose: "wholesale", viber: true, whatsapp: true, telegram: false },
  ],
  timezone: "Europe/Chisinau",
  hours: {
    mon: WEEKDAY_HOURS,
    tue: WEEKDAY_HOURS,
    wed: WEEKDAY_HOURS,
    thu: WEEKDAY_HOURS,
    fri: WEEKDAY_HOURS,
    sat: [
      { from: "10:00", to: "12:30" },
      { from: "13:10", to: "15:00" },
    ],
    sun: [],
  },
  artworkRequirements: DEFAULT_ARTWORK_REQUIREMENTS,
  leadTimes: { ro: "", ru: "", en: "" },
  priceListUrl: "",
  chat: DEFAULT_STUDIO_CHAT,
};

/**
 * Stored JSON → full card. Each top-level key is validated on its own, so one
 * broken key falls back to its default instead of dropping the whole card.
 */
export function resolveStudioInfo(stored: unknown): StudioInfo {
  const out: StudioInfo = structuredClone(DEFAULT_STUDIO_INFO);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  const src = stored as Record<string, unknown>;
  const shape = studioInfoSchema.shape;
  for (const key of Object.keys(shape) as (keyof StudioInfo)[]) {
    if (src[key] === undefined || src[key] === null) continue;
    const parsed = shape[key].safeParse(src[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

/** Text for the viewer's language, falling back ru → ro → en. */
export function pickLocalized(text: LocalizedText, locale: string): string {
  const own = (text as Record<string, string>)[locale]?.trim();
  if (own) return own;
  return text.ru.trim() || text.ro.trim() || text.en.trim();
}

export function hasLocalized(text: LocalizedText): boolean {
  return Boolean(text.ro.trim() || text.ru.trim() || text.en.trim());
}

/** Digits only, Moldovan local `0XXXXXXXX` → `373XXXXXXXX`. */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("0")) return `373${d.slice(1)}`;
  if (d.length === 8) return `373${d}`;
  return d;
}

/** `+37379545631` → `+373 79 545 631`; other numbers keep their digits with a `+`. */
export function formatPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 11 && d.startsWith("373")) {
    return `+373 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return d ? `+${d}` : phone;
}

export function telHref(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}
/** `draft` prefills the message (Viber ignores it on some desktop builds). */
export function viberHref(phone: string, draft?: string): string {
  const base = `viber://chat?number=%2B${phoneDigits(phone)}`;
  return draft ? `${base}&draft=${encodeURIComponent(draft)}` : base;
}
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phoneDigits(phone)}`;
}
export function telegramHref(phone: string): string {
  return `https://t.me/+${phoneDigits(phone)}`;
}
/** Chat with a Telegram user/bot by username; `text` prefills the message. */
export function telegramUsernameHref(username: string, text?: string): string {
  const base = `https://t.me/${encodeURIComponent(username.replace(/^@/, ""))}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
/** Instagram DM; no prefill support — the caller copies the text instead. */
export function instagramDmHref(username: string): string {
  return `https://ig.me/m/${encodeURIComponent(username.replace(/^@/, ""))}`;
}

/** Only http(s) links reach the page (an admin typo must not become `javascript:`). */
export function safeHttpUrl(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

/** Simple text → blocks: `- ` / `• ` / `* ` lines become bullets, others paragraphs. */
export function parseSimpleText(text: string): { kind: "bullet" | "para"; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^[-•*]\s+(.*)$/.exec(l);
      return m ? { kind: "bullet" as const, text: m[1]! } : { kind: "para" as const, text: l };
    });
}

/** Payment details safe to show customers (no counters, VAT, signatures). */
export interface PublicPaymentDetails {
  name: string;
  fiscalCode: string;
  iban: string;
  bankName: string;
  bic: string;
}
