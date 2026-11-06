"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CART_MAX_QTY } from "@/lib/storefront/cart";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { maxOrderQty } from "@/lib/storefront/stock";
import type { ShopPriceTier } from "@/lib/storefront/types";
import { FONT_OPTIONS } from "@/lib/editor/editorPalette";
import { contrastingInk } from "@/lib/studio/adapt";
import { STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { isNearWhite } from "@/lib/studio/contrast";
import type { StudioDoc, StudioTextLayer } from "@/lib/studio/document";
import { studioQuoteLine } from "@/lib/studio/productLine";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { loadTextFonts, measureText, onStudioFontsLoaded } from "@/lib/studio/fonts";
import { studioPenT } from "@/lib/studio/i18n.pen";
import {
  PEN_FORM_EMPTY,
  PEN_FORM_FONTS,
  isPenFormDoc,
  penFormDoc,
  penFormLayout,
  penFormSignature,
  readPenForm,
  type PenAlign,
  type PenFormState,
  type PenFormWarning,
} from "@/lib/studio/penForm";
import { PEN_SCENE_MM, drawPenScene, penZoneGeom, penZoneOnBarrel } from "@/lib/studio/penPreview";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioColorChoices } from "@/lib/studio/variantColors";
import { QtyStepper } from "../ProductBits";
import type { StudioEditorApi } from "./StudioApp";
import { DesignerHelpButton } from "./DesignerHelp";

const QUICK_QTY = [1, 10, 50, 100, 300] as const;
const FONT_KIND_KEY = { sans: "fontSans", serif: "fontSerif", bold: "fontBold", script: "fontScript", hand: "fontHand" } as const;
const CSS_VAR_BY_FAMILY = new Map<string, string>(FONT_OPTIONS.map((f) => [f.family, f.cssVar]));

/**
 * Pen as a form (Pens.com style): logo, line 1, line 2, font, alignment,
 * barrel colour, quantity with the run-size price table — the design laid out
 * automatically on a drawn pen, the print area magnified below it. Writes an
 * ordinary Studio document (`penForm.ts`), so «Editare avansată» and the
 * verify step work on it unchanged.
 */
export function StudioPenForm({
  api,
  qty,
  onQty,
  lastSignature,
  onSignature,
  onContinue,
  onAdvanced,
}: {
  api: StudioEditorApi;
  qty: number;
  onQty: (n: number) => void;
  /** Signature of the last document the form wrote (null = none this session). */
  lastSignature: string | null;
  onSignature: (sig: string) => void;
  onContinue: () => void;
  onAdvanced: () => void;
}) {
  const t = studioPenT(api.lang);
  const [form, setForm] = useState<PenFormState>(() => readPenForm(api.doc) ?? PEN_FORM_EMPTY);
  // The document was changed in the advanced editor: the form rebuilds it only once the customer changes something here.
  const [edited] = useState<boolean>(() => {
    const has: boolean = api.doc.surfaces.some((s) => s.layers.length > 0);
    return has && (!isPenFormDoc(api.doc) || (lastSignature != null && penFormSignature(api.doc) !== lastSignature));
  });
  const [owned, setOwned] = useState<boolean>(() => !edited && isPenFormDoc(api.doc));
  const [warnings, setWarnings] = useState<PenFormWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ink: string = contrastingInk(api.productColor ?? "#ffffff");

  // Latest values for the async font callbacks.
  const live = useRef({ api, form, ink, owned, onSignature });
  useEffect(() => {
    live.current = { api, form, ink, owned, onSignature };
  });

  const apply = (next: PenFormState, inkHex: string = live.current.ink) => {
    const a = live.current.api;
    const layout = penFormLayout(a.spec, next, inkHex, measureText);
    const doc: StudioDoc = penFormDoc(a.doc, layout);
    setWarnings(layout.warnings);
    a.setDoc(doc, "penform");
    live.current.onSignature(penFormSignature(doc));
  };

  const change = (patch: Partial<PenFormState>) => {
    const next: PenFormState = { ...form, ...patch };
    setForm(next);
    setOwned(true);
    apply(next);
  };

  // Fonts: lay out again once the face is here (widths change), and when a late face arrives.
  useEffect(() => {
    let cancelled = false;
    const probe = { kind: "text", text: `${form.line1}${form.line2}` || "Aa", fontFamily: form.font, bold: PEN_FORM_FONTS.find((f) => f.family === form.font)?.bold ?? true } as StudioTextLayer;
    void loadTextFonts([probe]).then(() => {
      if (!cancelled && live.current.owned) apply(live.current.form);
    });
    const off = onStudioFontsLoaded(() => live.current.owned && apply(live.current.form));
    return () => {
      cancelled = true;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per font only; `apply` reads `live`
  }, [form.font]);

  // Another barrel colour: the text takes the contrasting ink.
  useEffect(() => {
    if (live.current.owned) apply(live.current.form, ink);
  }, [ink]);

  // A logo with an opaque white background prints as a white box on a coloured barrel.
  // Derived while rendering (no state set from an effect on every document change:
  // see the version note in StudioApp).
  const logoBmp = form.logo?.localId ? api.assets.preview(form.logo.localId) : null;
  const logoBox: boolean = useMemo(() => !!logoBmp && !isNearWhite(api.productColor) && opaqueWhiteCorners(logoBmp as CanvasImageSource), [logoBmp, api.productColor]);

  const hasContent: boolean = !!(form.line1.trim() || form.line2.trim() || form.logo) || (!owned && api.doc.surfaces.some((s) => s.layers.length > 0));
  const choices = useMemo(() => studioColorChoices(api.product.variants), [api.product.variants]);
  const spec = api.spec;

  const label = "flex flex-col gap-1.5 text-sm font-bold";
  const input = "min-h-12 w-full rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-base font-semibold outline-none focus:border-(--ink)";
  const chip = (on: boolean) => `min-h-11 rounded-xl border-[1.5px] px-3 text-sm font-bold ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink) hover:border-(--ink)"}`;

  const warnText = (w: PenFormWarning): string => {
    const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString(api.lang === "en" ? "en" : api.lang === "ru" ? "ru" : "ro");
    switch (w.code) {
      case "textSmall":
        return t("textSmall", { pt: n(w.pt) });
      case "logoSmall":
        return t("logoSmall", { mm: n(w.mm), target: n(w.targetMm) });
      case "zoneShort":
        return t("zoneShort", { zone: n(w.zoneMm), usable: n(w.usableMm) });
      case "inline":
        return t("inline");
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-x-8 gap-y-4 px-4 pt-3 pb-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:px-6 md:pt-6" data-studio-pen-form>
      {/* Preview: sticky on top on phones, left column on desktop. */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-white px-4 pt-1 pb-2 md:top-4 md:mx-0 md:gap-4 md:self-start md:px-0 md:pt-0">
        <h1 className="m-0 hidden text-3xl leading-tight font-extrabold md:block">{t("title")}</h1>
        <StudioPenPreview doc={api.doc} spec={spec} assets={api.renderAssets} color={api.productColor ?? "#ffffff"} version={api.version} zoomLabel={t("zoom")} sizeLabel={t("zoneSize", { w: spec.widthMm, h: spec.heightMm })} alt={t("previewAlt")} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl leading-tight font-extrabold md:hidden">{t("title")}</h1>
          <p className="m-0 text-sm text-(--muted)">{t("lead")}</p>
        </div>
        {edited && !owned ? (
          <p role="status" className="m-0 rounded-xl bg-[#faf3dc] px-3 py-2 text-sm font-semibold text-[#7a6512]">
            {t("resetWarn")}
          </p>
        ) : null}

        {/* Logo */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{t("logo")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={chip(false)} disabled={busy} aria-busy={busy} onClick={() => fileInput.current?.click()} data-studio-pen-logo>
              {busy ? t("logoBusy") : form.logo ? t("logoChange") : `+ ${t("logoAdd")}`}
            </button>
            {form.logo ? (
              <button type="button" className={chip(false)} onClick={() => change({ logo: null })}>
                {t("logoRemove")}
              </button>
            ) : (
              <span className="text-xs text-(--muted2)">{t("logoHint")}</span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={STUDIO_PHOTO_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-studio-pen-logo-input
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try {
                const a = await api.assets.addFile(f);
                change({ logo: { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime } });
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>

        <label className={label}>
          {t("line1")}
          <input className={input} value={form.line1} maxLength={60} placeholder={t("line1Ph")} onChange={(e) => change({ line1: e.target.value })} data-studio-pen-line1 />
        </label>
        <label className={label}>
          {t("line2")}
          <input className={input} value={form.line2} maxLength={60} placeholder={t("line2Ph")} onChange={(e) => change({ line2: e.target.value })} data-studio-pen-line2 />
        </label>

        {/* Font */}
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("font")}>
          <span className="text-sm font-bold">{t("font")}</span>
          <div className="grid grid-cols-5 gap-1.5">
            {PEN_FORM_FONTS.map((f) => (
              <button
                key={f.family}
                type="button"
                role="radio"
                aria-checked={form.font === f.family}
                onClick={() => change({ font: f.family })}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-[1.5px] px-1 ${form.font === f.family ? "border-(--ink) bg-(--soft)" : "border-(--line2) bg-white hover:border-(--ink)"}`}
              >
                <span className="text-lg leading-tight" style={{ fontFamily: CSS_VAR_BY_FAMILY.get(f.family) ?? f.family, fontWeight: f.bold ? 700 : 400 }}>
                  Ab
                </span>
                <span className="text-center text-[10px] leading-tight font-bold text-(--muted) md:text-[11px]">{t(FONT_KIND_KEY[f.kind])}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("align")}>
          <span className="text-sm font-bold">{t("align")}</span>
          <div className="flex gap-1.5">
            {(["left", "center", "right"] as PenAlign[]).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={form.align === a} className={`${chip(form.align === a)} flex-1`} onClick={() => change({ align: a })}>
                {t(a === "left" ? "alignLeft" : a === "right" ? "alignRight" : "alignCenter")}
              </button>
            ))}
          </div>
        </div>

        {/* Barrel colour */}
        {choices.length > 1 ? (
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("color")}>
            <span className="text-sm font-bold">
              {t("color")}: <span className="font-semibold text-(--muted)">{api.variant?.label}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={api.variant?.id === c.key}
                  aria-label={c.label}
                  title={c.label}
                  disabled={c.disabled}
                  onClick={() => api.setVariant(c.key)}
                  className={`grid h-11 w-11 place-items-center rounded-full border-2 disabled:opacity-30 ${api.variant?.id === c.key ? "border-(--ink)" : "border-transparent"}`}
                >
                  <span className="h-8 w-8 rounded-full border border-black/15" style={{ background: c.hex }} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {warnings.length || logoBox ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-live="polite">
            {warnings.map((w) => (
              <li key={w.code} className={`rounded-xl px-3 py-2 text-sm font-semibold ${w.code === "inline" ? "bg-(--soft) text-(--muted)" : "bg-[#faf3dc] text-[#7a6512]"}`} data-pen-warning={w.code}>
                {warnText(w)}
              </li>
            ))}
            {logoBox ? (
              <li className="rounded-xl bg-[#faf3dc] px-3 py-2 text-sm font-semibold text-[#7a6512]" data-pen-warning="logoBox">
                {t("logoBox")}
              </li>
            ) : null}
          </ul>
        ) : null}

        <PenPricePanel api={api} qty={qty} onQty={onQty} />

        <button
          type="button"
          data-studio-pen-continue
          disabled={!hasContent}
          onClick={onContinue}
          className="shop-btn-dark min-h-13 rounded-xl bg-(--ink) px-5 text-base font-extrabold text-white disabled:opacity-40"
        >
          {hasContent ? t("continue") : t("needText")}
        </button>
        <button type="button" data-studio-pen-advanced onClick={onAdvanced} className="flex min-h-12 flex-col items-center justify-center rounded-xl border-[1.5px] border-(--line2) px-4 py-1.5 hover:border-(--ink)">
          <b className="text-sm">{t("advanced")}</b>
          <span className="text-xs text-(--muted)">{t("advancedSub")}</span>
        </button>
        <DesignerHelpButton target={{ kind: "pen", slug: api.product.slug, variant: api.variant?.label ?? null, productName: api.product.name, source: "studio" }} />
      </div>
    </div>
  );
}

/** True when the picture's four corners are opaque near-white (a logo on a white box). */
function opaqueWhiteCorners(img: CanvasImageSource): boolean {
  const c = document.createElement("canvas");
  c.width = c.height = 24;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 24, 24);
  const corners = [ctx.getImageData(0, 0, 1, 1).data, ctx.getImageData(23, 0, 1, 1).data, ctx.getImageData(0, 23, 1, 1).data, ctx.getImageData(23, 23, 1, 1).data];
  return corners.every((p) => p[3]! > 200 && p[0]! > 235 && p[1]! > 235 && p[2]! > 235);
}

/** Quantity (stepper + quick picks), the run-size table and the live price for that quantity. */
function PenPricePanel({ api, qty, onQty }: { api: StudioEditorApi; qty: number; onQty: (n: number) => void }) {
  const t = studioPenT(api.lang);
  const max: number = Math.max(1, maxOrderQty(api.variant?.stock, CART_MAX_QTY));
  const line = useMemo(() => (api.variant ? studioQuoteLine(api.kind, api.product, api.variant, qty) : null), [api.kind, api.product, api.variant, qty]);
  const quote = useLiveQuote(line, api.lang);
  const res = quote.status === "done" ? quote.line : quote.status === "loading" ? quote.previous : null;
  const total: number | null = res?.ok ? res.total : null;
  const tiers: ShopPriceTier[] = api.variant?.tiers?.length ? api.variant.tiers : api.variant?.price != null ? [{ minQty: 1, maxQty: null, price: api.variant.price }] : [];
  const range = (r: ShopPriceTier): string =>
    r.maxQty == null ? (r.minQty <= 1 ? t("tierOne") : t("tierFrom", { from: r.minQty })) : r.maxQty === r.minQty ? t("pcs", { n: r.minQty }) : t("tierRange", { from: r.minQty, to: r.maxQty });
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-(--line) p-3 md:p-4" data-studio-pen-price>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold">{t("qty")}</span>
        <QtyStepper value={Math.min(qty, max)} onChange={(v) => onQty(Math.min(max, v))} max={max} label={t("qty")} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_QTY.filter((n) => n <= max).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={qty === n}
            onClick={() => onQty(n)}
            className={`min-h-10 flex-1 rounded-lg border-[1.5px] px-2 text-sm font-bold tabular-nums ${qty === n ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {tiers.length > 1 ? (
        <table className="w-full border-collapse text-sm" aria-label={t("tiers")}>
          <caption className="pb-1 text-left text-xs font-bold text-(--muted2)">{t("tiers")}</caption>
          <tbody>
            {tiers.map((r) => {
              const on: boolean = qty >= r.minQty && (r.maxQty == null || qty <= r.maxQty);
              return (
                <tr key={r.minQty} className={`border-t border-(--line) ${on ? "bg-(--soft) font-extrabold" : ""}`} aria-current={on || undefined}>
                  <td className="py-1 pl-1 tabular-nums">{range(r)}</td>
                  <td className="py-1 pr-1 text-right tabular-nums">{formatPrice(r.price, api.lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <div className="flex items-end justify-between gap-2 border-t border-(--line) pt-2" aria-live="polite" aria-busy={quote.status === "loading"}>
        <span className="flex flex-col">
          <span className="text-xs font-bold text-(--muted2)">
            {t("total")} · {t("pcs", { n: qty })}
          </span>
          {total != null ? <span className="text-sm text-(--muted)">{t("perPiece", { price: formatPrice(Math.round((total / qty) * 100) / 100, api.lang) })}</span> : null}
        </span>
        <b className={`text-2xl tabular-nums ${quote.status === "loading" ? "opacity-60" : ""}`} data-studio-pen-total>
          {total != null ? formatPrice(total, api.lang) : "—"}
        </b>
      </div>
      <span className="text-xs text-(--muted2)">{t("priceNote")}</span>
    </section>
  );
}

type PenPreviewProps = {
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  assets: StudioRenderAssets;
  color: string;
  version: number;
  zoomLabel: string;
  sizeLabel: string;
  alt: string;
};

/**
 * The pen drawn in its colour with the design on the barrel and the print
 * area magnified below; a print area that does not fit on a barrel (a pen set
 * printed on its case, KIOTO 12×3 cm) is shown flat on the product colour.
 */
export function StudioPenPreview(props: PenPreviewProps) {
  return penZoneOnBarrel({ w: props.spec.widthMm, h: props.spec.heightMm }) ? <PenBarrelPreview {...props} /> : <PenFlatPreview {...props} />;
}

/** The print area flat on the product colour (case print), with its size. */
function PenFlatPreview({ doc, spec, assets, color, version, sizeLabel, alt }: PenPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const design = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const c = ref.current;
      if (!c) return;
      const dpr: number = Math.min(2, window.devicePixelRatio || 1);
      const w: number = Math.round(Math.min(900, Math.max(320, c.clientWidth)) * dpr);
      // The case around the print: 8 % margin on each side.
      const m: number = 0.08;
      const k: number = w / (spec.widthMm * (1 + 2 * m));
      c.width = w;
      c.height = Math.round(spec.heightMm * (1 + 2 * m * (spec.widthMm / spec.heightMm)) * k);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(0, 0, c.width, c.height, Math.round(6 * dpr));
      ctx.fill();
      const pad: number = spec.widthMm * m * k;
      const d = renderPreviewCanvas(doc, spec, assets, Math.round(spec.widthMm * k), design.current);
      design.current = d;
      ctx.drawImage(d, pad, pad, spec.widthMm * k, spec.heightMm * k);
      ctx.strokeStyle = isNearWhite(color) ? "rgba(20,33,61,0.45)" : "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeRect(pad, pad, spec.widthMm * k, spec.heightMm * k);
    });
    return () => cancelAnimationFrame(id);
  }, [doc, spec, assets, color, version]);
  return (
    <figure className="m-0 flex w-full flex-col gap-1" data-studio-pen-preview="flat">
      <canvas ref={ref} role="img" aria-label={alt} className="block w-full rounded-xl border border-(--line)" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm + spec.widthMm * 0.16}` }} />
      <figcaption className="text-right text-[11px] font-bold text-(--muted2) tabular-nums">{sizeLabel}</figcaption>
    </figure>
  );
}

/** The pen drawn in its colour with the design on the barrel, and the print area magnified below. */
function PenBarrelPreview({
  doc,
  spec,
  assets,
  color,
  version,
  zoomLabel,
  sizeLabel,
  alt,
}: PenPreviewProps) {
  const box = useRef<HTMLDivElement>(null);
  const penRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLCanvasElement | null>(null);
  const design = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zone = penZoneGeom({ w: spec.widthMm, h: spec.heightMm });
  // Magnified view: the print area at 84 % of the width, the barrel ± 2.5 mm.
  const viewW: number = zone.w / 0.84;
  const viewH: number = 15;
  const viewX: number = zone.x - (viewW - zone.w) / 2;
  const viewY: number = 2;

  useEffect(() => {
    if (width <= 0) return;
    const id = requestAnimationFrame(() => {
      const dpr: number = Math.min(2, window.devicePixelRatio || 1);
      const k: number = Math.max(4, (width * dpr) / viewW);
      const sc = (scene.current ??= document.createElement("canvas"));
      sc.width = Math.round(PEN_SCENE_MM.w * k);
      sc.height = Math.round(PEN_SCENE_MM.h * k);
      const sctx = sc.getContext("2d");
      if (!sctx) return;
      sctx.clearRect(0, 0, sc.width, sc.height);
      const d = renderPreviewCanvas(doc, spec, assets, Math.round(Math.max(spec.widthMm, spec.heightMm) * k), design.current);
      design.current = d;
      drawPenScene(sctx, k, color, d, { w: d.width, h: d.height }, { w: spec.widthMm, h: spec.heightMm });

      const pen = penRef.current;
      if (pen) {
        pen.width = Math.round(width * dpr);
        pen.height = Math.round((width * dpr * PEN_SCENE_MM.h) / PEN_SCENE_MM.w);
        const c = pen.getContext("2d");
        if (c) {
          c.imageSmoothingQuality = "high";
          c.clearRect(0, 0, pen.width, pen.height);
          c.drawImage(sc, 0, 0, pen.width, pen.height);
          // Where the close-up is.
          const kk: number = pen.width / PEN_SCENE_MM.w;
          c.strokeStyle = "rgba(20,33,61,0.55)";
          c.lineWidth = Math.max(1, dpr);
          c.setLineDash([3 * dpr, 3 * dpr]);
          c.strokeRect(viewX * kk, viewY * kk, viewW * kk, viewH * kk);
        }
      }
      const zc = zoomRef.current;
      if (zc) {
        zc.width = Math.round(width * dpr);
        zc.height = Math.round((width * dpr * viewH) / viewW);
        const c = zc.getContext("2d");
        if (c) {
          c.fillStyle = "#eef1f5";
          c.fillRect(0, 0, zc.width, zc.height);
          c.drawImage(sc, viewX * k, viewY * k, viewW * k, viewH * k, 0, 0, zc.width, zc.height);
          // Print area outline on the barrel.
          const kz: number = zc.width / viewW;
          c.strokeStyle = isNearWhite(color) ? "rgba(20,33,61,0.45)" : "rgba(255,255,255,0.6)";
          c.lineWidth = Math.max(1, dpr);
          c.setLineDash([4 * dpr, 4 * dpr]);
          c.strokeRect((zone.x - viewX) * kz, (zone.y0 - viewY) * kz, zone.w * kz, (zone.y1 - zone.y0) * kz);
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [width, doc, spec, assets, color, version, viewW, viewX, zone.x, zone.w, zone.y0, zone.y1]);

  return (
    <div ref={box} className="flex w-full flex-col gap-1.5 md:gap-3" data-studio-pen-preview>
      <canvas ref={penRef} role="img" aria-label={alt} className="block w-full" style={{ aspectRatio: `${PEN_SCENE_MM.w} / ${PEN_SCENE_MM.h}` }} />
      <figure className="m-0 flex flex-col gap-1">
        <canvas ref={zoomRef} aria-hidden="true" className="block w-full rounded-xl border border-(--line)" style={{ aspectRatio: `${viewW} / ${viewH}` }} />
        <figcaption className="flex justify-between text-[11px] font-bold text-(--muted2)">
          <span>{zoomLabel}</span>
          <span className="tabular-nums">{sizeLabel}</span>
        </figcaption>
      </figure>
    </div>
  );
}
