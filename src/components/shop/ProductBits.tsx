"use client";

import { useState } from "react";
import { CART_MAX_QTY } from "@/lib/storefront/cart";
import { clampQtyDraft, commitQty, liveQty, sanitizeQtyDraft } from "@/lib/storefront/qty";
import { ShopImg } from "./ShopImg";
import { useShopLang } from "./ShopLangProvider";

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = CART_MAX_QTY,
  label,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: "sm" | "md";
}) {
  const { t } = useShopLang();
  // What is typed stays a draft (may be empty) until blur / Enter clamps it.
  const [draft, setDraft] = useState<string | null>(null);
  const box = size === "sm" ? "h-10 w-10 text-lg" : "h-11 w-11 text-xl";
  const commit = () => {
    if (draft == null) return;
    const v: number = commitQty(draft, min, max);
    setDraft(null);
    if (v !== value) onChange(v);
  };
  return (
    <div className="flex items-center overflow-hidden rounded-[10px] border-[1.5px] border-(--line2) bg-white">
      <button
        type="button"
        aria-label={`${t("decrease")} — ${label}`}
        disabled={value <= min}
        onClick={() => {
          setDraft(null);
          onChange(Math.max(min, value - 1));
        }}
        className={`${box} grid place-items-center bg-(--soft) disabled:opacity-40`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => {
          const d: string = clampQtyDraft(sanitizeQtyDraft(e.target.value), max);
          setDraft(d);
          const live: number | null = liveQty(d, min, max);
          if (live != null && live !== value) onChange(live);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={`${size === "sm" ? "w-11" : "w-14"} h-10 border-0 bg-transparent text-center font-bold outline-none`}
      />
      <button
        type="button"
        aria-label={`${t("increase")} — ${label}`}
        disabled={value >= max}
        onClick={() => {
          setDraft(null);
          onChange(Math.min(max, value + 1));
        }}
        className={`${box} grid place-items-center bg-(--soft) disabled:opacity-40`}
      >
        +
      </button>
    </div>
  );
}

export interface SwatchOption {
  key: string;
  label: string;
  hex: string;
  /** Out of stock: shown crossed out, not selectable; `disabledLabel` is its accessible name. */
  disabled?: boolean;
  disabledLabel?: string;
}

/** Colour circles, or text chips when the options do not differ by colour (320 / 450 ml). */
export function OptionPicker({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: SwatchOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const asSwatches: boolean = new Set(options.map((o) => o.hex.toLowerCase())).size > 1;
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
      <legend className="mb-2.5 p-0 text-[15px] font-bold">{title}</legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => {
          const on: boolean = o.key === value;
          const name: string = o.disabled ? (o.disabledLabel ?? o.label) : o.label;
          return asSwatches ? (
            <button
              key={o.key}
              type="button"
              aria-label={name}
              aria-pressed={on}
              disabled={o.disabled}
              title={name}
              onClick={() => onChange(o.key)}
              style={{ background: o.hex }}
              className={`relative h-10 w-10 overflow-hidden rounded-full border-[3px] border-white disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "outline-2 outline-(--ink)" : "outline-1 outline-(--line2)"
              } outline-offset-0`}
            >
              {o.disabled ? (
                // Diagonal strike: «not in stock» without relying on colour.
                <span aria-hidden className="absolute top-1/2 left-[-20%] h-[2px] w-[140%] -rotate-45 bg-(--ink)" />
              ) : null}
            </button>
          ) : (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              aria-label={o.disabled ? name : undefined}
              disabled={o.disabled}
              onClick={() => onChange(o.key)}
              className={`min-h-11 rounded-[10px] border-[1.5px] px-4 font-bold disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 ${
                on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ProductGallery({
  images,
  lifestyle = [],
  alt,
  overlay,
}: {
  images: string[];
  /** Photos (of `images`) that show the model in another colour: captioned «colour may differ». */
  lifestyle?: readonly string[];
  alt: string;
  /** Drawn over the first photo (the print frame on a T-shirt). */
  overlay?: React.ReactNode;
}) {
  const { t } = useShopLang();
  const [index, setIndex] = useState(0);
  const list: string[] = images.length ? images.slice(0, 8) : [""];
  const current: number = Math.min(index, list.length - 1);
  const isLifestyle = (src: string): boolean => Boolean(src) && lifestyle.includes(src);
  const currentLifestyle: boolean = isLifestyle(list[current] ?? "");
  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-[18px] bg-(--soft)">
        <ShopImg
          src={list[current] || null}
          alt={currentLifestyle ? `${alt} — ${t("lifestylePhoto")}` : alt}
          eager
          className="block aspect-square w-full"
          fit="contain"
        />
        {current === 0 ? overlay : null}
        {currentLifestyle ? (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 m-0 rounded-[10px] bg-black/65 px-3 py-2 text-center text-sm font-medium text-white">
            {t("lifestylePhoto")}
          </p>
        ) : null}
      </div>
      {list.length > 1 ? (
        <div className="shop-no-scrollbar grid auto-cols-[22%] grid-flow-col gap-2.5 overflow-x-auto sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-6">
          {list.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={isLifestyle(src) ? `${t("photo", { n: i + 1 })} — ${t("lifestylePhoto")}` : t("photo", { n: i + 1 })}
              aria-pressed={i === current}
              className={`relative overflow-hidden rounded-[10px] border-2 p-0 ${i === current ? "border-(--ink)" : "border-(--line)"}`}
            >
              <ShopImg src={src} alt="" className="block aspect-square w-full" />
              {isLifestyle(src) ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] leading-tight text-white">
                  {t("lifestyleBadge")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Label of the phone sticky add-to-cart button: «Adaugă în coș · 130 lei» on
 * one line when the button is wide enough, else the price on its own line
 * under the label (360 px phones with a quantity stepper) — never a wrap in
 * the middle of the label or a cut-off. The button must be an `@container`.
 */
export function StickyCtaLabel({ label, price }: { label: string; price?: string | null }) {
  return (
    <span className="flex flex-col items-center justify-center leading-tight @min-[16rem]:flex-row @min-[16rem]:flex-wrap @min-[16rem]:gap-x-1">
      <span>{label}</span>
      {price ? (
        <span className="text-sm font-bold whitespace-nowrap @min-[16rem]:text-base @min-[16rem]:font-extrabold">
          <span className="hidden @min-[16rem]:inline">· </span>
          {price}
        </span>
      ) : null}
    </span>
  );
}
