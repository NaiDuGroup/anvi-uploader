"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blobToFile } from "@/lib/mug/exportLayout";
import { CART_MAX_QTY, newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, refuseIfCartFull } from "@/lib/storefront/cartStore";
import { designCartLine, type ShopLineStudio } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { maxOrderQty, showsLowStock } from "@/lib/storefront/stock";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { uploadArtwork } from "@/lib/storefront/upload";
import { updateLayer, type StudioDoc, type StudioImageLayer } from "@/lib/studio/document";
import { exportStudioPng, renderPreviewCanvas, studioThumbnail } from "@/lib/studio/exportClient";
import { studioPenT } from "@/lib/studio/i18n.pen";
import { studioStartT } from "@/lib/studio/i18n.start";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { studioCartPercent, studioCartProgressText, type StudioCartProgress } from "@/lib/studio/cartProgress";
import { toLegacyLayout } from "@/lib/studio/legacy";
import { saveDoc } from "@/lib/studio/storage";
import { hasColorChoice, studioColorChoices } from "@/lib/studio/variantColors";
import { studioViewsT } from "@/lib/studio/i18n.views";
import { MAGIC_COLD_HEX, mugViewZones } from "@/lib/studio/mugViews";
import { studioQuoteLine } from "@/lib/studio/productLine";
import { studioQualityMessage } from "@/lib/studio/quality";
import { bestMugViewCenter, mugViewCenters } from "@/lib/studio/productMockup";
import { studioApprovalChecks, studioVariantChoiceKind, studioVerifyNotes } from "@/lib/studio/verifyChecklist";
import { OptionPicker, QtyStepper } from "../ProductBits";
import { useShopLang } from "../ShopLangProvider";
import type { StudioEditorApi } from "./StudioApp";
import { StudioLive3DLazy } from "./StudioLive3DLazy";
import { StudioPenPreview } from "./StudioPenForm";
import { useMugViewControls } from "./StudioMugViewBar";
import { StudioLivePicture, productThumbnail, useStableAssets, useStudioProductLook, type StudioProductLook } from "./StudioProductPicture";
import type { StudioQualityState } from "./StudioQuality";

/** The read-only checklist of «Verifică designul» (one approval covers it all). */
const LOOK_ITEMS = (mug: boolean) => ["lookText", mug ? "lookEdgesMug" : "lookEdges", "lookQuality", "lookProduct"] as const;

export class StudioPhotosMissing extends Error {}

/** Status of «Adaugă în coș»: one bar across the stages, the text says what happens now. */
function StudioCartProgressLine({ p, t }: { p: StudioCartProgress; t: ReturnType<typeof studioShopT> }) {
  const value: number = studioCartPercent(p);
  const text = studioCartProgressText(p);
  const label: string =
    text === "progressPhotos"
      ? t("progressPhotos", { n: Math.min((p.done ?? 0) + 1, p.total ?? 1), total: p.total ?? 1 })
      : text === "progressUpload"
        ? p.pct != null && p.pct > 0
          ? t("uploadingPct", { pct: p.pct })
          : t("progressUploadStart")
        : t(text);
  return (
    <div role="status" className="flex flex-col gap-1.5" data-studio-add-progress>
      <p className="m-0 flex items-center gap-2 text-sm text-(--muted)">
        <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-(--line2) border-t-(--ink)" aria-hidden="true" />
        {label}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-(--line2)" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="h-full rounded-full bg-(--ink) transition-[width] duration-300" style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}

/**
 * The print pipeline of a Studio design (same as the old shop editor): photo
 * originals uploaded (their keys kept in the document), the print PNG drawn
 * at the catalog dpi and uploaded, a cart thumbnail and a small approval
 * preview. Returns the document with the upload keys.
 */
export async function exportStudioForCart(
  api: Pick<StudioEditorApi, "doc" | "spec" | "assets" | "kind">,
  onProgress: (p: StudioCartProgress) => void,
  /** The product look: the cart thumbnail shows the design on the product. */
  look?: StudioProductLook,
): Promise<{ doc: StudioDoc; file: { fileKey: string; fileName: string; sizeBytes?: number }; thumb: string | null; preview: string | null }> {
  let doc: StudioDoc = api.doc;
  // 1. Photo originals → uploads (once; a reopened design keeps its keys).
  const images: StudioImageLayer[] = doc.surfaces.flatMap((s) => s.layers.filter((l): l is StudioImageLayer => l.kind === "image" && !l.hidden && !!l.src));
  const uploaded = new Map<string, string>();
  const toUpload: number = new Set(images.filter((l) => !l.src!.key && l.src!.localId).map((l) => l.src!.localId)).size;
  for (const l of images) {
    const id = l.src!.localId;
    if (l.src!.key || !id) continue;
    let key = uploaded.get(id);
    if (!key) {
      await api.assets.ensure(id);
      const blob = api.assets.original(id);
      if (!blob) throw new StudioPhotosMissing();
      const type = blob.type || "image/jpeg";
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const f = new File([blob], `${api.kind}-studio-photo-${Date.now()}.${ext}`, { type });
      const done: number = uploaded.size;
      onProgress({ stage: "photos", pct: null, done, total: toUpload });
      key = (await uploadArtwork(f, (pct) => onProgress({ stage: "photos", pct, done, total: toUpload }))).fileKey;
      uploaded.set(id, key);
    }
    doc = updateLayer(doc, l.id, { src: { ...l.src!, key } });
  }
  // 2. The print file (fonts awaited inside), from the full-size originals.
  onProgress({ stage: "render", pct: null });
  const ex = await api.assets.exportAssets(doc);
  if (ex.missing.length) {
    ex.release();
    throw new StudioPhotosMissing();
  }
  let png: Blob;
  let canvas: HTMLCanvasElement;
  try {
    ({ blob: png, canvas } = await exportStudioPng(doc, api.spec, ex.assets));
  } finally {
    ex.release();
  }
  const thumb: string | null = (look ? productThumbnail(canvas, api.spec, look, doc) : null) ?? studioThumbnail(canvas, 320);
  const preview: string | null = studioThumbnail(canvas, 240);
  canvas.width = 0;
  canvas.height = 0;
  // No «0 %» while the upload link is fetched: the percentage shows once bytes move.
  onProgress({ stage: "upload", pct: null });
  const ref = await uploadArtwork(blobToFile(png, `${api.kind}-layout-${Date.now()}.png`), (pct) => onProgress({ stage: "upload", pct }));
  onProgress({ stage: "save", pct: null });
  return { doc, file: ref, thumb, preview: preview && preview.length <= 60_000 ? preview : null };
}

/**
 * A mug without a 3D model (catalog «has3dPreview» off): the drawn mug of
 * «Personalizează» with the left / front / right turns, instead of a flat
 * rectangle under the «3D» tab. A cold magic mug shows the bare coating (the colour of the 3D view).
 */
function DrawnMugView({ api, magic, bar }: { api: StudioEditorApi; magic: "cold" | "hot" | null; bar: ReactNode }) {
  const ts = studioStartT(api.lang);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const radiusMm: number = look.mug ? ((look.mug.shape.topDiameterCm + look.mug.shape.bottomDiameterCm) / 4) * 10 : 0;
  const centers = look.mug ? mugViewCenters(api.spec.widthMm, radiusMm) : null;
  const [auto] = useState<number | undefined>(() => (look.mug ? bestMugViewCenter(api.doc.surfaces[0]?.layers ?? [], api.spec.widthMm, radiusMm) : undefined));
  const [view, setView] = useState<0 | 1 | 2 | null>(null);
  const cold: boolean = magic === "cold" && !!look.mug;
  const shownLook = useMemo(
    () => (cold && look.mug ? { ...look, mug: { ...look.mug, bodyHex: MAGIC_COLD_HEX, handleHex: MAGIC_COLD_HEX }, key: `${look.key}:cold` } : look),
    [cold, look],
  );
  const bare: StudioDoc = useMemo(() => ({ ...api.doc, surfaces: api.doc.surfaces.map((s) => ({ ...s, background: null, layers: [] })) }), [api.doc]);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[#f3f1ee] p-3" data-studio-verify-drawn>
      {bar ? <div className="self-start">{bar}</div> : null}
      <div className="mx-auto w-full max-w-[520px]">
        <StudioLivePicture
          doc={cold ? bare : api.doc}
          spec={api.spec}
          assets={assets}
          look={shownLook}
          version={api.version}
          label={ts("previewAlt")}
          centerMm={centers ? (view == null ? auto : centers[view]) : undefined}
        />
      </div>
      {centers ? (
        <div role="group" aria-label={ts("viewLabel")} className="flex gap-1 self-center rounded-[11px] bg-white/80 p-1">
          {(["viewLeft", "viewFront", "viewRight"] as const).map((k, i) => (
            <button
              key={k}
              type="button"
              data-studio-view={i}
              aria-pressed={view === i}
              onClick={() => setView(i as 0 | 1 | 2)}
              className={`min-h-10 rounded-lg px-4 text-sm font-bold ${view === i ? "bg-(--ink) text-white" : "text-(--muted)"}`}
            >
              {ts(k)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Flat print layout of the design over the product colour (mug: the strips beside the handle marked). */
function FlatPreview({ api, magic }: { api: StudioEditorApi; magic: "cold" | "hot" | null }) {
  const t = studioShopT(api.lang);
  const vt = studioViewsT(api.lang);
  const [url, setUrl] = useState<string | null>(null);
  const { doc, spec, renderAssets, version } = api;
  useEffect(() => {
    const c = renderPreviewCanvas(doc, spec, renderAssets, 1400);
    setUrl(c.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on version (doc, photos, fonts)
  }, [version, spec]);
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-xl border border-(--line)" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}`, background: api.productColor ?? "#ffffff", maxHeight: "60vh" }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : null}
        {magic === "cold" ? (
          <span className="absolute inset-0 flex items-end justify-center p-3 text-center text-xs font-semibold text-white/75" style={{ background: MAGIC_COLD_HEX }}>
            {vt("magicColdHint")}
          </span>
        ) : null}
        {spec.zones.map((z, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 flex items-center justify-center border-x border-dashed border-[rgba(20,33,61,0.35)]"
            style={{
              left: `${(z.x / spec.widthMm) * 100}%`,
              width: `${(z.w / spec.widthMm) * 100}%`,
              background: "repeating-linear-gradient(135deg, rgba(255,255,255,.28) 0 6px, rgba(20,33,61,.18) 6px 12px)",
            }}
          >
            <span className="rotate-90 rounded bg-white/90 px-1 text-[10px] font-extrabold whitespace-nowrap text-(--ink)">{t("handleBeside")}</span>
          </span>
        ))}
      </div>
      {api.kind === "mug" ? (
        <div className="relative h-4 w-full text-[11px] text-(--muted2)" aria-hidden="true">
          {mugViewZones(spec).map((z, i) => (
            <span key={z.view} className="absolute top-0 text-center" style={{ left: `${(z.x / spec.widthMm) * 100}%`, width: `${(z.w / spec.widthMm) * 100}%` }}>
              {vt((["zoneLeft", "zoneCentre", "zoneRight"] as const)[i]!)}
            </span>
          ))}
        </div>
      ) : null}
      <figcaption className="text-xs text-(--muted)">
        {t("flatCaption", {
          w: String(Math.round(spec.widthMm) / 10).replace(".", api.lang === "en" ? "." : ","),
          h: String(Math.round(spec.heightMm) / 10).replace(".", api.lang === "en" ? "." : ","),
        })}
      </figcaption>
    </figure>
  );
}

/**
 * «Verifică designul» (Verify / VerifyPhone mockups): a large preview, the
 * product, colour and quantity with the price, the checklist and the
 * required «Am verificat designul». Only then «Adaugă în coș».
 */
export function StudioVerifyScreen({
  api,
  quality,
  editLine,
  initialQty,
  note,
  onBack,
  onAdded,
}: {
  api: StudioEditorApi;
  quality: StudioQualityState;
  editLine: CartLine | null;
  initialQty: number;
  note?: string | null;
  onBack: () => void;
  onAdded: (doc: StudioDoc) => void;
}) {
  const { t: shopT, lang } = useShopLang();
  const t = studioShopT(lang);
  const { kind, product, variant } = api;
  const colorChoices = useMemo(() => studioColorChoices(product.variants), [product.variants]);
  const has3d = kind !== "pen";
  // A mug without a 3D model gets the drawn mug under the first tab.
  const drawnMug: boolean = kind === "mug" && api.item?.has3dPreview === false;
  const productLook = useStudioProductLook(api);
  const [view, setView] = useState<"3d" | "flat">(has3d ? "3d" : "flat");
  const vt = studioViewsT(lang);
  const pt = studioPenT(lang);
  const views = useMugViewControls(api);
  const choiceKind = useMemo(() => studioVariantChoiceKind(product.variants), [product.variants]);
  const notes = useMemo(() => studioVerifyNotes(api.doc), [api.doc]);
  const [approved, setApproved] = useState(false);
  // The step opens at its top (title and preview), not where the form above was scrolled to.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.scrollIntoView({ block: "start" });
  }, []);
  const maxQty: number = maxOrderQty(variant?.stock, CART_MAX_QTY);
  const [qty, setQty] = useState<number>(Math.max(1, Math.min(initialQty, Math.max(1, maxQty))));
  const quoteLine: ShopQuoteLine | null = useMemo(() => (variant ? studioQuoteLine(kind, product, variant, qty) : null), [kind, product, variant, qty]);
  const quote = useLiveQuote(quoteLine, lang);
  const total: number | null =
    quote.status === "done" && quote.line.ok ? quote.line.total : quote.status === "loading" && quote.previous?.ok ? quote.previous.total : null;
  const soldOut = maxQty === 0;
  const labels = useMemo(() => buildLineLabels([product]), [product]);
  const [saving, setSaving] = useState<null | StudioCartProgress>(null);
  const [error, setError] = useState<string | null>(null);
  const unitPrice: number | null =
    quote.status === "done" && quote.line.ok ? quote.line.unitPrice : quote.status === "loading" && quote.previous?.ok ? quote.previous.unitPrice : null;

  const canAdd = approved && !quality.blocks && !soldOut && saving == null && !!variant && !(quote.status === "done" && !quote.line.ok);

  const add = async () => {
    if (!canAdd || !variant || !quoteLine) return;
    // A full cart refuses a new line: say so before exporting and uploading.
    if (!editLine && refuseIfCartFull()) return;
    setError(null);
    setSaving({ stage: "render", pct: null });
    try {
      const out = await exportStudioForCart(api, setSaving, productLook);
      const studio: ShopLineStudio = {
        v: 1,
        docId: out.doc.id,
        approvedAt: new Date().toISOString(),
        // One approval covers the whole read-only checklist (old lines keep their ticked subset).
        checks: studioApprovalChecks(),
        ...(out.preview ? { preview: out.preview } : {}),
        ...(out.doc.templateId && !out.doc.templateId.startsWith("legacy:") ? { templateId: out.doc.templateId } : {}),
      };
      // In the cart now: not offered as «Continui designul început?» on the next visit (the order may be placed by then).
      await saveDoc({ id: out.doc.id, kind, doc: out.doc, preview: out.thumb, slug: product.slug, variantId: variant.id, cartedAt: Date.parse(studio.approvedAt) });
      const lineText = describeQuoteLine(quoteLine, labels, shopT);
      const line: CartLine = designCartLine({
        kind,
        slug: product.slug,
        variantId: variant.id,
        quantity: qty,
        file: out.file,
        layout: toLegacyLayout(out.doc),
        preview: out.thumb,
        title: lineText?.title ?? product.name,
        optionsText: lineText?.optionsText ?? variant.label,
        image: variant.images[0] ?? product.image,
        lastTotal: total,
        id: editLine?.id ?? newLineId(),
        // eslint-disable-next-line react-hooks/purity -- runs in a click handler
        addedAt: editLine?.addedAt ?? Date.now(),
        studio,
        // UV mugs / pens: the UV stock line with the zone the checkout accepts.
        quote: quoteLine,
      });
      if (!dispatchCart(editLine ? { type: "update", line } : { type: "add", line })) {
        setSaving(null);
        return;
      }
      api.replaceDoc(out.doc);
      setSaving(null);
      onAdded(out.doc);
    } catch (e) {
      console.error("[studio] add to cart failed:", e);
      setError(e instanceof StudioPhotosMissing ? t("photosMissing") : t("saveFailed"));
      setSaving(null);
    }
  };

  const tab = (on: boolean) => `min-h-11 flex-1 rounded-[9px] px-3 text-sm font-bold ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  return (
    <div ref={root} className="mx-auto grid w-full max-w-[1180px] items-start gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("verifyTitle")}</h1>
          <p className="m-0 text-sm text-(--muted)">{t("verifyLead")}</p>
        </div>
        {note ? (
          <p role="status" className="m-0 rounded-xl bg-[#faf3dc] px-3 py-2 text-sm font-semibold text-[#7a6512]">
            {note}
          </p>
        ) : null}
        {has3d ? (
          <div className="flex gap-1 rounded-[11px] bg-(--soft) p-1" role="group">
            <button type="button" aria-pressed={view === "3d"} className={tab(view === "3d")} onClick={() => setView("3d")}>
              {drawnMug ? t("viewOnMug") : t("view3d")}
            </button>
            <button type="button" aria-pressed={view === "flat"} className={tab(view === "flat")} onClick={() => setView("flat")}>
              {t("viewFlat")}
            </button>
          </div>
        ) : null}
        {view === "3d" && drawnMug ? (
          <DrawnMugView api={api} magic={views.magic} bar={views.bar} />
        ) : view === "3d" && has3d ? (
          <div className="relative h-[340px] w-full overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_40%,#ffffff_0%,#eef1f5_100%)] md:h-[460px]" data-studio-verify-3d>
            <StudioLive3DLazy
              kind={kind}
              item={api.item}
              spec={api.spec}
              doc={api.doc}
              renderAssets={api.renderAssets}
              version={api.version}
              interactive
              viewRequest={views.viewRequest}
              magic={views.magic}
              className="h-full w-full"
            />
            {views.bar ? <div className="absolute top-2 left-2 z-10">{views.bar}</div> : null}
            {kind === "mug" && api.item?.has3dPreview !== false ? (
              <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] font-semibold text-(--muted2)">{vt("viewsHint")}</span>
            ) : null}
          </div>
        ) : kind === "pen" ? (
          // The drawn pen with the design on the barrel (a case print: flat on the case colour).
          <div className="flex flex-col gap-2 rounded-xl border border-(--line) p-3 md:p-4" data-studio-verify-pen>
            <StudioPenPreview
              doc={api.doc}
              spec={api.spec}
              assets={api.renderAssets}
              color={api.productColor ?? "#ffffff"}
              version={api.version}
              zoomLabel={pt("zoom")}
              sizeLabel={pt("zoneSize", { w: api.spec.widthMm, h: api.spec.heightMm })}
              alt={pt("previewAlt")}
            />
          </div>
        ) : (
          <>
            {views.magic ? <div>{views.bar}</div> : null}
            <FlatPreview api={api} magic={views.magic} />
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <b className="text-lg">{product.name}</b>
          {variant ? <span className="text-sm text-(--muted)">{variant.label}</span> : null}
        </div>
        {hasColorChoice(colorChoices) ? (
          <OptionPicker
            title={choiceKind === "volume" ? vt("volume") : choiceKind === "variant" ? vt("variant") : t("color")}
            options={colorChoices.map((c) => ({ ...c, disabledLabel: shopT("optionOutOfStock", { name: c.label }) }))}
            value={variant?.id ?? ""}
            onChange={(k) => {
              api.setVariant(k);
              const max = maxOrderQty(product.variants.find((v) => v.id === k)?.stock, CART_MAX_QTY);
              if (max > 0 && qty > max) setQty(max);
            }}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <b className="text-[15px]">{t("quantity")}</b>
          <QtyStepper value={qty} onChange={setQty} max={Math.max(1, maxQty)} label={t("quantity")} />
          {soldOut ? (
            <span className="text-sm font-semibold text-(--err)">{t("outOfStock")}</span>
          ) : showsLowStock(variant?.stock) ? (
            <span className="text-sm font-semibold text-(--warn)">{t("stockLeft", { n: variant?.stock ?? 0 })}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 border-t border-(--line) pt-3">
          <div className="flex items-baseline justify-between text-sm" data-studio-unit-price>
            <span className="text-(--muted)">{vt("perPiece")}</span>
            <span className="font-bold">{unitPrice != null ? formatPrice(unitPrice, lang) : quote.status === "done" && !quote.line.ok ? "—" : "…"}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="flex flex-col">
              <b>{t("total")}</b>
              {unitPrice != null && qty > 1 ? <span className="text-xs text-(--muted2)">{vt("qtyTimes", { n: qty, price: formatPrice(unitPrice, lang) })}</span> : null}
            </span>
            <b className="text-2xl" aria-live="polite" data-studio-total>
              {total != null ? formatPrice(total, lang) : quote.status === "done" && !quote.line.ok ? "—" : "…"}
            </b>
          </div>
        </div>
        {quote.status === "done" && !quote.line.ok ? (
          <span role="alert" className="text-sm text-(--err)">
            {t("priceUnavailable")}
          </span>
        ) : null}

        <section className="m-0 flex flex-col gap-2 rounded-2xl border-[1.5px] border-(--line) p-3" aria-labelledby="studio-look-title" data-studio-checklist>
          <h2 id="studio-look-title" className="m-0 text-sm font-extrabold">
            {vt("checklistTitle")}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {LOOK_ITEMS(kind === "mug").map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-(--soft) text-[11px] font-extrabold text-(--muted)">
                  ●
                </span>
                <span>{vt(k)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5 border-t border-(--line) pt-2 text-sm" data-studio-findings>
            <b className="text-xs font-extrabold tracking-wide text-(--muted2) uppercase">{vt("autoCheck")}</b>
            {quality.items.length === 0 ? (
              <span className="flex items-center gap-2 font-semibold text-[#1f8a4c]">
                <span aria-hidden="true">✓</span>
                {vt("autoOk")}
              </span>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {quality.items.map((it) => {
                  const m = studioQualityMessage(it, lang);
                  return (
                    <li key={it.id} className="flex items-start gap-2" data-level={it.level}>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                        style={{ background: it.level === "red" ? "#c0392b" : "#c98a0b" }}
                      >
                        {it.level === "red" ? "×" : "!"}
                      </span>
                      <span className="flex flex-col">
                        <b>{m.title}</b>
                        <span className="text-xs text-(--muted)">{m.fix}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {notes.samples.length ? (
              <div className="flex flex-col gap-0.5" data-studio-samples>
                <span className="text-xs font-bold text-(--muted)">{vt("samplesTitle")}</span>
                {notes.samples.map((n) => (
                  <span key={n.layerId} className="text-xs">
                    «{n.text}»
                  </span>
                ))}
              </div>
            ) : null}
            {notes.notPrinted.length ? (
              <div className="flex flex-col gap-0.5" data-studio-not-printed>
                <span className="text-xs font-bold text-(--muted)">{vt("notPrintedTitle")}</span>
                {notes.notPrinted.map((n) => (
                  <span key={n.layerId} className="text-xs">
                    {vt(n.what === "photoSpot" ? "notPrintedPhoto" : n.what === "qrEmpty" ? "notPrintedQr" : "notPrintedHidden")}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <label className={`mt-1 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl p-3 text-sm font-bold ${approved ? "bg-[#e8f5ec]" : "bg-[#faf3dc]"}`}>
            <input type="checkbox" data-studio-approve className="mt-0.5 h-6 w-6 flex-none accent-(--ink)" checked={approved} onChange={(e) => setApproved(e.target.checked)} aria-describedby="studio-approve-req" />
            <span className="flex flex-col gap-0.5">
              <span>{t("approve")}</span>
              {/* The red «Obligatoriu» only while it is still to be ticked. */}
              <span id="studio-approve-req" className={`text-xs font-extrabold text-[#a82e22] ${approved ? "sr-only" : ""}`}>
                {t("required")}
              </span>
            </span>
          </label>
        </section>

        {quality.blocks ? (
          <p role="alert" className="m-0 rounded-xl bg-[#fdecea] px-3 py-2 text-sm font-bold text-[#a82e22]">
            {t("qualityBlocked")}
          </p>
        ) : !approved ? (
          <p className="m-0 text-xs text-(--muted2)">{t("approveNeeded")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm font-semibold text-(--err)">
            {error}
          </p>
        ) : null}
        {saving ? (
          <StudioCartProgressLine p={saving} t={t} />
        ) : null}
        <button type="button" data-studio-add disabled={!canAdd} onClick={() => void add()} className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) py-3 text-[17px] font-extrabold text-white disabled:opacity-40">
          {editLine ? t("updateCart") : t("addToCart")}
        </button>
        <button type="button" disabled={saving != null} onClick={onBack} className="min-h-12 rounded-xl border-[1.5px] border-(--line2) font-semibold">
          {t("backToEdit")}
        </button>
      </div>
    </div>
  );
}
