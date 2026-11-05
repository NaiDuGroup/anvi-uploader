"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ShopLang } from "@/lib/storefront/i18n";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageSrc, type StudioKind } from "@/lib/studio/document";
import { fitAllTextBoxes, loadTextFonts, onStudioFontsLoaded } from "@/lib/studio/fonts";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { studioStartT } from "@/lib/studio/i18n.start";
import { newImageLayer } from "@/lib/studio/layerFactory";
import { fillStarterPhotos, orderTemplatesForPhotos, switchTemplateKeepTyped, type StudioStarter } from "@/lib/studio/personalise";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioFields } from "@/lib/studio/smartFields";
import { surfaceBase, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import {
  STUDIO_INDUSTRIES,
  STUDIO_INDUSTRY_LABELS,
  STUDIO_OCCASIONS,
  STUDIO_OCCASION_LABELS,
  instantiateStudioTemplate,
  studioTemplatesFor,
  type StudioIndustry,
  type StudioOccasion,
  type StudioTemplate,
} from "@/lib/studio/templates";
import type { StudioEditorApi } from "./StudioApp";
import { PICTURE_ASPECT, PICTURE_BG, cachedPicture, pictureSize, queuePicture, useStableAssets, useStudioProductLook, type StudioProductLook } from "./StudioProductPicture";
import { Icon, STUDIO_ICONS, inputCls } from "./StudioUi";

/** A template as a fresh document for this product, with the customer's details and measured text boxes. */
export async function studioDocFromTemplate(
  tpl: StudioTemplate,
  kind: StudioKind,
  specs: readonly StudioSurfaceSpec[],
  lang: ShopLang,
  fields: StudioFields,
  productColor?: string | null,
): Promise<{ doc: StudioDoc; fontsReady: boolean }> {
  const doc = instantiateStudioTemplate(tpl, kind, specs, lang, fields, productColor);
  const fontsReady: boolean = await loadTextFonts(doc.surfaces.flatMap((s) => s.layers).filter((l) => l.kind === "text"));
  return { doc: fitAllTextBoxes(doc, "all"), fontsReady };
}

/** The customer's photos over the whole print area («cover»), ready to pan / zoom. */
function photoOnlyDoc(kind: StudioKind, specs: readonly StudioSurfaceSpec[], photo: StudioImageSrc): StudioDoc {
  const d = emptyStudioDoc(kind, specs.map(surfaceBase));
  const s = d.surfaces[0]!;
  const layer = { ...newImageLayer(s, photo), x: 0, y: 0, w: s.widthMm, h: s.heightMm, rotation: 0 };
  return addLayer(d, s.id, layer);
}

/** What a thumbnail shows: the template with the customer's details and photos. */
interface ThumbInput {
  kind: StudioKind;
  specs: readonly StudioSurfaceSpec[];
  lang: ShopLang;
  fields: StudioFields;
  photos: readonly StudioImageSrc[];
  assets: StudioRenderAssets;
  look: StudioProductLook;
  productColor: string | null;
}

/** The template as the customer's document (thumbnail and pick share it). */
async function starterDoc(tpl: StudioTemplate | null, i: Pick<ThumbInput, "kind" | "specs" | "lang" | "fields" | "photos" | "productColor">): Promise<{ doc: StudioDoc; fontsReady: boolean }> {
  if (!tpl) return { doc: photoOnlyDoc(i.kind, i.specs, i.photos[0]!), fontsReady: true };
  const r = await studioDocFromTemplate(tpl, i.kind, i.specs, i.lang, i.fields, i.productColor);
  return { doc: fillStarterPhotos(r.doc, i.photos, { hasLogo: !!i.fields.logo }), fontsReady: r.fontsReady };
}

/**
 * Picture of a template on the product (mug front, pen barrel, cover) with
 * the customer's photos and name; drawn once it scrolls into view, through
 * the render queue, cached by template / photos / details / product look.
 */
function TemplateThumb({ tpl, input }: { tpl: StudioTemplate | null; input: ThumbInput }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [cssW, setCssW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (visible && ref.current) setCssW(ref.current.clientWidth);
  }, [visible]);
  // Bumps when a font file arrives after the picture was drawn with a fallback.
  const [fontsEpoch, setFontsEpoch] = useState(0);
  const { kind, specs, lang, fields, photos, assets, look, productColor } = input;
  const size = cssW > 0 ? pictureSize(cssW, PICTURE_ASPECT[kind]) : null;
  const key: string = [tpl?.id ?? "photo", lang, look.key, photos.map((p) => p.localId ?? p.key).join(","), JSON.stringify(fields), size ? `${size.w}x${size.h}` : "-", fontsEpoch].join("|");
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  const url: string | null = (shown?.key === key ? shown.url : null) ?? cachedPicture(key) ?? shown?.url ?? null;
  useEffect(() => {
    if (!visible || !size || cachedPicture(key)) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    void queuePicture(
      key,
      async () => {
        const r = await starterDoc(tpl, { kind, specs, lang, fields, photos, productColor });
        if (!r.fontsReady && !cancelled) off = onStudioFontsLoaded(() => setFontsEpoch((n) => n + 1));
        return r.doc;
      },
      { w: size.w, h: size.h, spec: specs[0]!, assets, look, isCancelled: () => cancelled, turnToContent: photos.length > 0 },
    ).then((u) => {
      if (!cancelled && u) setShown({ key, url: u });
    });
    return () => {
      cancelled = true;
      off?.();
    };
    // `key` covers the inputs; the objects themselves change identity more often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key]);
  return (
    <span
      ref={ref}
      data-studio-thumb={tpl?.id ?? "photo"}
      className="block w-full overflow-hidden rounded-lg"
      style={{ aspectRatio: String(PICTURE_ASPECT[kind]), background: PICTURE_BG }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : null}
    </span>
  );
}

type Filter = { occasion?: StudioOccasion; industry?: StudioIndustry };

function TemplateFilters({ lang, filter, onFilter }: { lang: ShopLang; filter: Filter; onFilter: (f: Filter) => void }) {
  const t = studioShopT(lang);
  const chip = (on: boolean) =>
    `min-h-11 flex-none rounded-full border-[1.5px] px-3.5 text-[13px] font-bold whitespace-nowrap ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink)"}`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-bold text-(--muted)">{t("filterOccasion")}</span>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" className={chip(!filter.occasion && !filter.industry)} onClick={() => onFilter({})}>
            {t("filterAll")}
          </button>
          {STUDIO_OCCASIONS.map((o) => (
            <button key={o} type="button" aria-pressed={filter.occasion === o} className={chip(filter.occasion === o)} onClick={() => onFilter({ occasion: o })}>
              {STUDIO_OCCASION_LABELS[o][lang]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-bold text-(--muted)">{t("filterIndustry")}</span>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STUDIO_INDUSTRIES.map((o) => (
            <button key={o} type="button" aria-pressed={filter.industry === o} className={chip(filter.industry === o)} onClick={() => onFilter({ industry: o })}>
              {STUDIO_INDUSTRY_LABELS[o][lang]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateGrid({
  api,
  fields,
  filter,
  onPick,
  columns,
  photos = [],
  onPhotoOnly,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  filter: Filter;
  onPick: (tpl: StudioTemplate) => void;
  columns: string;
  /** The customer's photos, shown in every template. */
  photos?: readonly StudioImageSrc[];
  /** «Doar fotografia ta» card (first, when there is a photo). */
  onPhotoOnly?: () => void;
}) {
  const t = studioShopT(api.lang);
  const ts = studioStartT(api.lang);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const list = useMemo(() => orderTemplatesForPhotos(studioTemplatesFor(api.kind, filter), api.kind, photos.length), [api.kind, filter, photos.length]);
  const input: ThumbInput = { kind: api.kind, specs: api.specs, lang: api.lang, fields, photos, assets, look, productColor: api.productColor };
  if (list.length === 0) return <p className="m-0 py-6 text-center text-sm text-(--muted2)">{t("noTemplates")}</p>;
  return (
    <ul className={`m-0 grid list-none gap-3 p-0 ${columns}`}>
      {photos.length && onPhotoOnly && !filter.occasion && !filter.industry ? (
        <li className="min-w-0">
          <button type="button" onClick={onPhotoOnly} data-studio-template="photo" className="flex w-full flex-col gap-1.5 rounded-xl border-[1.5px] border-transparent p-1.5 text-left hover:border-(--line2)">
            <TemplateThumb tpl={null} input={input} />
            <span className="truncate px-0.5 text-[13px] font-bold">{ts("photoOnly")}</span>
          </button>
        </li>
      ) : null}
      {list.map((tpl) => (
        <li key={tpl.id} className="min-w-0">
          <button
            type="button"
            onClick={() => onPick(tpl)}
            data-studio-template={tpl.id}
            aria-pressed={api.doc.templateId === tpl.id}
            className={`flex w-full flex-col gap-1.5 rounded-xl border-[1.5px] p-1.5 text-left ${api.doc.templateId === tpl.id ? "border-(--ink)" : "border-transparent hover:border-(--line2)"}`}
          >
            <TemplateThumb tpl={tpl} input={input} />
            <span className="truncate px-0.5 text-[13px] font-bold">{tpl.name[api.lang]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Name typed on the start screen, settled (thumbnails redraw once typing pauses). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Start screen (Main / StartPhone mockups + Studio v2 «Fă-o a ta»): the
 * customer's photos and name first — every template thumbnail shows them on
 * the product — then templates by occasion or industry; a ready design over
 * the whole area or a blank page for the full editor.
 */
export function StudioStartScreen({
  api,
  fields,
  starter,
  onStarter,
  onStart,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  /** Photos and name typed here (kept by the page while the customer goes back and forth). */
  starter: StudioStarter;
  /** Updates from the current value (an upload finishing must not undo a name typed meanwhile). */
  onStarter: (update: (s: StudioStarter) => StudioStarter) => void;
  /** The document to work on (fresh id) and where to go: the short form after a template, else the editor. */
  onStart: (doc: StudioDoc, next: "personalise" | "edit") => void;
}) {
  const t = studioShopT(api.lang);
  const ts = studioStartT(api.lang);
  const [filter, setFilter] = useState<Filter>({});
  const [busy, setBusy] = useState<"photos" | "ready" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const readyInput = useRef<HTMLInputElement>(null);
  const blank = () => emptyStudioDoc(api.kind, api.specs.map(surfaceBase));
  const name: string = useDebounced(starter.name.trim(), 350);
  const thumbFields: StudioFields = useMemo(() => (name ? { ...fields, name } : fields), [fields, name]);
  const nameNow: string = starter.name.trim();
  const pickFields: StudioFields = nameNow ? { ...fields, name: nameNow } : fields;
  const mug: boolean = api.kind === "mug";

  const addPhotos = async (files: File[]) => {
    setError(null);
    setBusy("photos");
    const added: StudioImageSrc[] = [];
    try {
      for (const f of files.slice(0, 6)) {
        if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
          setError(api.t("uploadFailed"));
          continue;
        }
        const a = await api.assets.addFile(f);
        added.push({ localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime });
      }
    } catch {
      setError(api.t("uploadFailed"));
    } finally {
      setBusy(null);
    }
    if (added.length) onStarter((s) => ({ ...s, photos: [...s.photos, ...added].slice(0, 6) }));
  };

  const pick = async (tpl: StudioTemplate) => {
    const { doc: fresh0 } = await starterDoc(tpl, { kind: api.kind, specs: api.specs, lang: api.lang, fields: pickFields, photos: [], productColor: api.productColor });
    // Back from «Personalizează»: keep what the customer typed, drop the old theme's own texts.
    const cur: StudioDoc = api.doc;
    const back: boolean = cur.templateId != null && cur.surfaces.some((s) => s.layers.length > 0);
    let doc: StudioDoc = back ? switchTemplateKeepTyped(cur, fresh0) : fresh0;
    const used = new Set(doc.surfaces.flatMap((s) => s.layers).flatMap((l) => (l.kind === "image" && l.src?.localId ? [l.src.localId] : [])));
    doc = fillStarterPhotos(doc, starter.photos.filter((p) => !p.localId || !used.has(p.localId)), { hasLogo: !!fields.logo });
    doc = fitAllTextBoxes(doc, "all");
    onStart(doc, "personalise");
  };

  const big = "flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-[1.5px] border-(--line) bg-white p-3 text-left hover:border-(--ink)";
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-5 md:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("startTitle")}</h1>
        <p className="m-0 text-sm text-(--muted)">{t("startLead", { product: api.product.name })}</p>
      </div>
      <section aria-labelledby="studio-yours" data-studio-yours className="flex flex-col gap-3 rounded-2xl bg-[#faf3dc] p-3 md:flex-row md:items-end md:gap-4 md:p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id="studio-yours" className="m-0 text-lg font-extrabold">
            {ts("yoursTitle")}
          </h2>
          <p className="m-0 text-[13px] text-[#5c4c10]">{mug ? ts("yoursLead") : ts("yoursLeadOther")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {starter.photos.map((p, i) => (
              <span key={p.localId ?? i} className="relative h-14 w-14 flex-none overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm">
                <PhotoChip src={p} assets={api.renderAssets} />
                <button
                  type="button"
                  aria-label={ts("photoRemove", { n: i + 1 })}
                  onClick={() => onStarter((s) => ({ ...s, photos: s.photos.filter((_, j) => j !== i) }))}
                  className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-bl-lg bg-(--ink) text-white"
                >
                  <Icon d={STUDIO_ICONS.close} size={14} />
                </button>
              </span>
            ))}
            <button
              type="button"
              data-studio-photos-add
              disabled={busy != null}
              aria-busy={busy === "photos"}
              onClick={() => photoInput.current?.click()}
              className="shop-btn-dark flex min-h-12 items-center gap-2 rounded-xl bg-(--ink) px-4 font-extrabold text-white disabled:opacity-60"
            >
              {busy === "photos" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <Icon d={STUDIO_ICONS.images} size={20} />
              )}
              <span aria-live="polite">{busy === "photos" ? ts("photosBusy") : starter.photos.length ? ts("photosAddMore") : ts("photosAdd")}</span>
            </button>
          </div>
          <span className="text-xs text-[#5c4c10]">{ts("photosHint")}</span>
          {error ? (
            <span role="alert" className="text-xs font-bold text-[#a82e22]">
              {error}
            </span>
          ) : null}
        </div>
        <label className="flex min-w-0 flex-col gap-1 md:w-[300px]">
          <span className="text-xs font-bold text-[#5c4c10]">{ts("nameLabel")}</span>
          <input
            type="text"
            data-studio-start-name
            value={starter.name}
            maxLength={60}
            autoComplete="given-name"
            placeholder={ts("namePlaceholder")}
            onChange={(e) => {
              const name = e.target.value;
              onStarter((s) => ({ ...s, name }));
            }}
            className={inputCls}
          />
        </label>
      </section>
      <input
        ref={photoInput}
        type="file"
        multiple
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-photos
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void addPhotos(files);
        }}
      />
      <input
        ref={readyInput}
        type="file"
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-start-photo
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy("ready");
          try {
            const a = await api.assets.addFile(f);
            onStart(photoOnlyDoc(api.kind, api.specs, { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime }), "edit");
          } finally {
            setBusy(null);
          }
        }}
      />
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="m-0 text-lg font-extrabold">{t("startTemplates")}</h2>
        <TemplateFilters lang={api.lang} filter={filter} onFilter={setFilter} />
        <TemplateGrid
          api={api}
          fields={thumbFields}
          filter={filter}
          photos={starter.photos}
          columns={api.kind === "notebook" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : api.kind === "pen" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}
          onPhotoOnly={() => onStart(photoOnlyDoc(api.kind, api.specs, starter.photos[0]!), "personalise")}
          onPick={(tpl) => void pick(tpl)}
        />
      </section>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={big} disabled={busy != null} aria-busy={busy === "ready"} onClick={() => readyInput.current?.click()}>
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-(--soft)">
            {busy === "ready" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon d={STUDIO_ICONS.crop} size={22} />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="text-[15px]">{ts("readyDesign")}</b>
            <span className="text-xs text-(--muted)">{t("startUploadSub")}</span>
          </span>
        </button>
        <button type="button" className={big} onClick={() => onStart(blank(), "edit")}>
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-(--soft)">
            <Icon d={STUDIO_ICONS.text} size={22} />
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="text-[15px]">{t("startBlank")}</b>
            <span className="text-xs text-(--muted)">{t("startBlankSub")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Small square of an uploaded photo (its working copy). */
export function PhotoChip({ src, assets }: { src: StudioImageSrc; assets: StudioRenderAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const bmp = assets.image({ src } as Parameters<StudioRenderAssets["image"]>[0]) as (CanvasImageSource & { width: number; height: number }) | null;
    if (!bmp) return;
    const side = 112;
    c.width = side;
    c.height = side;
    const k = Math.max(side / bmp.width, side / bmp.height);
    ctx.drawImage(bmp, (side - bmp.width * k) / 2, (side - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  }, [src, assets]);
  return <canvas ref={ref} className="block h-full w-full" aria-hidden="true" />;
}

/** «Șabloane» tool panel: switch template at any time, keeping the customer's text and photos. */
export function StudioTemplatesPanel({ api, fields }: { api: StudioEditorApi; fields: StudioFields }) {
  const t = studioShopT(api.lang);
  const [filter, setFilter] = useState<Filter>({});
  const [note, setNote] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="m-0 text-base font-extrabold">{t("templatesPanel")}</h2>
      <p className="m-0 text-xs text-(--muted)">{t("templatesKeep")}</p>
      <TemplateFilters lang={api.lang} filter={filter} onFilter={setFilter} />
      {note ? (
        <p role="status" className="m-0 rounded-lg bg-[#e7f5ec] px-2 py-1.5 text-xs font-bold text-[#1f6b3c]">
          {t("templateApplied")}
        </p>
      ) : null}
      <TemplateGrid
        api={api}
        fields={fields}
        filter={filter}
        columns="grid-cols-2"
        onPick={async (tpl) => {
          const { doc: fresh } = await studioDocFromTemplate(tpl, api.kind, api.specs, api.lang, fields, api.productColor);
          api.setDoc(fitAllTextBoxes(switchTemplateKeepTyped(api.doc, fresh), "all"));
          api.select(null);
          setNote(true);
        }}
      />
    </div>
  );
}
