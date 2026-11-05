"use client";

import { useEffect, useMemo, useState } from "react";
import { blobToFile } from "@/lib/mug/exportLayout";
import { CART_MAX_QTY, newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, refuseIfCartFull } from "@/lib/storefront/cartStore";
import { STUDIO_APPROVAL_CHECKS, designCartLine, type ShopLineStudio } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { maxOrderQty, showsLowStock } from "@/lib/storefront/stock";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { uploadArtwork } from "@/lib/storefront/upload";
import { updateLayer, type StudioDoc, type StudioImageLayer } from "@/lib/studio/document";
import { exportStudioPng, renderPreviewCanvas, studioThumbnail } from "@/lib/studio/exportClient";
import { studioShopT, type StudioShopKey } from "@/lib/studio/i18n.shop";
import { toLegacyLayout } from "@/lib/studio/legacy";
import { saveDoc } from "@/lib/studio/storage";
import { hasColorChoice, studioColorChoices } from "@/lib/studio/variantColors";
import { OptionPicker, QtyStepper } from "../ProductBits";
import { useShopLang } from "../ShopLangProvider";
import type { StudioEditorApi } from "./StudioApp";
import { StudioLive3DLazy } from "./StudioLive3DLazy";
import type { StudioQualityState } from "./StudioQuality";

type Check = (typeof STUDIO_APPROVAL_CHECKS)[number];

const CHECK_LABEL = (mug: boolean): Record<Check, StudioShopKey> => ({
  text: "checkText",
  edges: mug ? "checkEdgesMug" : "checkEdges",
  quality: "checkQuality",
  product: "checkProduct",
});

export class StudioPhotosMissing extends Error {}

/**
 * The print pipeline of a Studio design (same as the old shop editor): photo
 * originals uploaded (their keys kept in the document), the print PNG drawn
 * at the catalog dpi and uploaded, a cart thumbnail and a small approval
 * preview. Returns the document with the upload keys.
 */
export async function exportStudioForCart(
  api: Pick<StudioEditorApi, "doc" | "spec" | "assets" | "kind">,
  onPct: (pct: number | null) => void,
): Promise<{ doc: StudioDoc; file: { fileKey: string; fileName: string; sizeBytes?: number }; thumb: string | null; preview: string | null }> {
  let doc: StudioDoc = api.doc;
  // 1. Photo originals → uploads (once; a reopened design keeps its keys).
  const images: StudioImageLayer[] = doc.surfaces.flatMap((s) => s.layers.filter((l): l is StudioImageLayer => l.kind === "image" && !l.hidden && !!l.src));
  const uploaded = new Map<string, string>();
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
      key = (await uploadArtwork(f, () => {})).fileKey;
      uploaded.set(id, key);
    }
    doc = updateLayer(doc, l.id, { src: { ...l.src!, key } });
  }
  // 2. The print file (fonts awaited inside), from the full-size originals.
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
  const thumb: string | null = studioThumbnail(canvas, 320);
  const preview: string | null = studioThumbnail(canvas, 240);
  canvas.width = 0;
  canvas.height = 0;
  onPct(0);
  const ref = await uploadArtwork(blobToFile(png, `${api.kind}-layout-${Date.now()}.png`), (p) => onPct(p));
  return { doc, file: ref, thumb, preview: preview && preview.length <= 60_000 ? preview : null };
}

/** Flat print layout of the design over the product colour (mug: the strips beside the handle marked). */
function FlatPreview({ api }: { api: StudioEditorApi }) {
  const t = studioShopT(api.lang);
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
  const [view, setView] = useState<"3d" | "flat">(has3d ? "3d" : "flat");
  const [checks, setChecks] = useState<Set<Check>>(new Set());
  const [approved, setApproved] = useState(false);
  const maxQty: number = maxOrderQty(variant?.stock, CART_MAX_QTY);
  const [qty, setQty] = useState<number>(Math.max(1, Math.min(initialQty, Math.max(1, maxQty))));
  const quoteLine: ShopQuoteLine | null = variant ? { kind, productId: variant.id, quantity: qty } : null;
  const quote = useLiveQuote(quoteLine, lang);
  const total: number | null =
    quote.status === "done" && quote.line.ok ? quote.line.total : quote.status === "loading" && quote.previous?.ok ? quote.previous.total : null;
  const soldOut = maxQty === 0;
  const labels = useMemo(() => buildLineLabels([product]), [product]);
  const [saving, setSaving] = useState<null | { pct: number | null }>(null);
  const [error, setError] = useState<string | null>(null);
  const labelsOf = CHECK_LABEL(kind === "mug");

  const canAdd = approved && !quality.blocks && !soldOut && saving == null && !!variant && !(quote.status === "done" && !quote.line.ok);

  const add = async () => {
    if (!canAdd || !variant || !quoteLine) return;
    // A full cart refuses a new line: say so before exporting and uploading.
    if (!editLine && refuseIfCartFull()) return;
    setError(null);
    setSaving({ pct: null });
    try {
      const out = await exportStudioForCart(api, (pct) => setSaving({ pct }));
      const studio: ShopLineStudio = {
        v: 1,
        docId: out.doc.id,
        approvedAt: new Date().toISOString(),
        checks: [...checks],
        ...(out.preview ? { preview: out.preview } : {}),
        ...(out.doc.templateId && !out.doc.templateId.startsWith("legacy:") ? { templateId: out.doc.templateId } : {}),
      };
      await saveDoc({ id: out.doc.id, kind, doc: out.doc, preview: out.thumb, slug: product.slug, variantId: variant.id });
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
    <div className="mx-auto grid w-full max-w-[1180px] items-start gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
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
              {t("view3d")}
            </button>
            <button type="button" aria-pressed={view === "flat"} className={tab(view === "flat")} onClick={() => setView("flat")}>
              {t("viewFlat")}
            </button>
          </div>
        ) : null}
        {view === "3d" && has3d ? (
          <div className="h-[340px] w-full overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_40%,#ffffff_0%,#eef1f5_100%)] md:h-[460px]">
            <StudioLive3DLazy kind={kind} item={api.item} spec={api.spec} doc={api.doc} renderAssets={api.renderAssets} version={api.version} autoRotate interactive className="h-full w-full" />
          </div>
        ) : (
          <FlatPreview api={api} />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <b className="text-lg">{product.name}</b>
          {variant ? <span className="text-sm text-(--muted)">{variant.label}</span> : null}
        </div>
        {hasColorChoice(colorChoices) ? (
          <OptionPicker
            title={t("color")}
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
        <div className="flex items-baseline justify-between border-t border-(--line) pt-3">
          <b>{t("total")}</b>
          <b className="text-2xl" aria-live="polite">
            {total != null ? formatPrice(total, lang) : quote.status === "done" && !quote.line.ok ? "—" : "…"}
          </b>
        </div>
        {quote.status === "done" && !quote.line.ok ? (
          <span role="alert" className="text-sm text-(--err)">
            {t("priceUnavailable")}
          </span>
        ) : null}

        <fieldset className="m-0 flex flex-col gap-2 rounded-2xl border-[1.5px] border-(--line) p-3">
          <legend className="px-1 text-sm font-extrabold">{t("checkTitle")}</legend>
          {STUDIO_APPROVAL_CHECKS.map((c) => (
            <label key={c} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-6 w-6 flex-none accent-(--ink)"
                checked={checks.has(c)}
                onChange={(e) =>
                  setChecks((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(c);
                    else n.delete(c);
                    return n;
                  })
                }
              />
              <span>{t(labelsOf[c])}</span>
            </label>
          ))}
          <label className="mt-1 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-[#faf3dc] p-3 text-sm font-bold">
            <input type="checkbox" data-studio-approve className="mt-0.5 h-6 w-6 flex-none accent-(--ink)" checked={approved} onChange={(e) => setApproved(e.target.checked)} aria-describedby="studio-approve-req" />
            <span className="flex flex-col gap-0.5">
              <span>{t("approve")}</span>
              <span id="studio-approve-req" className="text-xs font-extrabold text-[#a82e22]">
                {t("required")}
              </span>
            </span>
          </label>
        </fieldset>

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
          <p role="status" className="m-0 text-sm text-(--muted)">
            {saving.pct == null ? t("preparing") : t("uploadingPct", { pct: saving.pct })}
          </p>
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
