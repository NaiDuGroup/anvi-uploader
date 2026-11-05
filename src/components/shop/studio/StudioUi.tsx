"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { SHOP_LANG_COOKIE, SHOP_LANGS, type ShopLang } from "@/lib/storefront/i18n";
import { useShopLang } from "../ShopLangProvider";

/** Small building blocks of the Studio panels (Manrope, navy / gold, 44–48 px targets). */

export const STUDIO_ICONS = {
  templates: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  images: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  elements: "M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
  background: "M4 20 20 4M4 13l9-9M11 20l9-9M4 4h16v16H4z",
  mydata: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  duplicate: "M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  unlock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2",
  back: "M15 18l-6-6 6-6",
} as const;

export function Icon({ d, size = 20, className = "", strokeWidth = 2 }: { d: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-base font-extrabold">{children}</h2>
      {action}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-bold text-(--muted2)">{children}</span>;
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

export const inputCls =
  "h-11 w-full min-w-0 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 text-[15px] font-semibold text-(--ink) outline-none focus:border-(--ink)";

export function StudioButton({
  children,
  onClick,
  variant = "outline",
  disabled,
  className = "",
  ariaLabel,
  pressed,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "dark" | "outline" | "soft" | "gold" | "danger";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  pressed?: boolean;
  title?: string;
}) {
  const v =
    variant === "dark"
      ? "shop-btn-dark bg-(--ink) text-white border-transparent"
      : variant === "gold"
        ? "border-[#c9a227] bg-[#faf3dc] text-(--ink)"
        : variant === "soft"
          ? "border-transparent bg-(--soft) text-(--ink)"
          : variant === "danger"
            ? "border-(--line2) bg-white text-(--err)"
            : "border-(--line2) bg-white text-(--ink)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={title ?? ariaLabel}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-[1.5px] px-3 text-sm font-bold disabled:opacity-40 ${
        pressed ? "!border-(--ink) !bg-(--ink) !text-white" : ""
      } ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-sm font-bold"
    >
      <span>{label}</span>
      <span className={`relative h-[22px] w-10 flex-none rounded-full ${checked ? "bg-(--ink)" : "bg-(--line2)"}`}>
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${checked ? "right-[3px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-xs font-bold text-(--muted2)">
        <span>{label}</span>
        <span className="text-(--ink)">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full accent-[#14213d]"
      />
    </label>
  );
}

export function Swatches({
  colors,
  value,
  onChange,
  otherLabel,
  allowNone,
  noneLabel,
}: {
  colors: readonly string[];
  value: string | null;
  onChange: (c: string | null) => void;
  otherLabel: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const v = value?.toLowerCase() ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone ? (
        <button
          type="button"
          aria-label={noneLabel}
          title={noneLabel}
          aria-pressed={v == null}
          onClick={() => onChange(null)}
          className={`h-9 w-9 rounded-full border-[1.5px] border-(--line2) bg-[linear-gradient(135deg,#fff_45%,#c0392b_45%,#c0392b_55%,#fff_55%)] ${v == null ? "ring-2 ring-(--ink) ring-offset-2" : ""}`}
        />
      ) : null}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          title={c}
          aria-pressed={v === c.toLowerCase()}
          onClick={() => onChange(c.toLowerCase())}
          className={`h-9 w-9 rounded-full border-[1.5px] border-(--line2) ${v === c.toLowerCase() ? "ring-2 ring-(--ink) ring-offset-2" : ""}`}
          style={{ background: c }}
        />
      ))}
      <label
        title={otherLabel}
        className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(#c0392b,#c9a227,#1f8a4c,#2f6fed,#b0204f,#c0392b)]"
      >
        <span className="sr-only">{otherLabel}</span>
        <input
          type="color"
          value={v && /^#[0-9a-f]{6}$/.test(v) ? v : "#14213d"}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: ReactNode; aria?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-h-11 overflow-hidden rounded-[10px] border-[1.5px] border-(--line2)">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.aria}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-w-0 flex-1 items-center justify-center px-1.5 text-[13px] font-bold ${value === o.value ? "bg-(--ink) text-white" : "bg-white text-(--ink)"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Language of the Studio (the storefront header is hidden here): the same
 * `shop_lang` cookie as the storefront's RO / RU / EN switch, then a refresh —
 * the design and the editor state stay as they are.
 */
export function StudioLangSwitch({ className = "" }: { className?: string }) {
  const { lang, t } = useShopLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: ShopLang) => {
    if (next === lang) return;
    document.cookie = `${SHOP_LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <label className={`relative flex items-center ${className}`} aria-busy={pending}>
      <span className="sr-only">{t("langLabel")}</span>
      <select
        value={lang}
        onChange={(e) => pick(e.target.value as ShopLang)}
        className="h-10 cursor-pointer appearance-none rounded-[10px] bg-(--soft) pr-6 pl-2.5 text-sm font-bold uppercase"
      >
        {SHOP_LANGS.map((l) => (
          <option key={l} value={l} lang={l} title={STUDIO_LANG_NAMES[l]}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-2 text-[10px]">
        ▾
      </span>
    </label>
  );
}

const STUDIO_LANG_NAMES: Record<ShopLang, string> = { ro: "Română", ru: "Русский", en: "English" };
