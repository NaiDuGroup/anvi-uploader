"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MugCanvasPreview } from "@/app/mug/_components/MugCanvasPreview";
import { FONT_OPTIONS } from "@/app/mug/_components/MugEditor";
import { colorsFromProduct, type MugProductOption } from "@/app/mug/_components/MugProductPicker";
import { TemplateSelector } from "@/app/mug/_components/TemplateSelector";
import { MugEditor } from "@/app/mug/_components/MugEditor";
import { NotebookCanvasPreview } from "@/app/notebook/_components/NotebookCanvasPreview";
import { NotebookEditor } from "@/app/notebook/_components/NotebookEditor";
import { colorsFromNotebookProduct, type NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import { NotebookTemplateSelector } from "@/app/notebook/_components/NotebookTemplateSelector";
import { PenCanvasPreview } from "@/app/pen/_components/PenCanvasPreview";
import { PenEditor } from "@/app/pen/_components/PenEditor";
import type { PenProductOption } from "@/app/pen/_components/PenProductPicker";
import { PenTemplateSelector } from "@/app/pen/_components/PenTemplateSelector";
import { blobToFile, exportCanvasAsBlob } from "@/lib/mug/exportLayout";
import { buildMugTemplates, type MugTemplate, type PhotoSettings } from "@/lib/mug/templates";
import { buildNotebookTemplates, type NotebookTemplate } from "@/lib/notebook/templates";
import { buildPenTemplates, type PenTemplate } from "@/lib/pen/templates";
import { MUG_DEFAULT_PRINT, NOTEBOOK_DEFAULT_PRINT, PEN_DEFAULT_PRINT, cmToPx, type PrintSizeCm } from "@/lib/printDimensions";
import { CART_MAX_QTY, newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { designCartLine, type ShopDesignLayout, type ShopEditorKind } from "@/lib/storefront/design";
import { loadDesignPhotos, saveDesignPhotos } from "@/lib/storefront/designPhotos";
import { formatPrice } from "@/lib/storefront/format";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { inStock, maxOrderQty, showsLowStock } from "@/lib/storefront/stock";
import type { ShopProduct, ShopQuoteLine, ShopVariant } from "@/lib/storefront/types";
import { uploadArtwork } from "@/lib/storefront/upload";
import { getDictionary } from "@/lib/i18n";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { OptionPicker, QtyStepper } from "../ProductBits";
import { useShopLang } from "../ShopLangProvider";

const Mug3DPreview = dynamic(() => import("@/app/mug/_components/Mug3DPreview").then((m) => m.Mug3DPreview), {
  ssr: false,
});
const Notebook3DPreview = dynamic(
  () => import("@/app/notebook/_components/Notebook3DPreview").then((m) => m.Notebook3DPreview),
  { ssr: false },
);

type EditorItem = MugProductOption | NotebookProductOption | PenProductOption;
type AnyTemplate = MugTemplate | NotebookTemplate | PenTemplate;
type CanvasHandle = { getCanvas(): HTMLCanvasElement | null; prepareForExport(): Promise<void> };

const DEFAULT_PRINT: Record<ShopEditorKind, PrintSizeCm> = {
  mug: MUG_DEFAULT_PRINT,
  notebook: NOTEBOOK_DEFAULT_PRINT,
  pen: PEN_DEFAULT_PRINT,
};

function buildTemplates(kind: ShopEditorKind, w: number, h: number): AnyTemplate[] {
  return kind === "mug" ? buildMugTemplates(w, h) : kind === "notebook" ? buildNotebookTemplates(w, h) : buildPenTemplates(w, h);
}

/**
 * The studio editor widgets (`src/app/mug|notebook|pen/_components`) speak
 * through `useLanguageStore`; in the shop they follow the shop language,
 * in memory only (print.anvi.md's own saved choice is left alone).
 */
function useEditorLanguage(lang: "ro" | "ru" | "en") {
  // Before paint (not during render: other subscribers, e.g. HtmlLangUpdater, must not update mid-render).
  useLayoutEffect(() => {
    const apply = () => {
      if (useLanguageStore.getState().locale !== lang) {
        useLanguageStore.setState({ locale: lang, t: getDictionary(lang), hydrated: true });
      }
    };
    apply();
    return useLanguageStore.subscribe(apply);
  }, [lang]);
}

/** Small JPEG of a canvas for the cart (≤ ~60 KB), white behind transparent areas. */
function thumbnailOf(source: HTMLCanvasElement, maxSide = 320): string | null {
  try {
    const scale: number = Math.min(1, maxSide / Math.max(source.width, source.height));
    const w: number = Math.max(1, Math.round(source.width * scale));
    const h: number = Math.max(1, Math.round(source.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    for (const q of [0.8, 0.6, 0.45]) {
      const url: string = c.toDataURL("image/jpeg", q);
      if (url.length <= 75_000) return url;
    }
    return null;
  } catch {
    return null;
  }
}


export function ShopDesignEditor({
  kind,
  product,
  variantId,
  editId,
}: {
  kind: ShopEditorKind;
  product: ShopProduct;
  variantId: string | null;
  editId: string | null;
}) {
  const { t } = useShopLang();
  const lines = useCart();
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <p className="m-0 py-16 text-center text-(--muted2)" aria-busy="true">
        {t("editorLoading")}
      </p>
    );
  }
  const editLine: CartLine | null = editId
    ? (lines.find((l) => l.id === editId && l.design?.editor === kind && l.quote.kind === kind) ?? null)
    : null;
  return (
    <EditorBody
      key={editLine?.id ?? "new"}
      kind={kind}
      product={product}
      variantId={variantId}
      editLine={editLine}
      editGone={editId != null && editLine == null}
    />
  );
}

function EditorBody({
  kind,
  product,
  variantId,
  editLine,
  editGone,
}: {
  kind: ShopEditorKind;
  product: ShopProduct;
  variantId: string | null;
  editLine: CartLine | null;
  editGone: boolean;
}) {
  const { t, lang, href } = useShopLang();
  useEditorLanguage(lang);
  const router = useRouter();
  const saved: ShopDesignLayout | null = editLine?.design?.layout ?? null;

  // ─── Product option (colour) ───────────────────────────────────────────
  const startVariant: ShopVariant | undefined =
    product.variants.find((v) => v.id === (editLine?.quote.kind === kind ? editLine.quote.productId : variantId)) ??
    product.variants.find((v) => inStock(v.stock)) ??
    product.variants[0];
  const [optionKey, setOptionKey] = useState<string>(startVariant?.id ?? "");
  const variant: ShopVariant | undefined = product.variants.find((v) => v.id === optionKey) ?? startVariant;

  // Studio data of the variant: print area, DPI and the 3D look.
  const [items, setItems] = useState<EditorItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/${kind}-products`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: EditorItem[] }) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);
  const item: EditorItem | undefined = items?.find((i) => i.id === variant?.id);
  const print: PrintSizeCm = item
    ? { widthCm: item.printWidthCm, heightCm: item.printHeightCm, dpi: item.printDpi }
    : DEFAULT_PRINT[kind];
  const canvasW: number = cmToPx(print.widthCm, print.dpi);
  const canvasH: number = cmToPx(print.heightCm, print.dpi);
  const templates: AnyTemplate[] = buildTemplates(kind, canvasW, canvasH);

  // ─── Design state (the studio editor's layout) ─────────────────────────
  const [templateId, setTemplateId] = useState<string | null>(saved?.templateId ?? null);
  const template: AnyTemplate | null = templateId ? (templates.find((x) => x.id === templateId) ?? templates[0]!) : null;
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings[]>([]);
  const [text, setText] = useState<string>(saved?.text ?? "");
  const [fontFamily, setFontFamily] = useState<string>(saved?.fontFamily ?? FONT_OPTIONS[0].family);
  const [textColor, setTextColor] = useState<string>(saved?.textColor ?? "#000000");
  const [backgroundColor, setBackgroundColor] = useState<string>(saved?.backgroundColor ?? "transparent");
  /** Photo object URL → its upload key (photos of a reopened design are not uploaded twice). */
  const photoKeys = useRef(new Map<string, string>());
  const photoBlobs = useRef(new Map<string, Blob>());
  const [photosLost, setPhotosLost] = useState(false);
  const [photosReady, setPhotosReady] = useState(saved == null || saved.photoUrls.length === 0);

  // Reopened design: its photos come back from this browser (IndexedDB).
  useEffect(() => {
    if (!saved || saved.photoUrls.length === 0) return;
    let cancelled = false;
    void loadDesignPhotos(saved.photoUrls).then((found) => {
      if (cancelled) return;
      const urls: string[] = [];
      const settings: PhotoSettings[] = [];
      saved.photoUrls.forEach((key, i) => {
        const blob = found.get(key);
        if (!blob) return;
        const url: string = URL.createObjectURL(blob);
        photoKeys.current.set(url, key);
        photoBlobs.current.set(url, blob);
        urls.push(url);
        const s = saved.photoSettings[i];
        settings.push({
          fitMode: s?.fitMode ?? "cover",
          alignment: s?.alignment ?? "center",
          verticalAlignment: s?.verticalAlignment ?? "center",
          ...(s?.naturalWidth ? { naturalWidth: s.naturalWidth } : {}),
          ...(s?.naturalHeight ? { naturalHeight: s.naturalHeight } : {}),
        });
      });
      setPhotos(urls);
      setPhotoSettings(settings);
      setPhotosLost(urls.length < saved.photoUrls.length);
      setPhotosReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [saved]);

  // ─── Steps ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(saved ? 2 : 1);
  const stepNames = [t("editorStepTemplate"), t("editorStepDesign"), t("editorStepPreview")];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // ─── Quantity + price ──────────────────────────────────────────────────
  const maxQty: number = maxOrderQty(variant?.stock, CART_MAX_QTY);
  const [qty, setQty] = useState<number>(
    editLine?.quote.kind === kind ? Math.max(1, Math.min(editLine.quote.quantity, Math.max(1, maxQty))) : 1,
  );
  const quoteLine: ShopQuoteLine | null = variant ? { kind, productId: variant.id, quantity: qty } : null;
  const quote = useLiveQuote(step === 3 ? quoteLine : null, lang);
  const total: number | null =
    quote.status === "done" && quote.line.ok
      ? quote.line.total
      : quote.status === "loading" && quote.previous?.ok
        ? quote.previous.total
        : null;
  const soldOut: boolean = maxQty === 0;

  // ─── Canvas + 3D ───────────────────────────────────────────────────────
  const canvasRef = useRef<CanvasHandle>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  /**
   * Every photo slot of the template needs a photo: an empty slot is drawn as
   * a grey «Photo N» placeholder, which would end up in the print file.
   */
  const photosMissing: number = template ? Math.max(0, template.photoSlots.length - photos.length) : 0;
  const isEmpty: boolean = photos.length === 0 && (text.trim() === "" || Boolean(template?.noText));
  const notReady: boolean = isEmpty || photosMissing > 0;

  // ─── Save into the cart ────────────────────────────────────────────────
  const [saving, setSaving] = useState<null | { pct: number | null }>(null);
  const [failed, setFailed] = useState(false);
  const labels = useMemo(() => buildLineLabels([product]), [product]);

  const save = async () => {
    if (!template || !variant || !quoteLine || soldOut) return;
    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) return;
    setFailed(false);
    setSaving({ pct: null });
    try {
      // Fonts load lazily: wait for the caption font and redraw before the print file is taken.
      await canvasRef.current?.prepareForExport();
      // Photos first (the studio editor stores them with the layout).
      const photoUrls: string[] = [];
      const toRemember: { key: string; blob: Blob }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const url: string = photos[i]!;
        let key: string | undefined = photoKeys.current.get(url);
        const blob: Blob = photoBlobs.current.get(url) ?? (await (await fetch(url)).blob());
        if (!key) {
          const ext: string = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          // eslint-disable-next-line react-hooks/purity -- runs in the click handler, not during render
          const f = new File([blob], `${kind}-photo-${Date.now()}-${i}.${ext}`, { type: blob.type || "image/jpeg" });
          key = (await uploadArtwork(f, () => {})).fileKey;
          photoKeys.current.set(url, key);
        }
        photoUrls.push(key);
        toRemember.push({ key, blob });
      }
      // The print file: the editor canvas at full print resolution, DPI written into the PNG.
      const png: Blob = await exportCanvasAsBlob(canvas, print.dpi);
      // eslint-disable-next-line react-hooks/purity -- runs in the click handler, not during render
      const file: File = blobToFile(png, `${kind}-layout-${Date.now()}.png`);
      const ref = await uploadArtwork(file, (pct) => setSaving({ pct }));
      await saveDesignPhotos(toRemember);

      const layout: ShopDesignLayout = {
        templateId: template.id,
        text,
        fontFamily,
        textColor,
        backgroundColor,
        photoUrls,
        photoSettings: photoSettings.slice(0, photoUrls.length).map((s) => ({
          fitMode: s.fitMode,
          alignment: s.alignment,
          verticalAlignment: s.verticalAlignment ?? "center",
          ...(s.naturalWidth ? { naturalWidth: s.naturalWidth } : {}),
          ...(s.naturalHeight ? { naturalHeight: s.naturalHeight } : {}),
        })),
      };
      // The print layout itself (the 3D view may be turned away from the design).
      const preview: string | null = thumbnailOf(canvas);
      const lineText = describeQuoteLine(quoteLine, labels, t);
      const line: CartLine = designCartLine({
        kind,
        slug: product.slug,
        variantId: variant.id,
        quantity: qty,
        file: ref,
        layout,
        preview,
        title: lineText?.title ?? product.name,
        optionsText: lineText?.optionsText ?? variant.label,
        image: variant.images[0] ?? product.image,
        lastTotal: total,
        id: editLine?.id ?? newLineId(),
        // eslint-disable-next-line react-hooks/purity -- runs in the click handler, not during render
        addedAt: editLine?.addedAt ?? Date.now(),
      });
      dispatchCart(editLine ? { type: "update", line } : { type: "add", line });
      router.push(href("/shop/cos"));
    } catch (e) {
      console.error("[shop editor] save failed:", e);
      setFailed(true);
      setSaving(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  const backHref: string = editLine ? href("/shop/cos") : href(`/shop/p/${product.slug}`);
  const baseColor: string | null = !item
    ? null
    : kind === "notebook"
      ? (item as NotebookProductOption).coverColorHex
      : (item as MugProductOption | PenProductOption).bodyColorHex;
  const has3d: boolean = kind !== "pen" && (item ? item.has3dPreview : false);

  const designProps = {
    photos,
    photoSettings,
    text,
    fontFamily,
    textColor,
    backgroundColor,
    productBaseColor: baseColor,
    onPhotosChange: (next: string[]) => {
      setPhotos(next);
      setPhotosLost(false);
    },
    onPhotoSettingsChange: setPhotoSettings,
    onTextChange: setText,
    onFontChange: setFontFamily,
    onTextColorChange: setTextColor,
    onBgColorChange: setBackgroundColor,
  };
  const canvasProps = { photoUrls: photos, photoSettings, text, fontFamily, textColor, backgroundColor };

  const canvasPreview = (onReady?: (c: HTMLCanvasElement) => void) =>
    !template ? null : kind === "mug" ? (
      <MugCanvasPreview ref={canvasRef} template={template as MugTemplate} {...canvasProps} onCanvasReady={onReady} />
    ) : kind === "notebook" ? (
      <NotebookCanvasPreview
        ref={canvasRef}
        template={template as NotebookTemplate}
        {...canvasProps}
        onCanvasReady={onReady}
        canvasClassName="mx-auto max-h-[46vh] w-auto"
      />
    ) : (
      <PenCanvasPreview ref={canvasRef} template={template as PenTemplate} {...canvasProps} onCanvasReady={onReady} />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-(--muted) no-underline">
          ← {editLine ? t("editorBackCart") : t("editorBackProduct")}
        </Link>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl leading-tight font-extrabold sm:text-3xl">{t("editorTitle", { name: product.name })}</h1>
        <p className="m-0 text-sm text-(--muted2)">
          {t("editorPrintArea", {
            size: `${String(print.widthCm).replace(".", lang === "en" ? "." : ",")}×${String(print.heightCm).replace(".", lang === "en" ? "." : ",")}`,
            dpi: print.dpi,
          })}
        </p>
      </div>

      {editLine ? (
        <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
          {t("editingLine")}
        </p>
      ) : editGone ? (
        <p role="status" className="m-0 rounded-xl bg-(--soft) px-4 py-2.5 text-sm">
          {t("editorLineGone")}
        </p>
      ) : null}
      {photosLost ? (
        <p role="alert" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
          {t("editorPhotosLost")}
        </p>
      ) : null}

      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={t("editorStepLine", { n: step, total: 3, name: stepNames[step - 1]! })}>
        {stepNames.map((name, i) => (
          <li key={name} className="flex flex-1 flex-col gap-1">
            <span className={`h-1.5 rounded-full ${i < step ? "bg-(--ink)" : "bg-(--line)"}`} />
            <span className={`text-xs ${i + 1 === step ? "font-bold" : "text-(--muted2)"}`}>{name}</span>
          </li>
        ))}
      </ol>

      {product.variants.length > 1 ? (
        <OptionPicker
          title={
            new Set(product.variants.map((v) => v.hex)).size === 1
              ? t("variantWithName", { name: variant?.label ?? "" })
              : t("colorWithName", { name: variant?.label ?? "" })
          }
          options={product.variants.map((v) => ({
            key: v.id,
            label: v.label,
            hex: v.hex,
            disabled: !inStock(v.stock),
            disabledLabel: t("optionOutOfStock", { name: v.label }),
          }))}
          value={optionKey}
          onChange={(k) => {
            setOptionKey(k);
            const max: number = maxOrderQty(product.variants.find((v) => v.id === k)?.stock, CART_MAX_QTY);
            if (max > 0 && qty > max) setQty(max);
          }}
        />
      ) : null}

      {items == null || !photosReady ? (
        <p className="m-0 py-10 text-center text-(--muted2)" aria-busy="true">
          {t("editorLoading")}
        </p>
      ) : step === 1 ? (
        <section className="flex flex-col gap-4">
          {kind === "mug" ? (
            <TemplateSelector selected={templateId} onSelect={(x) => setTemplateId(x.id)} canvasWidth={canvasW} canvasHeight={canvasH} />
          ) : kind === "notebook" ? (
            <NotebookTemplateSelector selected={templateId} onSelect={(x) => setTemplateId(x.id)} canvasWidth={canvasW} canvasHeight={canvasH} />
          ) : (
            <PenTemplateSelector selected={templateId} onSelect={(x) => setTemplateId(x.id)} canvasWidth={canvasW} canvasHeight={canvasH} />
          )}
          <StepButtons next={() => setStep(2)} nextDisabled={!templateId} nextLabel={t("editorNext")} />
        </section>
      ) : step === 2 && template ? (
        <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          <div className="order-2 lg:order-1">
            {kind === "mug" ? (
              <MugEditor template={template as MugTemplate} {...designProps} />
            ) : kind === "notebook" ? (
              <NotebookEditor template={template as NotebookTemplate} {...designProps} />
            ) : (
              <PenEditor template={template as PenTemplate} {...designProps} />
            )}
          </div>
          <div className="sticky top-2 z-10 order-1 rounded-xl bg-white/95 p-1 backdrop-blur-sm lg:order-2">{canvasPreview()}</div>
          <div className="order-3 lg:col-span-2">
            <StepButtons
              back={() => setStep(1)}
              backLabel={t("editorPrev")}
              next={() => setStep(3)}
              nextDisabled={notReady}
              nextLabel={t("editorNext")}
            />
            {photosMissing > 0 ? (
              <p className="m-0 mt-2 text-sm text-(--muted2)">{t("editorPhotosNeeded", { n: photosMissing })}</p>
            ) : isEmpty ? (
              <p className="m-0 mt-2 text-sm text-(--muted2)">{t("editorEmptyDesign")}</p>
            ) : null}
          </div>
        </section>
      ) : step === 3 && template ? (
        <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8">
          <div className="flex flex-col gap-3">
            <div className={kind === "notebook" ? "mx-auto w-40 sm:w-48" : ""}>{canvasPreview(setCanvasEl)}</div>
            {has3d ? (
              <div>
                {kind === "mug" ? (
                  <Mug3DPreview canvasElement={canvasEl} {...colorsFromProduct(item as MugProductOption)} />
                ) : (
                  <Notebook3DPreview canvasElement={canvasEl} {...colorsFromNotebookProduct(item as NotebookProductOption)} />
                )}
              </div>
            ) : kind === "pen" ? (
              <p className="m-0 text-sm text-(--muted2)">{t("editorFlatPreview")}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-4">
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
                {quote.line.reason === "price_unavailable" ? t("priceUnavailable") : t("lineUnavailable")}
              </span>
            ) : null}
            {failed ? (
              <span role="alert" className="text-sm font-semibold text-(--err)">
                {t("editorSaveFailed")}
              </span>
            ) : null}
            {saving ? (
              <span role="status" className="text-sm text-(--muted)">
                {saving.pct == null ? t("editorSaving") : t("editorSavingPct", { pct: saving.pct })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving != null || soldOut || notReady || (quote.status === "done" && !quote.line.ok)}
              className="shop-btn-dark rounded-xl bg-(--ink) py-4 text-center text-[17px] font-extrabold disabled:opacity-50"
            >
              {editLine ? t("updateInCart") : t("addToCart")}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={saving != null}
              className="min-h-11 rounded-xl border-[1.5px] border-(--line2) font-semibold"
            >
              {t("editorPrev")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepButtons({
  back,
  backLabel,
  next,
  nextLabel,
  nextDisabled,
}: {
  back?: () => void;
  backLabel?: string;
  next: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-20 z-10 flex gap-3 bg-white/95 py-2 backdrop-blur-sm md:bottom-0">
      {back ? (
        <button type="button" onClick={back} className="min-h-12 flex-1 rounded-xl border-[1.5px] border-(--line2) font-semibold">
          {backLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={next}
        disabled={nextDisabled}
        className="shop-btn-dark min-h-12 flex-1 rounded-xl bg-(--ink) font-extrabold disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}

