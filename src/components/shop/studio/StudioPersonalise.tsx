"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { imageDrawRect, panCrop, type StudioImageLayer, type StudioTextLayer } from "@/lib/studio/document";
import { fitAllTextBoxes } from "@/lib/studio/fonts";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { studioStartT, type StudioStartKey } from "@/lib/studio/i18n.start";
import { studioQuoteLine } from "@/lib/studio/productLine";
import { bestMugViewCenter, mugViewCenters } from "@/lib/studio/productMockup";
import { personaliseSlots, setSlotPhoto, setSlotText, type StudioSlot } from "@/lib/studio/personalise";
import type { StudioRenderAssets } from "@/lib/studio/render";
import { studioTemplateById } from "@/lib/studio/templates";
import { hasColorChoice, studioColorChoices } from "@/lib/studio/variantColors";
import { OptionPicker } from "../ProductBits";
import { useShopLang } from "../ShopLangProvider";
import type { StudioEditorApi } from "./StudioApp";
import { StudioLivePicture, useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import { StudioQualityDialog, StudioQualityList, useStudioQuality } from "./StudioQuality";
import { Icon, STUDIO_ICONS, Slider, inputCls } from "./StudioUi";

/**
 * «Personalizează» (Studio v2): after a template, only its slots — photos
 * (change, zoom, drag to frame), name, date, other texts — next to a live
 * picture of the product. «Continuă» goes to «Verifică designul» (red quality
 * items block it, yellow ones are accepted in the dialog); «Editare avansată»
 * opens the full editor. One column on phones, actions pinned at the bottom.
 */

const FIELD_LABEL: Record<Exclude<Extract<StudioSlot, { kind: "text" }>["field"], "text">, StudioStartKey> = {
  name: "slotName",
  title: "slotTitle",
  company: "slotCompany",
  phone: "slotPhone",
  email: "slotEmail",
  site: "slotSite",
  address: "slotAddress",
  date: "slotDate",
};

export function StudioPersonalise({
  api,
  onEdit,
  onContinue,
  onBack,
}: {
  api: StudioEditorApi;
  /** Full editor (optionally with a layer selected). */
  onEdit: (layerId?: string | null) => void;
  onContinue: () => void;
  /** Back to the templates. */
  onBack: () => void;
}) {
  const ts = studioStartT(api.lang);
  const t = studioShopT(api.lang);
  const { t: shopT } = useShopLang();
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const slots: StudioSlot[] = useMemo(() => personaliseSlots(api.doc), [api.doc]);
  const q = useStudioQuality(api);
  const [dialog, setDialog] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // The screen scrolls as one: open at the top, not where the templates were scrolled to.
  useEffect(() => {
    root.current?.scrollIntoView({ block: "start" });
  }, []);
  const radiusMm: number = look.mug ? ((look.mug.shape.topDiameterCm + look.mug.shape.bottomDiameterCm) / 4) * 10 : 0;
  const centers = look.mug ? mugViewCenters(api.spec.widthMm, radiusMm) : null;
  // Opens turned like the template thumbnail (towards the photos); the buttons turn it a quarter at a time.
  const [auto] = useState<number>(() => (look.mug ? bestMugViewCenter(api.doc.surfaces[0]?.layers ?? [], api.spec.widthMm, radiusMm) : 0));
  const [view, setView] = useState<0 | 1 | 2 | null>(null);
  const colorChoices = useMemo(() => studioColorChoices(api.product.variants), [api.product.variants]);
  const tpl = studioTemplateById(api.doc.templateId);
  const quoteLine = useMemo(() => (api.variant ? studioQuoteLine(api.kind, api.product, api.variant, 1) : null), [api.kind, api.product, api.variant]);
  const quote = useLiveQuote(quoteLine, api.lang);
  const price: number | null =
    quote.status === "done" && quote.line.ok ? quote.line.total : quote.status === "loading" && quote.previous?.ok ? quote.previous.total : null;

  const go = () => {
    if (q.blocks || q.yellow > 0) setDialog(true);
    else onContinue();
  };
  const layerOf = (id: string) => api.doc.surfaces.flatMap((s) => s.layers).find((l) => l.id === id);

  return (
    <div
      ref={root}
      className="mx-auto grid w-full max-w-[1180px] items-start gap-4 px-4 pt-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-x-8 md:gap-y-4 md:px-6 md:py-6"
      data-studio-personalise
    >
      <div className="flex min-w-0 flex-col gap-1 md:col-start-2 md:row-start-1">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 self-start text-sm font-bold text-(--muted)">
          <Icon d={STUDIO_ICONS.back} size={18} />
          {ts("otherTemplate")}
        </button>
        <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{ts("personaliseTitle")}</h1>
        <p className="m-0 text-sm text-(--muted)">
          {tpl ? `${ts("templateFor", { name: tpl.name[api.lang] })} · ` : ""}
          {ts("personaliseLead")}
        </p>
      </div>
      {/* Phones: title, a compact picture, then the form; desktop: picture on the left, sticky. */}
      <div className="flex min-w-0 flex-col gap-3 md:sticky md:top-4 md:col-start-1 md:row-span-2 md:row-start-1">
        <div className="mx-auto w-full max-w-[300px] md:max-w-none">
          <StudioLivePicture
            doc={api.doc}
            spec={api.spec}
            assets={assets}
            look={look}
            version={api.version}
            label={ts("previewAlt")}
            centerMm={centers ? (view == null ? auto : centers[view]) : undefined}
          />
        </div>
        {centers ? (
          <div role="group" aria-label={ts("viewLabel")} className="flex gap-1 self-center rounded-[11px] bg-(--soft) p-1">
            {(["viewLeft", "viewFront", "viewRight"] as const).map((k, i) => (
              <button
                key={k}
                type="button"
                data-studio-view={i}
                aria-pressed={view === i}
                onClick={() => setView(i as 0 | 1 | 2)}
                className={`min-h-10 rounded-lg px-4 text-sm font-bold ${view === i ? "bg-white shadow-sm" : "text-(--muted)"}`}
              >
                {ts(k)}
              </button>
            ))}
          </div>
        ) : null}
        {hasColorChoice(colorChoices) ? (
          <OptionPicker
            title={ts("color")}
            options={colorChoices.map((c) => ({
              ...c,
              disabledLabel: shopT("optionOutOfStock", { name: c.label }),
            }))}
            value={api.variant?.id ?? ""}
            onChange={(k) => api.setVariant(k)}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-4 md:col-start-2">
        {slots.length === 0 ? <p className="m-0 text-sm text-(--muted2)">{ts("noSlots")}</p> : null}
        <div className="flex flex-col gap-3">
          {slots.map((s) =>
            s.kind === "photo" ? (
              <PhotoSlot
                key={s.layerId}
                api={api}
                assets={assets}
                layer={layerOf(s.layerId) as StudioImageLayer}
                label={s.logo ? ts("slotLogo") : ts("slotPhoto", { n: s.index })}
              />
            ) : (
              <TextSlot
                key={s.layerId}
                label={s.field === "text" ? ts("slotText", { n: s.index }) : ts(FIELD_LABEL[s.field])}
                layer={layerOf(s.layerId) as StudioTextLayer}
                onChange={(v) => api.setDoc(fitAllTextBoxes(setSlotText(api.doc, s.layerId, v), "all"), `personalise:${s.layerId}`)}
              />
            ),
          )}
        </div>

        {q.red || q.yellow ? <StudioQualityList q={q} lang={api.lang} onPick={(it) => onEdit(it.layerId ?? null)} /> : null}

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-(--line) bg-white px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
          <button
            type="button"
            data-studio-personalise-continue
            onClick={go}
            disabled={q.blocks}
            title={q.blocks ? t("qualityBlocked") : undefined}
            className="shop-btn-dark flex min-h-13 items-center justify-center gap-2 rounded-xl bg-(--ink) px-5 py-3 text-[17px] font-extrabold text-white disabled:opacity-40"
          >
            <span>{ts("continue")}</span>
            {price != null ? <span className="font-bold opacity-80">· {formatPrice(price, api.lang)}</span> : null}
          </button>
          {q.blocks ? <span className="text-center text-xs font-bold text-[#a82e22]">{t("qualityBlocked")}</span> : null}
          <button
            type="button"
            data-studio-personalise-edit
            onClick={() => onEdit(null)}
            className="flex min-h-12 flex-col items-center justify-center rounded-xl border-[1.5px] border-(--line2) px-4 py-1.5 font-bold"
          >
            <span>{ts("editMore")}</span>
            <span className="text-xs font-semibold text-(--muted)">{ts("editMoreSub")}</span>
          </button>
        </div>
      </div>

      {dialog ? (
        <StudioQualityDialog
          q={q}
          lang={api.lang}
          onPick={(it) => {
            setDialog(false);
            onEdit(it.layerId ?? null);
          }}
          onAccept={() => {
            setDialog(false);
            onContinue();
          }}
          onClose={() => setDialog(false)}
        />
      ) : null}
    </div>
  );
}

function TextSlot({ label, layer, onChange }: { label: string; layer: StudioTextLayer | undefined; onChange: (v: string) => void }) {
  if (!layer) return null;
  // A template sample shows as the hint until the customer types.
  const value: string = layer.placeholder ? "" : layer.text;
  const multiline: boolean = layer.text.includes("\n");
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-bold">{label}</span>
      {multiline ? (
        <textarea
          data-studio-slot-text={layer.bind ?? layer.id}
          value={value}
          placeholder={layer.text}
          rows={Math.min(4, layer.text.split("\n").length)}
          maxLength={400}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} h-auto py-2`}
        />
      ) : (
        <input
          type="text"
          data-studio-slot-text={layer.bind ?? layer.id}
          value={value}
          placeholder={layer.text}
          maxLength={400}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
    </label>
  );
}

/** A photo slot: picture with drag-to-frame, zoom, change. */
function PhotoSlot({ api, assets, layer, label }: { api: StudioEditorApi; assets: StudioRenderAssets; layer: StudioImageLayer | undefined; label: string }) {
  const ts = studioStartT(api.lang);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const BOX = 112;
  const ratio: number = layer ? layer.w / layer.h : 1;
  const boxW: number = ratio >= 1 ? BOX : Math.round(BOX * ratio);
  const boxH: number = ratio >= 1 ? Math.round(BOX / ratio) : BOX;
  const pxPerMm: number = layer ? boxW / layer.w : 1;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !layer) return;
    const dpr: number = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(boxW * dpr);
    c.height = Math.round(boxH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#eef0f3";
    ctx.fillRect(0, 0, boxW, boxH);
    const bmp = layer.src ? assets.image(layer) : null;
    if (!bmp || !layer.src) return;
    const r = imageDrawRect(layer, layer.src.naturalW, layer.src.naturalH);
    ctx.drawImage(bmp, r.x * pxPerMm, r.y * pxPerMm, r.w * pxPerMm, r.h * pxPerMm);
  }, [layer, assets, boxW, boxH, pxPerMm, api.version]);

  if (!layer) return null;
  const set = (patch: Partial<Pick<StudioImageLayer, "src" | "crop">>, tag?: string) => api.setDoc(setSlotPhoto(api.doc, layer.id, patch), tag);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(false);
    if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
      setError(true);
      return;
    }
    setBusy(true);
    try {
      const a = await api.assets.addFile(f);
      set({
        src: {
          localId: a.localId,
          naturalW: a.naturalW,
          naturalH: a.naturalH,
          mime: a.mime,
        },
        crop: { zoom: 1, ox: 0, oy: 0 },
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || !layer.src) return;
    const dx: number = (e.clientX - d.x) / pxPerMm;
    const dy: number = (e.clientY - d.y) / pxPerMm;
    drag.current = { x: e.clientX, y: e.clientY };
    set({ crop: panCrop(layer, layer.src.naturalW, layer.src.naturalH, dx, dy) }, `crop:${layer.id}`);
  };
  const radius: string = layer.mask === "circle" ? "50%" : layer.mask === "rounded" ? "14px" : "6px";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-(--line) p-3" data-studio-slot-photo={layer.id}>
      <span className="text-[13px] font-bold">{label}</span>
      <div className="flex items-center gap-3">
        <canvas
          ref={canvas}
          aria-label={ts("photoDragHint")}
          className="flex-none touch-none select-none"
          style={{
            width: boxW,
            height: boxH,
            borderRadius: radius,
            cursor: layer.src ? "grab" : "default",
          }}
          onPointerDown={(e) => {
            if (!layer.src) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => input.current?.click()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-(--line2) px-3 text-sm font-bold"
          >
            <Icon d={STUDIO_ICONS.images} size={18} />
            {layer.src ? ts("photoChange") : ts("photoPick")}
          </button>
          {layer.src ? (
            <Slider
              label={ts("photoZoom")}
              value={layer.crop.zoom}
              min={1}
              max={3}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set({ crop: { ...layer.crop, zoom: v } }, `zoom:${layer.id}`)}
            />
          ) : null}
        </div>
      </div>
      {layer.src ? <span className="text-xs text-(--muted)">{ts("photoDragHint")}</span> : null}
      {error ? (
        <span role="alert" className="text-xs font-bold text-[#a82e22]">
          {api.t("uploadFailed")}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onFile(f);
        }}
      />
    </div>
  );
}
