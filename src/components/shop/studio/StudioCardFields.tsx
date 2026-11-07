"use client";

import { useEffect, useRef, useState } from "react";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { fieldsWithPalette, isPaletteOf } from "@/lib/studio/cardFlow";
import type { StudioImageSrc } from "@/lib/studio/document";
import { saveStudioFieldsLocal } from "@/lib/studio/fieldsStore";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioFlyerT, type StudioFlyerKey } from "@/lib/studio/i18n.flyer";
import type { StudioShopKey } from "@/lib/studio/i18n.shop";
import { logoPaletteFromImage } from "@/lib/studio/logoPalette";
import { CARD_PRESET_PALETTES, type BrandPalette } from "@/lib/studio/palette";
import { STUDIO_COLOR_FIELD_KEYS, STUDIO_FLYER_FIELD_KEYS, cleanFields, type StudioColorFieldKey, type StudioFields } from "@/lib/studio/smartFields";
import type { StudioEditorApi } from "./StudioApp";
import { Icon, STUDIO_ICONS } from "./StudioUi";

/**
 * Pieces the business-card start screen and the short edit share: the
 * details' labels, the logo button (its colours become the brand colours at
 * once) and the «Culori» row.
 */

export type CardTextFieldKey = "name" | "title" | "company" | "phone" | "email" | "site" | "address";

export const CARD_FIELD_LABEL: Record<CardTextFieldKey, StudioShopKey> = {
  name: "fName",
  title: "fTitle",
  company: "fCompany",
  phone: "fPhone",
  email: "fEmail",
  site: "fSite",
  address: "fAddress",
};
export const CARD_FIELD_KEYS = Object.keys(CARD_FIELD_LABEL) as CardTextFieldKey[];
/**
 * `site` stays a text input (url keyboard via `inputMode`): `type="url"` rejects
 * «pizzeria-demo.md» without `https://` and would block the «See designs» submit.
 */
export const CARD_INPUT_TYPE: Partial<Record<CardTextFieldKey, string>> = { phone: "tel", email: "email" };
export const CARD_INPUT_MODE: Partial<Record<CardTextFieldKey, "tel" | "email" | "url">> = { phone: "tel", email: "email", site: "url" };
export const CARD_AUTOCOMPLETE: Partial<Record<CardTextFieldKey, string>> = {
  name: "name",
  title: "organization-title",
  company: "organization",
  phone: "tel",
  email: "email",
  site: "url",
  address: "street-address",
};

export const isCardTextField = (k: string): k is CardTextFieldKey => k in CARD_FIELD_LABEL;

/** Flyer texts (`STUDIO_FLYER_FIELD_KEYS`) and their labels (`i18n.flyer.ts`). */
export type FlyerTextFieldKey = (typeof STUDIO_FLYER_FIELD_KEYS)[number];
export const FLYER_FIELD_LABEL: Record<FlyerTextFieldKey, StudioFlyerKey> = {
  headline: "fHeadline",
  subheadline: "fSubheadline",
  body: "fBody",
  bullets: "fBullets",
  offer: "fOffer",
  date: "fDate",
};
export const isFlyerTextField = (k: string): k is FlyerTextFieldKey => (STUDIO_FLYER_FIELD_KEYS as readonly string[]).includes(k);

/** «Datele mele» written: the page's state and this browser (the account copy is saved from «Datele mele»). */
export function useCardFieldSetter(fields: StudioFields, onFields: (f: StudioFields) => void): (patch: StudioFields | ((f: StudioFields) => StudioFields)) => void {
  const latest = useRef(fields);
  useEffect(() => {
    latest.current = fields;
  }, [fields]);
  return (patch) => {
    const next: StudioFields = typeof patch === "function" ? patch(latest.current) : { ...latest.current, ...patch };
    latest.current = next;
    onFields(next);
    saveStudioFieldsLocal(cleanFields(next));
  };
}

/** The brand colours of the logo in «Datele mele» (null: no logo, a logo with no colour, or not in this browser). */
export function useLogoPalette(api: StudioEditorApi, logo: StudioImageSrc | null | undefined): BrandPalette | null {
  const id: string | undefined = logo?.localId;
  const [got, setGot] = useState<{ id: string; palette: BrandPalette | null } | null>(null);
  const { assets } = api;
  useEffect(() => {
    if (!id || !logo) return;
    let cancelled = false;
    void assets.ensure(id).then((ok) => {
      if (cancelled) return;
      const bmp = ok ? assets.preview(id) : null;
      setGot({ id, palette: bmp ? logoPaletteFromImage(bmp, logo.naturalW, logo.naturalH) : null });
    });
    return () => {
      cancelled = true;
    };
    // The logo is the same picture while its id is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, assets]);
  return id && got?.id === id ? got.palette : null;
}

/** «Încarcă logoul» / «Schimbă logoul» (+ «Fără logo»): a new logo brings its colours. */
export function CardLogoButton({
  api,
  fields,
  set,
  compact = false,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  set: (patch: StudioFields | ((f: StudioFields) => StudioFields)) => void;
  compact?: boolean;
}) {
  const t = studioCardT(api.lang);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative flex flex-col gap-1">
      {compact ? null : <span className="text-xs font-bold text-[#5c4c10]">{t("logo")}</span>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-studio-card-logo
          disabled={busy}
          onClick={() => input.current?.click()}
          className="shop-btn-dark flex min-h-11 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-extrabold text-white disabled:opacity-60"
        >
          <Icon d={STUDIO_ICONS.images} size={18} />
          {fields.logo ? t("logoChange") : t("logoAdd")}
        </button>
        {fields.logo ? (
          <button type="button" data-studio-card-logo-remove onClick={() => set({ logo: null })} className="min-h-11 rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold">
            {t("logoRemove")}
          </button>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="text-xs font-bold text-[#a82e22]">
          {error}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-card-logo-input
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setError(null);
          if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
            setError(api.t("uploadFailed"));
            return;
          }
          setBusy(true);
          try {
            const a = await api.assets.addFile(f);
            const bmp = api.assets.preview(a.localId);
            const palette: BrandPalette | null = bmp ? logoPaletteFromImage(bmp, a.naturalW, a.naturalH) : null;
            const logo: StudioImageSrc = { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime };
            // The logo's colours replace the old ones (a white logo keeps them).
            set((cur) => ({ ...(palette ? fieldsWithPalette(cur, palette) : cur), logo }));
          } catch {
            setError(api.t("uploadFailed"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

const COLOR_LABEL: Record<StudioColorFieldKey, "colorMain" | "colorAccent" | "colorInk"> = { brandColor1: "colorMain", brandColor2: "colorAccent", brandColor3: "colorInk" };

/** Three stripes of a colour set (palette chips). */
function PaletteSwatch({ p }: { p: BrandPalette }) {
  return (
    <span aria-hidden="true" className="flex h-6 w-10 overflow-hidden rounded-md ring-1 ring-black/10">
      <span className="flex-[2]" style={{ background: p.brandColor1 }} />
      <span className="flex-1" style={{ background: p.brandColor2 }} />
      <span className="flex-1" style={{ background: p.brandColor3 }} />
    </span>
  );
}

/**
 * «Culori»: the three brand colours (each a colour picker), back to the
 * logo's / the design's own, and (short edit) the ready colour sets.
 */
export function CardColorsRow({
  api,
  fields,
  set,
  logoPalette,
  presets = false,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  set: (patch: StudioFields | ((f: StudioFields) => StudioFields)) => void;
  logoPalette: BrandPalette | null;
  presets?: boolean;
}) {
  const t = studioCardT(api.lang);
  const has: boolean = STUDIO_COLOR_FIELD_KEYS.some((k) => !!fields[k]);
  const fromLogo: boolean = !!logoPalette && isPaletteOf(fields, logoPalette);
  const chip = (on: boolean) =>
    `flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] px-2.5 text-[13px] font-bold whitespace-nowrap ${on ? "border-(--ink) bg-white" : "border-(--line2) bg-white hover:border-(--ink)"}`;
  return (
    <div className="flex flex-col gap-2" data-studio-card-colors>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-[#5c4c10]">{t("colors")}</span>
        {fromLogo ? <span className="text-[11px] text-(--muted)">{t("colorsFromLogo")}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {STUDIO_COLOR_FIELD_KEYS.map((k) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border-[1.5px] border-(--line2) bg-white py-1 pr-2.5 pl-1 text-[12px] font-bold focus-within:border-(--ink)">
            <span className="relative h-9 w-9 flex-none overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: fields[k] ?? "#ffffff" }}>
              <input
                type="color"
                data-studio-card-color={k}
                value={fields[k] ?? "#ffffff"}
                onChange={(e) => set({ [k]: e.target.value.toLowerCase() })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t(COLOR_LABEL[k])}
              />
              {fields[k] ? null : (
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[11px] text-(--muted2)">
                  —
                </span>
              )}
            </span>
            {t(COLOR_LABEL[k])}
          </label>
        ))}
        {logoPalette && !fromLogo ? (
          <button type="button" data-studio-card-colors-reset className="min-h-11 rounded-xl px-2 text-[13px] font-bold underline underline-offset-2" onClick={() => set((cur) => fieldsWithPalette(cur, logoPalette))}>
            {t("colorsReset")}
          </button>
        ) : !logoPalette && has ? (
          <button type="button" data-studio-card-colors-reset className="min-h-11 rounded-xl px-2 text-[13px] font-bold underline underline-offset-2" onClick={() => set((cur) => fieldsWithPalette(cur, null))}>
            {t("colorsTemplate")}
          </button>
        ) : null}
      </div>
      {presets ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("colors")}>
          {logoPalette ? (
            <button type="button" aria-pressed={fromLogo} data-studio-card-palette="logo" className={chip(fromLogo)} onClick={() => set((cur) => fieldsWithPalette(cur, logoPalette))}>
              <PaletteSwatch p={logoPalette} />
              {t("colorsLogo")}
            </button>
          ) : null}
          {CARD_PRESET_PALETTES.map((p, i) => {
            const on: boolean = isPaletteOf(fields, p);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={t("colorsSet", { n: i + 1 })}
                title={t("colorsSet", { n: i + 1 })}
                data-studio-card-palette={i}
                className={chip(on)}
                onClick={() => set((cur) => fieldsWithPalette(cur, p))}
              >
                <PaletteSwatch p={p} />
              </button>
            );
          })}
          <button type="button" aria-pressed={!has} data-studio-card-palette="template" className={chip(!has)} onClick={() => set((cur) => fieldsWithPalette(cur, null))}>
            {t("colorsTemplate")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Photo of a photo template (one spot, both sides): «Încarcă fotografia» /
 * «Schimbă fotografia» in the short edit; on the flyer start screen
 * (`start`) with «Fără fotografie», the one photo every gallery tile shows.
 */
export function CardPhotoSlot({
  api,
  photo,
  onPhoto,
  start = false,
}: {
  api: StudioEditorApi;
  photo: StudioImageSrc | null;
  onPhoto: (p: StudioImageSrc | null) => void;
  start?: boolean;
}) {
  const t = studioCardT(api.lang);
  const ft = studioFlyerT(api.lang);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative flex flex-col gap-1">
      <span className={`text-xs font-bold ${start ? "text-[#5c4c10]" : "text-(--muted)"}`}>{start ? ft("photoTitle") : t("photo")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          {...(start ? { "data-studio-flyer-photo": true } : { "data-studio-card-short-photo": true })}
          onClick={() => input.current?.click()}
          className="flex min-h-11 items-center gap-2 self-start rounded-xl border-[1.5px] border-(--line2) bg-white px-4 text-sm font-bold disabled:opacity-60"
        >
          <Icon d={STUDIO_ICONS.images} size={18} />
          {photo ? t("photoChange") : t("photoAdd")}
        </button>
        {start && photo ? (
          <button type="button" data-studio-flyer-photo-remove onClick={() => onPhoto(null)} className="min-h-11 rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold">
            {ft("photoRemove")}
          </button>
        ) : null}
      </div>
      {start ? <span className="text-[11px] text-(--muted)">{ft("photoHint")}</span> : null}
      {error ? (
        <span role="alert" className="text-xs font-bold text-[#a82e22]">
          {error}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        {...(start ? { "data-studio-flyer-photo-input": true } : {})}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setError(null);
          if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
            setError(api.t("uploadFailed"));
            return;
          }
          setBusy(true);
          try {
            const a = await api.assets.addFile(f);
            onPhoto({ localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime });
          } catch {
            setError(api.t("uploadFailed"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
