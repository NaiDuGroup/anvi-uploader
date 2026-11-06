"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { formatIntervals, parseIntervals } from "@/lib/studioInfo/studioHours";
import {
  CONTACT_PURPOSES,
  DEFAULT_ARTWORK_REQUIREMENTS,
  DEFAULT_STUDIO_CHAT,
  WEEKDAYS,
  type ContactPurpose,
  type LocalizedText,
  type StudioChat,
  type StudioContact,
  type StudioInfo,
  type Weekday,
} from "@/lib/studioInfo/studioInfo";

const inputCls =
  "flex w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950";

function Label({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-gray-400">{hint}</span> : null}
    </label>
  );
}

function LocalizedTextarea({
  title,
  hint,
  value,
  onChange,
  onReset,
  resetLabel,
}: {
  title: string;
  hint: string;
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
  onReset?: () => void;
  resetLabel?: string;
}) {
  const [lang, setLang] = useState<Locale>("ru");
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="flex items-center gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                lang === l ? "bg-amber-100 text-amber-900" : "text-gray-500 hover:bg-gray-100",
              )}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
          {onReset ? (
            <button type="button" onClick={onReset} className="ml-2 text-xs text-gray-500 underline-offset-2 hover:underline">
              {resetLabel}
            </button>
          ) : null}
        </div>
      </div>
      <textarea
        className={cn(inputCls, "min-h-[9rem] py-2 leading-relaxed")}
        value={value[lang]}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
      />
      <span className="text-xs text-gray-400">{hint}</span>
    </div>
  );
}

/**
 * Settings → studio card for the cabinet/admin footers: contacts by purpose,
 * opening hours, map/reviews/price-list links and the customer texts.
 */
export default function StudioInfoSettingsSection({
  value,
  onChange,
}: {
  value: StudioInfo;
  onChange: (next: StudioInfo) => void;
}) {
  const { t } = useLanguageStore();
  const f = t.footer;
  const s = f.settings;
  const set = <K extends keyof StudioInfo>(key: K, v: StudioInfo[K]) => onChange({ ...value, [key]: v });

  const [hoursText, setHoursText] = useState<Record<Weekday, string>>(
    () => Object.fromEntries(WEEKDAYS.map((d) => [d, formatIntervals(value.hours[d])])) as Record<Weekday, string>,
  );
  const [hoursInvalid, setHoursInvalid] = useState<Partial<Record<Weekday, boolean>>>({});

  const purposeLabel: Record<ContactPurpose, string> = {
    platform: f.purposePlatform,
    wholesale: f.purposeWholesale,
    general: f.purposeGeneral,
  };

  const chat = value.chat ?? DEFAULT_STUDIO_CHAT;
  const setChat = (patch: Partial<StudioChat>) => set("chat", { ...chat, ...patch });
  const usernameBad = (u: string) => u.trim() !== "" && !/^@?[A-Za-z0-9_.]{3,32}$/.test(u.trim());

  const updateContact = (i: number, patch: Partial<StudioContact>) =>
    set(
      "contacts",
      value.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{s.sectionTitle}</h2>
      <p className="mb-4 mt-1 text-xs text-gray-500">{s.sectionHint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label label={s.studioName}>
          <Input value={value.studioName} onChange={(e) => set("studioName", e.target.value)} />
        </Label>
        <Label label={s.address}>
          <Input value={value.address} onChange={(e) => set("address", e.target.value)} />
        </Label>
        <Label label={s.mainPhone}>
          <Input value={value.mainPhone} onChange={(e) => set("mainPhone", e.target.value)} inputMode="tel" />
        </Label>
        <Label label={s.email} hint={s.emailHint}>
          <Input
            type="email"
            value={value.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
            placeholder="info@…"
          />
        </Label>
        <Label label={s.timezone}>
          <Input value={value.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </Label>
        <Label label={s.mapUrl} hint={s.urlHint}>
          <Input value={value.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} placeholder="https://…" />
        </Label>
        <Label label={s.reviewsUrl} hint={s.urlHint}>
          <Input value={value.reviewsUrl} onChange={(e) => set("reviewsUrl", e.target.value)} placeholder="https://…" />
        </Label>
        <Label label={s.priceListUrl} hint={s.urlHint}>
          <Input value={value.priceListUrl} onChange={(e) => set("priceListUrl", e.target.value)} placeholder="https://…" />
        </Label>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-800">{s.contactsTitle}</h3>
      <div className="space-y-2">
        {value.contacts.map((c, i) => (
          <div
            key={i}
            className="grid items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto_auto]"
          >
            <Label label={s.contactName} hint={s.contactNameHint}>
              <Input value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} />
            </Label>
            <Label label={s.contactPhone}>
              <Input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} inputMode="tel" />
            </Label>
            <Label label={s.contactPurpose}>
              <select
                className={cn(inputCls, "h-9")}
                value={c.purpose}
                onChange={(e) => updateContact(i, { purpose: e.target.value as ContactPurpose })}
              >
                {CONTACT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {purposeLabel[p]}
                  </option>
                ))}
              </select>
            </Label>
            <div className="flex h-9 items-center gap-3 text-xs text-gray-700">
              {(["viber", "whatsapp", "telegram"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={c[k]}
                    onChange={(e) => updateContact(i, { [k]: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-600"
                  />
                  {k === "viber" ? "Viber" : k === "whatsapp" ? "WhatsApp" : "Telegram"}
                </label>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-red-600 hover:bg-red-50"
              aria-label={s.removeContact}
              title={s.removeContact}
              onClick={() => set("contacts", value.contacts.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            set("contacts", [
              ...value.contacts,
              { name: "", phone: "", purpose: "general", viber: true, whatsapp: true, telegram: false },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          {s.addContact}
        </Button>
      </div>

      <h3 className="mb-1 mt-6 text-sm font-semibold text-gray-800">{s.chatTitle}</h3>
      <p className="mb-2 text-xs text-gray-400">{s.chatHint}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Label label={s.chatViber}>
          <Input value={chat.viberPhone} onChange={(e) => setChat({ viberPhone: e.target.value })} inputMode="tel" />
        </Label>
        <Label label={s.chatTelegram} hint={s.chatUsernameHint}>
          <Input
            value={chat.telegramUsername}
            className={cn(usernameBad(chat.telegramUsername) && "border-red-400 focus-visible:ring-red-500")}
            onChange={(e) => setChat({ telegramUsername: e.target.value.replace(/^@/, "") })}
          />
        </Label>
        <Label label={s.chatInstagram} hint={s.chatUsernameHint}>
          <Input
            value={chat.instagramUsername}
            className={cn(usernameBad(chat.instagramUsername) && "border-red-400 focus-visible:ring-red-500")}
            onChange={(e) => setChat({ instagramUsername: e.target.value.replace(/^@/, "") })}
          />
        </Label>
      </div>

      <h3 className="mb-1 mt-6 text-sm font-semibold text-gray-800">{s.hoursTitle}</h3>
      <p className="mb-2 text-xs text-gray-400">{s.hoursHint}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {WEEKDAYS.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <span className="w-8 shrink-0 font-medium text-gray-700">{f.weekdayShort[d]}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <Input
                value={hoursText[d]}
                placeholder={f.dayOff}
                className={cn(hoursInvalid[d] && "border-red-400 focus-visible:ring-red-500")}
                onChange={(e) => {
                  const text = e.target.value;
                  setHoursText((prev) => ({ ...prev, [d]: text }));
                  const parsed = parseIntervals(text);
                  setHoursInvalid((prev) => ({ ...prev, [d]: parsed === null }));
                  if (parsed) set("hours", { ...value.hours, [d]: parsed });
                }}
              />
              {hoursInvalid[d] ? <span className="mt-0.5 text-[11px] text-red-600">{s.hoursInvalid}</span> : null}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <LocalizedTextarea
          title={s.artworkTitle}
          hint={s.textHint}
          value={value.artworkRequirements}
          onChange={(v) => set("artworkRequirements", v)}
          onReset={() => set("artworkRequirements", { ...DEFAULT_ARTWORK_REQUIREMENTS })}
          resetLabel={s.resetDefault}
        />
        <LocalizedTextarea
          title={s.leadTimesTitle}
          hint={`${s.textHint} ${s.leadTimesHint}`}
          value={value.leadTimes}
          onChange={(v) => set("leadTimes", v)}
        />
      </div>
    </section>
  );
}
