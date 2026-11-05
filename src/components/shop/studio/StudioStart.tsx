"use client";

import { useEffect, useRef, useState } from "react";
import type { ShopLang } from "@/lib/storefront/i18n";
import { STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioKind } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { fitAllTextBoxes, loadTextFonts } from "@/lib/studio/fonts";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { newImageLayer } from "@/lib/studio/layerFactory";
import type { StudioRenderAssets } from "@/lib/studio/render";
import { carryOverTemplate, type StudioFields } from "@/lib/studio/smartFields";
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
import { Icon, STUDIO_ICONS } from "./StudioUi";

/** A template as a fresh document for this product, with the customer's details and measured text boxes. */
export async function studioDocFromTemplate(
  tpl: StudioTemplate,
  kind: StudioKind,
  specs: readonly StudioSurfaceSpec[],
  lang: ShopLang,
  fields: StudioFields,
  productColor?: string | null,
): Promise<StudioDoc> {
  const doc = instantiateStudioTemplate(tpl, kind, specs, lang, fields, productColor);
  await loadTextFonts(doc.surfaces.flatMap((s) => s.layers).filter((l) => l.kind === "text"));
  return fitAllTextBoxes(doc, "all");
}

/** Small 2D picture of a template on this product, drawn when it scrolls into view. */
function TemplateThumb({
  tpl,
  kind,
  specs,
  lang,
  fields,
  assets,
  background,
}: {
  tpl: StudioTemplate;
  kind: StudioKind;
  specs: readonly StudioSurfaceSpec[];
  lang: ShopLang;
  fields: StudioFields;
  assets: StudioRenderAssets;
  background: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
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
    if (!visible) return;
    let cancelled = false;
    void studioDocFromTemplate(tpl, kind, specs, lang, fields, background).then((doc) => {
      if (cancelled) return;
      const c = renderPreviewCanvas(doc, specs[0]!, assets, 420);
      setUrl(c.toDataURL("image/png"));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tpl, kind, specs, lang, fields, assets, background]);
  const spec = specs[0]!;
  return (
    <span
      ref={ref}
      className="block w-full overflow-hidden rounded-lg border border-(--line)"
      style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}`, background, maxHeight: kind === "notebook" ? 240 : undefined }}
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
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  filter: Filter;
  onPick: (tpl: StudioTemplate) => void;
  columns: string;
}) {
  const t = studioShopT(api.lang);
  const list = studioTemplatesFor(api.kind, filter);
  if (list.length === 0) return <p className="m-0 py-6 text-center text-sm text-(--muted2)">{t("noTemplates")}</p>;
  return (
    <ul className={`m-0 grid list-none gap-3 p-0 ${columns}`}>
      {list.map((tpl) => (
        <li key={tpl.id} className="min-w-0">
          <button
            type="button"
            onClick={() => onPick(tpl)}
            aria-pressed={api.doc.templateId === tpl.id}
            className={`flex w-full flex-col gap-1.5 rounded-xl border-[1.5px] p-1.5 text-left ${api.doc.templateId === tpl.id ? "border-(--ink)" : "border-transparent hover:border-(--line2)"}`}
          >
            <TemplateThumb tpl={tpl} kind={api.kind} specs={api.specs} lang={api.lang} fields={fields} assets={api.renderAssets} background={api.productColor ?? "#ffffff"} />
            <span className="truncate px-0.5 text-[13px] font-bold">{tpl.name[api.lang]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Start screen (Main / StartPhone mockups): templates by occasion or
 * industry, «Încarcă designul tău» (photo / logo over the whole area) and
 * «Pornește de la zero».
 */
export function StudioStartScreen({
  api,
  fields,
  onStart,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  /** The document to edit (fresh id). */
  onStart: (doc: StudioDoc) => void;
}) {
  const t = studioShopT(api.lang);
  const [filter, setFilter] = useState<Filter>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const blank = () => emptyStudioDoc(api.kind, api.specs.map(surfaceBase));

  const big = "flex min-h-[72px] w-full items-center gap-3 rounded-2xl border-[1.5px] border-(--line) bg-white p-3 text-left hover:border-(--ink)";
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-5 md:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("startTitle")}</h1>
        <p className="m-0 text-sm text-(--muted)">{t("startLead", { product: api.product.name })}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={big} disabled={busy} onClick={() => fileInput.current?.click()}>
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-[#faf3dc] text-[#7a6512]">
            <Icon d={STUDIO_ICONS.images} size={24} />
          </span>
          <span className="flex min-w-0 flex-col">
            <b>{t("startUpload")}</b>
            <span className="text-xs text-(--muted)">{t("startUploadSub")}</span>
          </span>
        </button>
        <button type="button" className={big} onClick={() => onStart(blank())}>
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-(--soft)">
            <Icon d={STUDIO_ICONS.text} size={24} />
          </span>
          <span className="flex min-w-0 flex-col">
            <b>{t("startBlank")}</b>
            <span className="text-xs text-(--muted)">{t("startBlankSub")}</span>
          </span>
        </button>
      </div>
      <input
        ref={fileInput}
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
          setBusy(true);
          try {
            const a = await api.assets.addFile(f);
            const d = blank();
            const s = d.surfaces[0]!;
            // The photo over the whole print area («cover»), ready to pan / zoom.
            const layer = { ...newImageLayer(s, { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime }), x: 0, y: 0, w: s.widthMm, h: s.heightMm, rotation: 0 };
            onStart(addLayer(d, s.id, layer));
          } finally {
            setBusy(false);
          }
        }}
      />
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="m-0 text-lg font-extrabold">{t("startTemplates")}</h2>
        <TemplateFilters lang={api.lang} filter={filter} onFilter={setFilter} />
        <TemplateGrid
          api={api}
          fields={fields}
          filter={filter}
          columns={api.kind === "notebook" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"}
          onPick={async (tpl) => onStart(await studioDocFromTemplate(tpl, api.kind, api.specs, api.lang, fields, api.productColor))}
        />
      </section>
    </div>
  );
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
          const fresh = await studioDocFromTemplate(tpl, api.kind, api.specs, api.lang, fields, api.productColor);
          api.setDoc(fitAllTextBoxes(carryOverTemplate(api.doc, fresh), "all"));
          api.select(null);
          setNote(true);
        }}
      />
    </div>
  );
}
