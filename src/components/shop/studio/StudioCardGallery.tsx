"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { matchingBack } from "@/lib/studio/cardBuild";
import { cardGalleryChips, cardGalleryFronts, cardShortStart, type CardGalleryFilter } from "@/lib/studio/cardFlow";
import { cardShortDocMeasured } from "@/lib/studio/cardFlowClient";
import { emptyStudioDoc, type StudioDoc, type StudioImageSrc } from "@/lib/studio/document";
import type { FlyerFormatId } from "@/lib/studio/flyer";
import { onStudioFontsLoaded } from "@/lib/studio/fonts";
import { cardTilePriceLabel } from "@/lib/studio/i18n.card";
import { studioFlyerT, studioSheetT } from "@/lib/studio/i18n.flyer";
import { formatPrice } from "@/lib/storefront/format";
import { studioShopT } from "@/lib/studio/i18n.shop";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioFields } from "@/lib/studio/smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, initialSurfaceBases, type SheetStudioKind, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { CARD_STYLE_LABELS, FLYER_PURPOSE_LABELS, STUDIO_INDUSTRY_LABELS, type StudioTemplate } from "@/lib/studio/templates";
import type { StudioEditorApi } from "./StudioApp";
import {
  CARD_AUTOCOMPLETE,
  CARD_FIELD_KEYS,
  CARD_FIELD_LABEL,
  CARD_INPUT_MODE,
  CARD_INPUT_TYPE,
  CardColorsRow,
  CardLogoButton,
  CardPhotoSlot,
  FLYER_FIELD_LABEL,
  useCardFieldSetter,
  useLogoPalette,
  type CardTextFieldKey,
  type FlyerTextFieldKey,
} from "./StudioCardFields";
import { FlyerFormatChips, flyerFormatOfSpecs, useSheetSidePrices } from "./StudioFlyer";
import { PICTURE_BG, cachedPicture, pictureSize, queuePicture, useStableAssets, useStudioProductLook, type StudioProductLook } from "./StudioProductPicture";
import { Icon, STUDIO_ICONS, inputCls } from "./StudioUi";

/**
 * Business cards, first screens: «Datele tale» (details + logo, whose
 * colours become the brand colours) and «Alege un model» — every front drawn
 * with those details, its matching back peeking from the corner. On wide
 * screens both side by side (the gallery follows the typing); on phones two
 * steps («Vezi modelele»). Flyers (`flyer`): their texts, contacts, logo
 * and ONE photo (every tile shows it), chips by purpose and style, the
 * format switch (every tile re-drawn) and the default pack's live price.
 */

const sheetKindOf = (api: Pick<StudioEditorApi, "kind">): SheetStudioKind => (api.kind === "flyer" ? "flyer" : "card");

/** Width / height of a side as cut (the file without its bleed). */
export function trimmedAspect(spec: StudioSurfaceSpec): number {
  return (spec.widthMm - 2 * spec.bleedMm) / (spec.heightMm - 2 * spec.bleedMm);
}

/** A typing pause (pictures redraw once it settles). */
export function useSettled<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** One build per template + details for both pictures of a tile (front and back). */
const builds = new Map<string, Promise<{ doc: StudioDoc; fontsReady: boolean } | null>>();
function galleryDoc(tpl: StudioTemplate, back: StudioTemplate | null, key: string, fields: StudioFields, api: Pick<StudioEditorApi, "lang" | "specs">, photo: StudioImageSrc | null = null) {
  let p = builds.get(key);
  if (!p) {
    p = cardShortDocMeasured({ ...cardShortStart(tpl), backId: back?.id ?? null, photo }, { fields, lang: api.lang, specs: api.specs });
    builds.set(key, p);
    // Measured before its fonts arrived: not kept (the next drawing measures again).
    const mine = p;
    void p.then((r) => r && !r.fontsReady && builds.get(key) === mine && builds.delete(key));
    while (builds.size > 60) builds.delete(builds.keys().next().value!);
  }
  return p;
}

/**
 * A card side as a picture (cut card edge to edge, no background), drawn
 * once visible through the shared render queue, cached by key; redrawn when
 * a font or the logo arrives after the first drawing.
 */
export function CardSidePicture({
  tpl,
  back: backTpl,
  side,
  fields,
  api,
  assets,
  look,
  className,
  visible,
  photo = null,
}: {
  tpl: StudioTemplate;
  /** Flyers: the start screen's photo (photo templates show it). */
  photo?: StudioImageSrc | null;
  /** The back drawn (default: the front's matching back). */
  back?: StudioTemplate | null;
  side: "front" | "back";
  fields: StudioFields;
  api: StudioEditorApi;
  assets: StudioRenderAssets;
  look: StudioProductLook;
  className: string;
  visible: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const spec: StudioSurfaceSpec | undefined = api.specs.find((s) => s.id === (side === "back" ? CARD_BACK_ID : CARD_FRONT_ID));
  const aspect: number = spec ? trimmedAspect(spec) : 1.8;
  const [cssW, setCssW] = useState(0);
  useEffect(() => {
    if (visible && ref.current) setCssW(ref.current.clientWidth);
  }, [visible]);
  const [epoch, setEpoch] = useState(0);
  const size = cssW > 0 ? pictureSize(cssW, aspect) : null;
  const fieldsKey: string = JSON.stringify(fields);
  const back: StudioTemplate | null = backTpl !== undefined ? backTpl : matchingBack(tpl);
  // Flyers: the format (every tile re-drawn at it) and the photo are part of the picture.
  const sheetKey: string = api.kind === "flyer" ? `${api.specs.map((s) => `${s.widthMm}x${s.heightMm}`).join(",")}|${photo?.localId ?? photo?.key ?? "-"}` : "";
  const buildKey: string = [tpl.id, back?.id ?? "-", api.lang, fieldsKey, epoch, ...(sheetKey ? [sheetKey] : [])].join("|");
  const key: string = ["card-gallery", side, buildKey, size ? `${size.w}x${size.h}` : "-"].join("|");
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  const url: string | null = (shown?.key === key ? shown.url : null) ?? cachedPicture(key) ?? shown?.url ?? null;
  useEffect(() => {
    if (!visible || !size || !spec || cachedPicture(key)) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    let retry: number | null = null;
    let fontsOk = true;
    void queuePicture(
      key,
      async () => {
        const r = await galleryDoc(tpl, back, buildKey, fields, api, photo);
        fontsOk = r?.fontsReady ?? true;
        if (r && !r.fontsReady && !cancelled && epoch < 4) {
          // Redraw once the fonts are in: on the next «loadingdone», or right away if they landed meanwhile.
          const again = () => !cancelled && setEpoch((n) => n + 1);
          off = onStudioFontsLoaded(again);
          void document.fonts?.ready.then(() => window.setTimeout(again, 50));
        }
        return r?.doc ?? emptyStudioDoc(sheetKindOf(api), initialSurfaceBases(api.specs));
      },
      { w: size.w, h: size.h, spec, assets, look, isCancelled: () => cancelled, cardFill: 1, cacheable: () => fontsOk },
    ).then((u) => {
      if (cancelled || !u) return;
      setShown({ key, url: u });
      // Not cached = the logo / photo was not decoded yet: once more a bit later.
      if (!cachedPicture(key) && epoch < 3) retry = window.setTimeout(() => setEpoch((n) => n + 1), 500);
    });
    return () => {
      cancelled = true;
      off?.();
      if (retry != null) window.clearTimeout(retry);
    };
    // `key` covers the inputs; the objects themselves change identity more often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key]);
  return (
    <span ref={ref} className={`block overflow-hidden bg-white ${className}`} style={{ aspectRatio: String(aspect) }} data-studio-card-picture={side}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={url} alt="" className="block h-full w-full" />
      ) : null}
    </span>
  );
}

function GalleryTile({
  tpl,
  fields,
  api,
  assets,
  look,
  onPick,
  busy,
  price,
  photo = null,
}: {
  tpl: StudioTemplate;
  fields: StudioFields;
  api: StudioEditorApi;
  assets: StudioRenderAssets;
  look: StudioProductLook;
  onPick: (tpl: StudioTemplate) => void;
  busy: boolean;
  price: string;
  photo?: StudioImageSrc | null;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting && x.boundingClientRect.width > 0) && setVisible(true), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const name: string = tpl.name[api.lang];
  return (
    <li ref={ref} className="min-w-0">
      <button
        type="button"
        data-studio-template={tpl.id}
        onClick={() => onPick(tpl)}
        aria-label={`${name}, ${price}`}
        aria-busy={busy || undefined}
        className={`group flex w-full flex-col gap-1.5 rounded-2xl border-[1.5px] p-1.5 text-left hover:border-(--line2) focus-visible:border-(--ink) ${busy ? "border-(--ink) opacity-70" : "border-transparent"}`}
      >
        <span className="relative block w-full rounded-xl px-[5%] pt-[5%] pb-[11%]" style={{ background: PICTURE_BG }}>
          <CardSidePicture tpl={tpl} side="front" fields={fields} api={api} assets={assets} look={look} visible={visible} photo={photo} className="w-[88%] rounded-[3px] shadow-[0_6px_16px_rgba(20,33,61,0.22)] transition-transform group-hover:-translate-y-0.5" />
          <CardSidePicture
            tpl={tpl}
            side="back"
            fields={fields}
            api={api}
            assets={assets}
            look={look}
            visible={visible}
            photo={photo}
            className="absolute right-[3.5%] bottom-[5%] w-[30%] rounded-[2px] shadow-[0_4px_12px_rgba(20,33,61,0.28)] ring-2 ring-white"
          />
        </span>
        <span className="flex min-w-0 flex-col px-0.5">
          <span className="truncate text-[13px] font-bold">{name}</span>
          <span className="truncate text-xs text-(--muted)" data-studio-tile-price>
            {price}
          </span>
        </span>
      </button>
    </li>
  );
}

/** «Toate» + industries (flyers: purposes) + styles (one chip at a time). */
function GalleryFilters({ api, filter, onFilter }: { api: StudioEditorApi; filter: CardGalleryFilter; onFilter: (f: CardGalleryFilter) => void }) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const { industries, styles, purposes } = useMemo(() => cardGalleryChips(kind), [kind]);
  const chip = (on: boolean) =>
    `min-h-11 flex-none rounded-full border-[1.5px] px-3.5 text-[13px] font-bold whitespace-nowrap ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink)"}`;
  const none: boolean = !filter.industry && !filter.style && !filter.purpose;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-studio-card-filters>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("filterStyle")}>
        <button type="button" aria-pressed={none} className={chip(none)} onClick={() => onFilter({})}>
          {t("filterAll")}
        </button>
        {styles.map((s) => (
          <button key={s} type="button" aria-pressed={filter.style === s} data-studio-card-filter={`style:${s}`} className={chip(filter.style === s)} onClick={() => onFilter(filter.style === s ? {} : { style: s })}>
            {CARD_STYLE_LABELS[s][api.lang]}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("filterIndustry")}>
        {kind === "flyer"
          ? purposes.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={filter.purpose === p}
                data-studio-card-filter={`purpose:${p}`}
                className={chip(filter.purpose === p)}
                onClick={() => onFilter(filter.purpose === p ? {} : { purpose: p })}
              >
                {FLYER_PURPOSE_LABELS[p][api.lang]}
              </button>
            ))
          : null}
        {industries.map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={filter.industry === i}
            data-studio-card-filter={`industry:${i}`}
            className={chip(filter.industry === i)}
            onClick={() => onFilter(filter.industry === i ? {} : { industry: i })}
          >
            {STUDIO_INDUSTRY_LABELS[i][api.lang]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** «Alege un model»: every front with the customer's details, logo and colours. */
export function StudioCardGallery({
  api,
  fields,
  onPick,
  onBlank,
  busy = null,
  photo = null,
  onFormat,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onPick: (tpl: StudioTemplate) => void;
  onBlank: () => void;
  /** The template being opened (its tile shows it). */
  busy?: string | null;
  /** Flyers: the start screen's photo. */
  photo?: StudioImageSrc | null;
  /** Flyers: another format. */
  onFormat?: (f: FlyerFormatId) => void;
}) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const ts = studioShopT(api.lang);
  const [filter, setFilter] = useState<CardGalleryFilter>({});
  const list: StudioTemplate[] = useMemo(() => cardGalleryFronts(filter, kind), [filter, kind]);
  // Tile price: cards «de la … / 100 buc.» (fixed list); flyers the default pack, front only, in this format (live quote).
  const format: FlyerFormatId = flyerFormatOfSpecs(api.specs);
  const flyerPrices = useSheetSidePrices(kind, api.lang, format, kind === "flyer");
  const price: string =
    kind === "flyer" ? (flyerPrices.one != null ? t("packPrice", { price: formatPrice(flyerPrices.one, api.lang), n: flyerPrices.pack }) : "…") : cardTilePriceLabel(api.lang);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const shown: StudioFields = useSettled(fields, 350);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-studio-card-gallery>
      {kind === "flyer" && onFormat ? <FlyerFormatChips lang={api.lang} value={format} onChange={onFormat} /> : null}
      <GalleryFilters api={api} filter={filter} onFilter={setFilter} />
      {list.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-(--muted2)">{ts("noTemplates")}</p>
      ) : (
        <ul className={`m-0 grid list-none gap-2 p-0 ${kind === "flyer" ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
          {list.map((tpl) => (
            <GalleryTile key={tpl.id} tpl={tpl} fields={shown} api={api} assets={assets} look={look} onPick={onPick} busy={busy === tpl.id} price={price} photo={photo} />
          ))}
        </ul>
      )}
      <button
        type="button"
        data-studio-card-blank
        onClick={onBlank}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-[1.5px] border-(--line) bg-white p-3 text-left hover:border-(--ink)"
      >
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-(--soft)">
          <Icon d={STUDIO_ICONS.text} size={22} />
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="text-[15px]">{t("blank")}</b>
          <span className="text-xs text-(--muted)">{t("blankSub")}</span>
        </span>
      </button>
    </div>
  );
}

/**
 * Start of the card Studio: «Datele tale» and the personalised gallery
 * (side by side from `lg`, two steps below).
 */
export function StudioCardStart({
  api,
  fields,
  onFields,
  onPick,
  onBlank,
  initialStep = "details",
  photo = null,
  onPhoto,
  onFormat,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onFields: (f: StudioFields) => void;
  onPick: (tpl: StudioTemplate) => void | Promise<void>;
  onBlank: () => void;
  /** Phones: back from the short edit («Alt model») opens on the gallery. */
  initialStep?: "details" | "gallery";
  /** Flyers: the one photo of the start screen (every photo template shows it). */
  photo?: StudioImageSrc | null;
  onPhoto?: (p: StudioImageSrc | null) => void;
  /** Flyers: another format. */
  onFormat?: (f: FlyerFormatId) => void;
}) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const ts = studioShopT(api.lang);
  const [step, setStep] = useState<"details" | "gallery">(initialStep);
  const [busy, setBusy] = useState<string | null>(null);
  const set = useCardFieldSetter(fields, onFields);
  const logoPalette = useLogoPalette(api, fields.logo);
  const top = useRef<HTMLDivElement>(null);
  const go = (s: "details" | "gallery") => {
    setStep(s);
    top.current?.scrollIntoView({ block: "start" });
  };
  return (
    <div ref={top} className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 md:px-6" data-studio-card-start data-step={step}>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{step === "gallery" ? <span className="lg:hidden">{t("galleryTitle")}</span> : null}<span className={step === "gallery" ? "hidden lg:inline" : ""}>{t("startTitle")}</span></h1>
        <p className="m-0 text-sm text-(--muted)">{step === "gallery" ? t("galleryLead") : t("startLead")}</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          aria-labelledby="studio-card-fields"
          noValidate
          className={`${step === "gallery" ? "hidden lg:flex" : "flex"} flex-col gap-2.5 rounded-2xl bg-[#faf3dc] p-3 md:p-4 lg:sticky lg:top-4`}
          onSubmit={(e) => {
            e.preventDefault();
            go("gallery");
          }}
        >
          <h2 id="studio-card-fields" className="m-0 text-lg font-extrabold">
            {t("fieldsTitle")}
          </h2>
          {kind === "flyer" ? (
            <FlyerStartFields api={api} fields={fields} set={set} />
          ) : (
            CARD_FIELD_KEYS.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs font-bold text-[#5c4c10]">{ts(CARD_FIELD_LABEL[k])}</span>
                <input
                  type={CARD_INPUT_TYPE[k] ?? "text"}
                  inputMode={CARD_INPUT_MODE[k]}
                  autoComplete={CARD_AUTOCOMPLETE[k]}
                  data-studio-card-field={k}
                  value={fields[k] ?? ""}
                  maxLength={120}
                  onChange={(e) => set({ [k]: e.target.value })}
                  className={inputCls}
                />
              </label>
            ))
          )}
          <CardLogoButton api={api} fields={fields} set={set} />
          {kind === "flyer" && onPhoto ? <CardPhotoSlot api={api} photo={photo} onPhoto={onPhoto} start /> : null}
          <CardColorsRow api={api} fields={fields} set={set} logoPalette={logoPalette} />
          <button type="submit" data-studio-card-see className="shop-btn-dark mt-1 flex min-h-12 items-center justify-center rounded-xl bg-(--ink) px-5 text-[15px] font-extrabold text-white lg:hidden">
            {t("seeModels")} →
          </button>
        </form>
        <section aria-labelledby="studio-card-gallery-title" className={`${step === "details" ? "hidden lg:flex" : "flex"} min-w-0 flex-col gap-3`}>
          <div className="flex items-center justify-end gap-2 lg:justify-between">
            <h2 id="studio-card-gallery-title" className="m-0 hidden text-lg font-extrabold lg:block">
              {t("galleryTitle")}
            </h2>
            <button type="button" data-studio-card-edit-details onClick={() => go("details")} className="flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold lg:hidden">
              <Icon d={STUDIO_ICONS.edit} size={16} />
              {t("editDetails")}
            </button>
          </div>
          <StudioCardGallery
            api={api}
            fields={fields}
            busy={busy}
            photo={photo}
            onFormat={onFormat}
            onPick={(tpl) => {
              if (busy) return;
              setBusy(tpl.id);
              void Promise.resolve(onPick(tpl)).finally(() => setBusy(null));
            }}
            onBlank={onBlank}
          />
        </section>
      </div>
    </div>
  );
}

/** Flyer start screen: the flyer's texts (body and list on several lines), then the contacts. */
const FLYER_START_TEXTS: readonly FlyerTextFieldKey[] = ["headline", "subheadline", "body", "bullets", "offer", "date"];
const FLYER_START_CONTACTS: readonly CardTextFieldKey[] = ["company", "phone", "site", "address", "email"];

function FlyerStartFields({ api, fields, set }: { api: StudioEditorApi; fields: StudioFields; set: ReturnType<typeof useCardFieldSetter> }) {
  const ft = studioFlyerT(api.lang);
  const ts = studioShopT(api.lang);
  return (
    <>
      <h3 className="m-0 text-[13px] font-extrabold text-[#5c4c10]">{ft("textsTitle")}</h3>
      {FLYER_START_TEXTS.map((k) => {
        const long: boolean = k === "body" || k === "bullets";
        const common = {
          "data-studio-card-field": k,
          value: fields[k] ?? "",
          maxLength: long ? 400 : 120,
          className: long ? `${inputCls} h-auto py-2` : inputCls,
        };
        return (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#5c4c10]">{ft(FLYER_FIELD_LABEL[k])}</span>
            {long ? (
              <textarea {...common} rows={k === "bullets" ? 4 : 3} onChange={(e) => set({ [k]: e.target.value })} />
            ) : (
              <input type="text" {...common} onChange={(e) => set({ [k]: e.target.value })} />
            )}
            {k === "bullets" ? <span className="text-[11px] text-[#5c4c10]/80">{ft("fBulletsHint")}</span> : null}
          </label>
        );
      })}
      <h3 className="m-0 mt-1 text-[13px] font-extrabold text-[#5c4c10]">{ft("contactsTitle")}</h3>
      {FLYER_START_CONTACTS.map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#5c4c10]">{k === "email" ? ft("fEmailOptional") : ts(CARD_FIELD_LABEL[k])}</span>
          <input
            type={CARD_INPUT_TYPE[k] ?? "text"}
            inputMode={CARD_INPUT_MODE[k]}
            autoComplete={CARD_AUTOCOMPLETE[k]}
            data-studio-card-field={k}
            value={fields[k] ?? ""}
            maxLength={120}
            onChange={(e) => set({ [k]: e.target.value })}
            className={inputCls}
          />
        </label>
      ))}
    </>
  );
}
