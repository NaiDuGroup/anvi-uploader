"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blobToFile } from "@/lib/mug/exportLayout";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, refuseIfCartFull } from "@/lib/storefront/cartStore";
import { studioEditorPath, type ShopLineStudio } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang } from "@/lib/storefront/i18n";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import { shopSizeLabel } from "@/lib/storefront/sizes";
import { colorInStock, inStock } from "@/lib/storefront/stock";
import type { ShopDtfColor, ShopProduct } from "@/lib/storefront/types";
import { uploadArtwork } from "@/lib/storefront/upload";
import {
  apparelClampSizes,
  apparelDesignCartLine,
  apparelEstimate,
  apparelFormatOf,
  apparelFormatsOfDoc,
  apparelGarment,
  apparelNextStep,
  apparelOneSize,
  apparelPieces,
  apparelPlacement,
  apparelQuoteLine,
  apparelSelectionOfQuote,
  apparelSizeMax,
  apparelStartSizes,
  apparelSurfacePrints,
  apparelSurfaceSpecs,
  apparelUsedZones,
  apparelZoneDelta,
  apparelZoneFormats,
  APPAREL_SAMPLE_TEXTS,
  parseApparelDraftState,
  type ApparelDraftState,
  type ApparelFormat,
  type ApparelFormats,
  type ApparelGarmentConfig,
  type ApparelPricing,
  type ApparelSizes,
  type ApparelZoneFile,
  type ApparelZoneId,
} from "@/lib/studio/apparel";
import { APPAREL_REFERENCE, apparelCanvasBackdrop, apparelPrintBox, apparelViews, canvasBackdropOf, type ApparelView } from "@/lib/studio/apparelMockup";
import { evaluateApparelQuality, hasOpaqueEdges, removeFlatBackground } from "@/lib/studio/apparelQuality";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import type { StudioCartProgress } from "@/lib/studio/cartProgress";
import { addLayer, emptyStudioDoc, layerBounds, updateLayer, type StudioDoc, type StudioImageLayer } from "@/lib/studio/document";
import { exportStudioPng, renderPreviewCanvas } from "@/lib/studio/exportClient";
import { fitTextBox } from "@/lib/studio/fonts";
import { studioApparelT } from "@/lib/studio/i18n.apparel";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { newImageLayer, newTextLayer } from "@/lib/studio/layerFactory";
import { toLegacyLayout } from "@/lib/studio/legacy";
import { studioPhotoSampler } from "@/lib/studio/photoSampler";
import { studioInkFor, studioQualityBlocks, studioQualityCounts, type StudioQualityItem } from "@/lib/studio/quality";
import { deleteDoc, listDocs, loadDoc, resumableDrafts, saveDoc } from "@/lib/studio/storage";
import { initialSurfaceBases, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioApprovalChecks } from "@/lib/studio/verifyChecklist";
import { QtyStepper } from "../ProductBits";
import { ShopImg } from "../ShopImg";
import { useShopLang } from "../ShopLangProvider";
import { ApparelMockup, mockupJpeg, type ApparelMockupPrint } from "./ApparelMockup";
import type { Rect } from "@/lib/studio/photoMockup";
import { canvasJpeg, photoGarmentCm } from "./apparelPhoto";
import { canvasDataUrl, composeApparelViews, framedCanvas, garmentFrame, useApparelComposites, useApparelPhotoViews, type ApparelComposites, type ApparelPhotosState } from "./useApparelPhotos";
import { ApparelRotateButton } from "./ApparelRotate";
import { StudioAdded } from "./StudioAdded";
import { StudioApp, type StudioEditorApi, type StudioExtensions } from "./StudioApp";
import { StudioQualityChip, StudioQualityDialog, StudioQualityList, type StudioQualityState } from "./StudioQuality";
import { Icon, STUDIO_ICONS } from "./StudioUi";
import { StudioCartProgressLine, StudioPhotosMissing, uploadStudioPhotos } from "./StudioVerify";

/**
 * ANVI Studio for DTF apparel (`/studio/apparel?slug=…`): T-shirt, polo, cap.
 * The editor (`StudioApp`) with one transparent surface per print zone at the
 * picked DTF format, the «Produs» panel (garment, colour, print size per zone,
 * sizes and quantity, live price from the server's own engine), the zone tabs
 * with each zone's price, the drawn garment mockup to scale, the DTF checks,
 * «Elimină fundalul», «Verifică produsul» and the cart line (one 300 dpi
 * transparent PNG per printed zone on the ordinary DTF line).
 */

/** What the page loads besides the product: prices for the live estimate and the other garments. */
export interface ApparelPageData {
  pricing: ApparelPricing | null;
  products: { slug: string; name: string; image: string | null; fromPrice: number | null }[];
}

type Phase = "loading" | "resume" | "edit" | "verify" | "done";

interface Sel {
  colorKey: string;
  formats: ApparelFormats;
  sizes: ApparelSizes;
}

const TOOLS = ["product", "text", "images", "elements", "qr"] as const;

function firstColor(product: ShopProduct): ShopDtfColor | undefined {
  return product.dtf?.colors.find(colorInStock) ?? product.dtf?.colors[0];
}

function freshSel(product: ShopProduct): Sel {
  const c = firstColor(product);
  return { colorKey: c?.key ?? "", formats: {}, sizes: apparelStartSizes(c) };
}

/** The picks a stored draft / cart line brings back, kept within what the product offers now. */
function selFrom(product: ShopProduct, s: ApparelDraftState | null): Sel {
  if (!s) return freshSel(product);
  const c = product.dtf?.colors.find((x) => x.key === s.colorKey) ?? firstColor(product);
  const sizes = apparelClampSizes(c, s.sizes);
  return { colorKey: c?.key ?? "", formats: s.formats, sizes: apparelPieces(sizes) > 0 ? sizes : apparelStartSizes(c) };
}

export function StudioApparelBody({
  product,
  data,
  editLine,
  cartDocIds,
  forceNew,
  onStartOver,
}: {
  product: ShopProduct;
  data: ApparelPageData;
  editLine: CartLine | null;
  cartDocIds: string[];
  forceNew: boolean;
  onStartOver: (edit: string | null, opts: { slug: string | null; variant: string | null }) => void;
}) {
  const { lang } = useShopLang();
  const garment: ApparelGarmentConfig | null = apparelGarment(product.slug);
  // The picks: the cart line's (re-edit), the draft's (looked up before the editor starts), else fresh.
  const [sel, setSel] = useState<Sel | null>(() => {
    const fromLine = apparelSelectionOfQuote(product, editLine?.quote);
    if (fromLine) return selFrom(product, fromLine);
    return forceNew || editLine ? freshSel(product) : null;
  });
  const draftRef = useRef<{ id: string; doc: StudioDoc } | null>(null);
  useEffect(() => {
    if (sel != null || !garment) return;
    let cancelled = false;
    void listDocs("apparel")
      .then((docs) => {
        const d = resumableDrafts(docs, cartDocIds, product.slug)[0];
        if (cancelled) return;
        if (d) {
          draftRef.current = { id: d.id, doc: d.doc };
          const st = parseApparelDraftState((d as { apparel?: unknown }).apparel);
          const s = selFrom(product, st);
          setSel(st ? s : { ...s, formats: apparelFormatsOfDoc(product, garment, d.doc) });
        } else setSel(freshSel(product));
      })
      .catch(() => !cancelled && setSel(freshSel(product)));
    return () => {
      cancelled = true;
    };
    // Once, before the editor starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!garment || !product.dtf) return null;
  if (!sel) {
    return (
      <p className="m-0 py-16 text-center text-(--muted2)" aria-busy="true">
        …
      </p>
    );
  }
  return (
    <ApparelEditor
      product={product}
      garment={garment}
      data={data}
      editLine={editLine}
      cartDocIds={cartDocIds}
      forceNew={forceNew}
      sel={sel}
      onSel={setSel}
      draft={draftRef.current}
      lang={lang}
      onStartOver={onStartOver}
    />
  );
}

function ApparelEditor({
  product,
  garment,
  data,
  editLine,
  forceNew,
  sel,
  onSel,
  draft,
  lang,
  onStartOver,
}: {
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  data: ApparelPageData;
  editLine: CartLine | null;
  cartDocIds: string[];
  forceNew: boolean;
  sel: Sel;
  onSel: (s: Sel) => void;
  draft: { id: string; doc: StudioDoc } | null;
  lang: ShopLang;
  onStartOver: (edit: string | null, opts: { slug: string | null; variant: string | null }) => void;
}) {
  const st = studioShopT(lang);
  const [phase, setPhaseState] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>(phase);
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [note, setNote] = useState<string | null>(editLine ? st("editingLine") : null);
  const [added, setAdded] = useState<CartLine | null>(null);
  const specs: StudioSurfaceSpec[] = useMemo(() => apparelSurfaceSpecs(product, garment, sel.formats), [product, garment, sel.formats]);
  const color: ShopDtfColor | undefined = product.dtf?.colors.find((c) => c.key === sel.colorKey) ?? firstColor(product);
  const colorHex: string = color?.hex ?? "#ffffff";
  // The garment photos (supplier photos in the picked colour); the drawings are the fallback.
  const photos: ApparelPhotosState = useApparelPhotoViews(garment.shape, color ? { key: color.key, hex: colorHex } : null);
  // The garment drawings (front / back) as bitmaps for the editor canvas (no photo).
  const [garmentImgs, setGarmentImgs] = useState<Partial<Record<ApparelView, CanvasImageSource>>>({});
  // The photos with the design printed (composited after each change; shown on the canvas while nothing is selected).
  const [composites, setComposites] = useState<ApparelComposites>({ canvases: {}, cutOut: {}, key: null });
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  });

  // ─── Autosave (the document and the picks) ────────────────────────────
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<number | null>(null);
  const lastDoc = useRef<StudioDoc | null>(null);
  useEffect(() => () => void (timer.current != null && window.clearTimeout(timer.current)), []);
  const scheduleSave = useCallback(() => {
    const doc = lastDoc.current;
    const p = phaseRef.current;
    if (!doc || (p !== "edit" && p !== "verify")) return;
    if (!doc.surfaces.some((s) => s.layers.length > 0)) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = window.setTimeout(() => {
      const s = selRef.current;
      void saveDoc({ id: doc.id, kind: "apparel", doc, slug: product.slug, variantId: s.colorKey, step: phaseRef.current === "verify" ? "verify" : "edit", apparel: { colorKey: s.colorKey, formats: s.formats, sizes: s.sizes } }).then(() => setSaveState("saved"));
    }, 800);
  }, [product.slug]);
  // A new colour / format / size: kept with the draft too.
  const setSel = useCallback(
    (next: Sel) => {
      selRef.current = next;
      onSel(next);
      scheduleSave();
    },
    [onSel, scheduleSave],
  );

  const initialDoc: StudioExtensions["initialDoc"] = async () => {
    if (editLine?.design?.studio) {
      const stored = await loadDoc(editLine.design.studio.docId);
      if (stored) {
        setPhase("edit");
        return stored.doc;
      }
      setNote(st("photosMissing"));
      setPhase("edit");
      return null;
    }
    if (!forceNew && draft) {
      setPhase("resume");
      return draft.doc;
    }
    setPhase("edit");
    return null;
  };

  const extensions: StudioExtensions = {
    tools: TOOLS,
    surfaceBarStart: true,
    initialTool: "product",
    initialDoc,
    onDocChange: (doc) => {
      lastDoc.current = doc;
      scheduleSave();
    },
    status: () => (saveState === "saving" ? st("saving") : st("saved")),
    panels: {
      product: (api) => <ApparelProductPanel api={api} product={product} garment={garment} data={data} sel={sel} onSel={setSel} />,
    },
    surfaceBar: (api) => (phase === "edit" ? <ApparelZoneBar api={api} product={product} garment={garment} pricing={data.pricing} sel={sel} /> : null),
    // The garment itself is the canvas (the zone on it, to scale); desktop: the other side as a thumbnail.
    canvasBackdrop: (api) => {
      const z = garment.zones.find((x) => x.id === api.spec.id) ?? garment.zones[0]!;
      const f = apparelFormatOf(product, z, sel.formats);
      if (!f) return null;
      const box = apparelPrintBox(garment.shape, z.id, apparelPlacement(garment.shape, z.id, f), f.widthCm, f.heightCm);
      const pv = photos.views[box.view];
      if (pv) {
        const cm = photoGarmentCm(pv);
        const surface = api.doc.surfaces.find((s) => s.id === api.spec.id);
        // An empty photo frame must stay visible (it is not printed, so the composite would hide it).
        const placeholder: boolean = !!surface?.layers.some((l) => l.kind === "image" && !l.src && !l.hidden);
        const overlay = !placeholder && composites.key === String(api.version) ? (composites.cutOut[box.view] ?? null) : null;
        return { ...canvasBackdropOf(cm.image, cm.garment, box, { tight: api.isPhone }), image: pv.canvas, overlay };
      }
      if (photos.status === "loading") return { ...apparelCanvasBackdrop(garment.shape, box, { tight: api.isPhone }), image: null };
      return { ...apparelCanvasBackdrop(garment.shape, box, { tight: api.isPhone }), image: garmentImgs[box.view] ?? null };
    },
    // The photo compositor (invisible), and on desktop the other side as a thumbnail.
    canvasOverlay: (api: StudioEditorApi) => (
      <>
        <ApparelPhotoComposer api={api} product={product} garment={garment} sel={sel} photos={photos} onComposites={setComposites} />
        {garment.zones.length > 1 && !api.isPhone ? <ApparelOtherSide api={api} product={product} garment={garment} sel={sel} colorHex={colorHex} photos={photos} composites={composites} /> : null}
      </>
    ),
    rightPanelTop: (api) => (
      <ApparelQualityPanel api={api} garment={garment} />
    ),
    primaryAction: (api) =>
      phase === "edit" ? (
        <ApparelPrimary
          api={api}
          product={product}
          garment={garment}
          pricing={data.pricing}
          sel={sel}
          onContinue={() => {
            api.select(null);
            setPhase("verify");
          }}
        />
      ) : null,
    screen: (api) => {
      switch (phase) {
        case "loading":
          return null;
        case "resume":
          return (
            <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
              <h1 className="m-0 text-2xl font-extrabold">{st("resumeTitle")}</h1>
              <p className="m-0 text-sm text-(--muted)">{st("resumeLead")}</p>
              <div className="overflow-hidden rounded-xl bg-[#f4f5f7] p-3">
                <ApparelPicture api={api} product={product} garment={garment} sel={sel} colorHex={colorHex} photos={photos} view={apparelUsedZones(garment, api.doc)[0] === "back" ? "back" : "front"} />
              </div>
              <button type="button" className="min-h-12 rounded-xl bg-(--ink) font-extrabold text-white" onClick={() => setPhase("edit")}>
                {st("resumeYes")}
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl border-[1.5px] border-(--line2) font-bold"
                onClick={() => {
                  if (draft) void deleteDoc(draft.id);
                  setSel(freshSel(product));
                  api.replaceDoc(emptyStudioDoc("apparel", initialSurfaceBases(api.specs)), { resetHistory: true });
                  setPhase("edit");
                }}
              >
                {st("resumeNo")}
              </button>
            </div>
          );
        case "verify":
          return (
            <ApparelVerify
              api={api}
              product={product}
              garment={garment}
              data={data}
              sel={sel}
              onSel={setSel}
              colorHex={colorHex}
              photos={photos}
              editLine={editLine}
              note={note}
              onBack={() => {
                setNote(null);
                setPhase("edit");
              }}
              onAdded={(line) => {
                setNote(null);
                setAdded(line);
                setPhase("done");
              }}
            />
          );
        case "done":
          if (!added) return null;
          return (
            <StudioAdded
              line={added}
              updated={editLine?.id === added.id}
              lang={lang}
              onAgain={() => onStartOver(null, { slug: product.slug, variant: null })}
              onEdit={() => onStartOver(added.id, { slug: product.slug, variant: null })}
              sideLabels={{ front: studioApparelT(lang)("viewFront"), back: studioApparelT(lang)("viewBack") }}
            />
          );
        default:
          return null;
      }
    },
  };

  return (
    <>
      {photos.status === "none" ? <GarmentImages shape={garment.shape} color={colorHex} onImages={setGarmentImgs} /> : null}
      {note && phase === "edit" ? <p className="fixed top-14 left-1/2 z-[70] m-0 -translate-x-1/2 rounded-b-lg bg-[#faf3dc] px-4 py-1.5 text-sm font-semibold text-[#7a6512] md:top-16">{note}</p> : null}
      <StudioApp kind="apparel" product={product} variantId={null} editId={editLine?.id ?? null} extensions={extensions} specsOverride={specs} colorOverride={colorHex} />
    </>
  );
}

// ─── Prices ──────────────────────────────────────────────────────────────

function useApparelLine(api: Pick<StudioEditorApi, "doc">, product: ShopProduct, garment: ApparelGarmentConfig, sel: Sel) {
  const used = useMemo(() => apparelUsedZones(garment, api.doc), [garment, api.doc]);
  const usedKey: string = used.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the printed zones
  const line = useMemo(() => apparelQuoteLine(product, sel, used), [product, sel, usedKey]);
  return { used, line };
}

/** A zone's price chip: «inclus» (cap), «+180 lei», or nothing when it cannot be priced. */
function zoneChip(lang: ShopLang, delta: number | null, fixed: boolean): string | null {
  const t = studioApparelT(lang);
  if (fixed) return t("included");
  if (delta == null) return null;
  return t("plus", { price: formatPrice(delta, lang) });
}

// ─── Zone tabs over the canvas ───────────────────────────────────────────

function ApparelZoneBar({ api, product, garment, pricing, sel }: { api: StudioEditorApi; product: ShopProduct; garment: ApparelGarmentConfig; pricing: ApparelPricing | null; sel: Sel }) {
  const t = studioApparelT(api.lang);
  const { used } = useApparelLine(api, product, garment, sel);
  const fileInput = useRef<HTMLInputElement>(null);
  const surface = api.doc.surfaces.find((s) => s.id === api.spec.id);
  const empty: boolean = !surface || !apparelSurfacePrints(surface);
  const zoneName = (id: ApparelZoneId) => (id === "back" ? t("zoneBack") : t("zoneFront"));
  const addText = () => {
    if (!surface) return;
    const raw = newTextLayer(surface, "title", APPAREL_SAMPLE_TEXTS[api.lang]);
    // A line across ~60 % of the zone (the title preset is sized for mugs / covers).
    const small: boolean = surface.heightMm < 120;
    const sizePt: number = Math.max(9, Math.round(Math.min(raw.sizePt, surface.widthMm * (small ? 0.24 : 0.32), surface.heightMm * 0.5)));
    // A clean bold sans on garments (the title preset's serif reads poorly on fabric).
    let l = fitTextBox({ ...raw, fontFamily: "Montserrat", sizePt, w: surface.widthMm * 0.9, x: surface.widthMm * 0.05 });
    // A logo-size zone: in the middle; a chest / back print: near the top (where a print usually starts).
    l = { ...l, x: (surface.widthMm - l.w) / 2, y: Math.max(0, small ? (surface.heightMm - l.h) / 2 : surface.heightMm * 0.18 - l.h / 2) };
    // A sample: flagged, and opened for typing with the text selected (typing replaces it).
    l = { ...l, placeholder: true, color: studioInkFor(surface, layerBounds(l), api.productColor) };
    api.setDoc(addLayer(api.doc, surface.id, l));
    api.editText(l.id);
  };
  const addImage = async (file: File) => {
    if (!surface || !(STUDIO_PHOTO_TYPES as readonly string[]).includes(file.type) || file.size > STUDIO_PHOTO_MAX_BYTES) return;
    const a = await api.assets.addFile(file);
    const layer = newImageLayer(surface, { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime });
    api.setDoc(addLayer(api.doc, surface.id, layer));
    api.select(layer.id);
  };
  return (
    <div className="flex flex-col items-start gap-2 md:items-center" data-apparel-zone-bar>
      {garment.zones.length > 1 || garment.zones[0]?.formats === "fixed" ? (
        <div role="tablist" aria-label={t("zones")} className="flex gap-1 rounded-xl bg-white p-1 shadow-[0_2px_10px_rgba(20,33,61,0.14)]">
          {garment.zones.map((z) => {
            const f = apparelFormatOf(product, z, sel.formats);
            const on: boolean = api.spec.id === z.id;
            const delta: number | null = apparelZoneDelta(product, sel, used, z.id, pricing);
            const chip = zoneChip(api.lang, delta, z.formats === "fixed");
            const printed: boolean = used.includes(z.id);
            return (
              <button
                key={z.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-apparel-zone-tab={z.id}
                onClick={() => api.setSurface(z.id)}
                className={`flex min-h-11 flex-col items-start justify-center rounded-lg px-2.5 text-left leading-tight md:px-3 ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`}
              >
                <span className="text-[13px] font-extrabold whitespace-nowrap">
                  {zoneName(z.id)}
                  {f ? <span className={`ml-1 font-semibold ${on ? "text-white/75" : "text-(--muted)"}`}>· {f.label.split(" ")[0]}</span> : null}
                </span>
                <span className={`text-[11px] font-bold whitespace-nowrap ${printed ? (on ? "text-[#e5c45a]" : "text-[#1f6b3c]") : on ? "text-white/60" : "text-(--muted2)"}`}>
                  {printed ? chip : `${t("zoneEmpty")}${chip && z.formats !== "fixed" ? ` · ${chip}` : ""}`}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <ApparelBgTool api={api} />
      {empty && surface ? (
        <div className="flex max-w-[calc(100vw-132px)] flex-col items-center gap-2 rounded-xl bg-white/95 px-3 py-2.5 text-center shadow-[0_2px_10px_rgba(20,33,61,0.12)] md:max-w-[320px]" data-apparel-empty>
          <b className="text-sm">{t("emptyZone", { zone: zoneName(api.spec.id as ApparelZoneId) })}</b>
          <span className="text-xs text-(--muted)">{t("emptyZoneLead")}</span>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={addText} data-apparel-add-text className="flex min-h-10 items-center gap-1.5 rounded-lg bg-(--ink) px-3 text-sm font-bold text-white">
              <Icon d={STUDIO_ICONS.text} size={16} />
              {t("addText")}
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} data-apparel-add-image className="flex min-h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold">
              <Icon d={STUDIO_ICONS.images} size={16} />
              {t("addImage")}
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={STUDIO_PHOTO_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-apparel-image-input
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addImage(f);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Mockup ──────────────────────────────────────────────────────────────

/** The printed zones as transparent PNG data URLs (small), redrawn shortly after each change. */
function usePrintUrls(api: StudioEditorApi): Partial<Record<string, string | null>> {
  return usePrintUrlsAt(api).urls;
}

/** As `usePrintUrls`, with the document version they were drawn at. */
function usePrintUrlsAt(api: StudioEditorApi): { urls: Partial<Record<string, string | null>>; version: number | null } {
  const [state, setState] = useState<{ urls: Partial<Record<string, string | null>>; version: number | null }>({ urls: {}, version: null });
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const specKey: string = api.specs.map((s) => `${s.id}:${s.widthMm}x${s.heightMm}`).join(",");
  useEffect(() => {
    const h = window.setTimeout(() => {
      const a = apiRef.current;
      const out: Partial<Record<string, string | null>> = {};
      for (const spec of a.specs) {
        const s = a.doc.surfaces.find((x) => x.id === spec.id);
        if (!s || !apparelSurfacePrints(s)) {
          out[spec.id] = null;
          continue;
        }
        try {
          const c = renderPreviewCanvas(a.doc, spec, a.renderAssets, 720, null, true);
          out[spec.id] = c.toDataURL("image/png");
          c.width = 0;
          c.height = 0;
        } catch {
          out[spec.id] = null;
        }
      }
      setState({ urls: out, version: a.version });
    }, 160);
    return () => window.clearTimeout(h);
  }, [api.version, specKey]);
  return state;
}

function mockupPrints(api: Pick<StudioEditorApi, "specs">, product: ShopProduct, garment: ApparelGarmentConfig, sel: Sel, urls: Partial<Record<string, string | null>>): ApparelMockupPrint[] {
  const out: ApparelMockupPrint[] = [];
  for (const z of garment.zones) {
    const f = apparelFormatOf(product, z, sel.formats);
    if (!f) continue;
    out.push({ zone: z.id, box: apparelPrintBox(garment.shape, z.id, apparelPlacement(garment.shape, z.id, f), f.widthCm, f.heightCm), src: urls[z.id] ?? null });
  }
  return out;
}

const ApparelMockupLive = ({
  api,
  product,
  garment,
  sel,
  colorHex,
  view,
  outlineZone = null,
  svgRef,
  className = "block h-auto w-full",
}: {
  api: StudioEditorApi;
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  sel: Sel;
  colorHex: string;
  view: ApparelView;
  outlineZone?: ApparelZoneId | null;
  svgRef?: (el: SVGSVGElement | null) => void;
  className?: string;
}) => {
  const urls = usePrintUrls(api);
  const prints = mockupPrints(api, product, garment, sel, urls);
  const outline = outlineZone ? (prints.find((p) => p.zone === outlineZone)?.box ?? null) : null;
  return <ApparelMockup ref={svgRef} shape={garment.shape} view={view} color={colorHex} prints={prints} outline={outline} className={className} label={`${product.name} · ${view}`} />;
};

/**
 * Invisible: composites the current design onto the garment photos after each
 * change and hands the canvases up (the editor canvas shows them at rest, the
 * other-side thumbnail too). Keyed by the document version.
 */
function ApparelPhotoComposer({
  api,
  product,
  garment,
  sel,
  photos,
  onComposites,
}: {
  api: StudioEditorApi;
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  sel: Sel;
  photos: ApparelPhotosState;
  onComposites: (c: ApparelComposites) => void;
}) {
  const { urls, version } = usePrintUrlsAt(api);
  const prints = mockupPrints(api, product, garment, sel, urls);
  const comp = useApparelComposites(photos, prints, String(version));
  useEffect(() => {
    onComposites(comp);
  }, [comp, onComposites]);
  return null;
}

/** The garment picture of a view: the photo with the design (or the drawing when there is no photo). */
function ApparelPicture({
  api,
  product,
  garment,
  sel,
  colorHex,
  photos,
  view,
  composite,
  className = "block h-auto w-full",
  maxSide = 1200,
}: {
  api: StudioEditorApi;
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  sel: Sel;
  colorHex: string;
  photos: ApparelPhotosState;
  view: ApparelView;
  /** Already composited (the editor's); else composited here. */
  composite?: HTMLCanvasElement | null;
  className?: string;
  maxSide?: number;
}) {
  if (photos.views[view]) {
    return composite !== undefined ? (
      <PhotoImg canvas={composite} className={className} maxSide={maxSide} alt={`${product.name} · ${view}`} crop={garmentFrame(photos.views[view]!)} />
    ) : (
      <ApparelPhotoLive api={api} product={product} garment={garment} sel={sel} photos={photos} view={view} className={className} maxSide={maxSide} />
    );
  }
  if (photos.status === "loading") return <span className={`${className} aspect-square animate-pulse rounded-xl bg-white/60`} />;
  return <ApparelMockupLive api={api} product={product} garment={garment} sel={sel} colorHex={colorHex} view={view} className={className} />;
}

function ApparelPhotoLive({ api, product, garment, sel, photos, view, className, maxSide }: { api: StudioEditorApi; product: ShopProduct; garment: ApparelGarmentConfig; sel: Sel; photos: ApparelPhotosState; view: ApparelView; className: string; maxSide: number }) {
  const { urls, version } = usePrintUrlsAt(api);
  const comp = useApparelComposites(photos, mockupPrints(api, product, garment, sel, urls), String(version));
  return <PhotoImg canvas={comp.canvases[view] ?? null} className={className} maxSide={maxSide} alt={`${product.name} · ${view}`} crop={photos.views[view] ? garmentFrame(photos.views[view]!) : null} />;
}

function PhotoImg({ canvas, className, maxSide, alt, crop = null }: { canvas: HTMLCanvasElement | null; className: string; maxSide: number; alt: string; crop?: Rect | null }) {
  const cropKey: string = crop ? `${crop.x},${crop.y},${crop.w},${crop.h}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `crop` by value (`cropKey`)
  const src: string = useMemo(() => (canvas ? canvasDataUrl(canvas, maxSide, 0.88, crop) : ""), [canvas, maxSide, cropKey]);
  if (!src) return <span className={`${className} aspect-square animate-pulse rounded-xl bg-white/60`} />;
  // eslint-disable-next-line @next/next/no-img-element -- a data URL composed in the browser
  return <img src={src} alt={alt} className={className} data-apparel-photo />;
}

/** Cart / «added» picture of a composite: the garment's frame, JPEG ≤ 75 kB. */
function framedJpeg(c: HTMLCanvasElement, v: Parameters<typeof garmentFrame>[0], side: number): string | null {
  const framed = framedCanvas(c, side * 2, garmentFrame(v, 0.04));
  return framed ? canvasJpeg(framed, side) : null;
}

/** Desktop: the other side of the garment with its design, small; a click edits that side. */
function ApparelOtherSide({
  api,
  product,
  garment,
  sel,
  colorHex,
  photos,
  composites,
}: {
  api: StudioEditorApi;
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  sel: Sel;
  colorHex: string;
  photos: ApparelPhotosState;
  composites: ApparelComposites;
}) {
  const t = studioApparelT(api.lang);
  const other: ApparelView = api.spec.id === "back" ? "front" : "back";
  return (
    <button
      type="button"
      onClick={() => api.setSurface(other)}
      className="flex w-[150px] flex-col gap-1 rounded-2xl bg-white p-1.5 text-center shadow-[0_6px_22px_rgba(20,33,61,0.18)]"
      data-apparel-other-side={other}
    >
      <span className="overflow-hidden rounded-xl bg-[#f4f5f7]">
        <ApparelPicture api={api} product={product} garment={garment} sel={sel} colorHex={colorHex} photos={photos} view={other} composite={photos.views[other] ? (composites.canvases[other] ?? photos.views[other]!.canvas) : undefined} maxSide={400} />
      </span>
      <span className="text-xs font-bold">{other === "back" ? t("viewBack") : t("viewFront")}</span>
    </button>
  );
}

/** Long side of the garment bitmaps on the editor canvas (sharp up to ~3× zoom on a desktop). */
const GARMENT_BITMAP_PX = 2800;

/**
 * The drawn garment (front and back, no print) rendered once per shape / colour into bitmaps
 * for the editor canvas: hidden SVGs, serialized and rasterized.
 */
function GarmentImages({ shape, color, onImages }: { shape: ApparelGarmentConfig["shape"]; color: string; onImages: (imgs: Partial<Record<ApparelView, CanvasImageSource>>) => void }) {
  const refs = useRef<Partial<Record<ApparelView, SVGSVGElement | null>>>({});
  const views = apparelViews(shape);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: Partial<Record<ApparelView, CanvasImageSource>> = {};
      for (const v of views) {
        const svg = refs.current[v];
        if (!svg) continue;
        const bmp = await rasterizeSvg(svg, GARMENT_BITMAP_PX);
        if (bmp) out[v] = bmp;
      }
      if (!cancelled) onImages(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shape / colour
  }, [shape, color]);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[9999px] h-px w-px overflow-hidden">
      {views.map((v) => (
        <ApparelMockup
          key={v}
          ref={(el) => {
            refs.current[v] = el;
          }}
          shape={shape}
          view={v}
          color={color}
          prints={[]}
        />
      ))}
    </div>
  );
}

async function rasterizeSvg(svg: SVGSVGElement, longSide: number): Promise<HTMLCanvasElement | null> {
  try {
    const vb = svg.viewBox.baseVal;
    const k: number = longSide / Math.max(vb.width, vb.height);
    const w: number = Math.round(vb.width * k);
    const h: number = Math.round(vb.height * k);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    const url: string = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("garment image"));
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(img, 0, 0, w, h);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

// ─── «Produs» panel ──────────────────────────────────────────────────────

function ApparelProductPanel({ api, product, garment, data, sel, onSel }: { api: StudioEditorApi; product: ShopProduct; garment: ApparelGarmentConfig; data: ApparelPageData; sel: Sel; onSel: (s: Sel) => void }) {
  const t = studioApparelT(api.lang);
  const { href } = useShopLang();
  return (
    <div className="flex flex-col gap-5" data-apparel-product-panel>
      {data.products.length > 1 ? (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold">{t("otherProducts")}</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {data.products.map((p) => {
              const on: boolean = p.slug === product.slug;
              const cls = `flex min-w-0 flex-col items-center gap-1 rounded-xl border-[1.5px] p-1 text-center no-underline ${on ? "border-(--ink) bg-(--soft)" : "border-(--line2) bg-white"}`;
              const inner = (
                <>
                  <ShopImg src={p.image} alt="" className="aspect-square w-full rounded-lg" />
                  <span className="line-clamp-2 text-[11px] leading-tight font-bold text-(--ink)">{p.name}</span>
                </>
              );
              return on ? (
                <div key={p.slug} className={cls} aria-current="true">
                  {inner}
                </div>
              ) : (
                <Link key={p.slug} href={href(studioEditorPath("apparel", { slug: p.slug, fresh: true }))} className={cls} data-apparel-product={p.slug}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <b className="text-base">{product.name}</b>
      )}
      <ApparelColorPicker product={product} sel={sel} onSel={onSel} lang={api.lang} />
      <ApparelFormatsPicker api={api} product={product} garment={garment} data={data} sel={sel} onSel={onSel} />
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base font-extrabold">{t("sizes")}</h2>
        <ApparelSizeGrid product={product} sel={sel} onSel={onSel} lang={api.lang} />
        <ApparelPriceBox api={api} product={product} garment={garment} pricing={data.pricing} sel={sel} />
      </section>
      <p className="m-0 rounded-lg bg-(--soft) px-3 py-2 text-xs text-(--muted)">{t("dtfNote")}</p>
    </div>
  );
}

function ApparelColorPicker({ product, sel, onSel, lang }: { product: ShopProduct; sel: Sel; onSel: (s: Sel) => void; lang: ShopLang }) {
  const t = studioApparelT(lang);
  const colors = product.dtf?.colors ?? [];
  const current = colors.find((c) => c.key === sel.colorKey);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-base font-extrabold">
        {t("color")}
        {current ? <span className="ml-2 text-sm font-semibold text-(--muted)">{current.label}</span> : null}
      </h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("color")}>
        {colors.map((c) => {
          const ok: boolean = colorInStock(c);
          const on: boolean = c.key === sel.colorKey;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              title={c.label}
              disabled={!ok}
              data-apparel-color={c.key}
              onClick={() => {
                const kept = apparelClampSizes(c, sel.sizes);
                onSel({ ...sel, colorKey: c.key, sizes: apparelPieces(kept) > 0 ? kept : apparelStartSizes(c) });
              }}
              className={`h-10 w-10 rounded-full border-[1.5px] disabled:opacity-30 ${on ? "border-(--ink) ring-2 ring-(--ink) ring-offset-2" : "border-(--line2)"}`}
              style={{ background: c.hex }}
            />
          );
        })}
      </div>
    </section>
  );
}

function ApparelFormatsPicker({ api, product, garment, data, sel, onSel, compact = false }: { api: Pick<StudioEditorApi, "doc" | "lang" | "setSurface">; product: ShopProduct; garment: ApparelGarmentConfig; data: ApparelPageData; sel: Sel; onSel: (s: Sel) => void; compact?: boolean }) {
  const t = studioApparelT(api.lang);
  const used = apparelUsedZones(garment, api.doc);
  return (
    <section className="flex flex-col gap-3" data-apparel-formats>
      <h2 className="m-0 text-base font-extrabold">{t("printSize")}</h2>
      {garment.zones.map((z) => {
        const formats: ApparelFormat[] = apparelZoneFormats(product, z);
        const cur = apparelFormatOf(product, z, sel.formats);
        const placement = cur ? apparelPlacement(garment.shape, z.id, cur) : null;
        const printed: boolean = used.includes(z.id);
        return (
          <div key={z.id} className="flex flex-col gap-1.5" data-apparel-zone-formats={z.id}>
            <span className="text-sm font-bold">
              {z.id === "back" ? t("zoneBack") : t("zoneFront")}
              {placement ? <span className="ml-1 font-semibold text-(--muted)">· {t(garment.shape === "body" ? "place_body" : (`place_${placement}` as "place_front"))}</span> : null}
              {!printed ? <span className="ml-1 text-xs font-semibold text-(--muted2)">({t("zoneEmpty")})</span> : null}
            </span>
            {z.formats === "fixed" ? (
              <span className="rounded-lg bg-[#e7f5ec] px-3 py-2 text-sm font-semibold text-[#1f6b3c]">
                {cur ? `${cur.widthCm}×${cur.heightCm} cm · ` : ""}
                {t("includedLong")}
              </span>
            ) : (
              <div className={`grid gap-1.5 ${compact ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2"}`}>
                {formats.map((f) => {
                  const on: boolean = f.presetId === cur?.presetId;
                  const delta: number | null = apparelZoneDelta(product, { ...sel, formats: { ...sel.formats, [z.id]: f.presetId } }, used, z.id, data.pricing);
                  return (
                    <button
                      key={f.presetId ?? "fixed"}
                      type="button"
                      aria-pressed={on}
                      data-apparel-format={`${z.id}:${f.label.split(" ")[0]}`}
                      onClick={() => {
                        onSel({ ...sel, formats: { ...sel.formats, [z.id]: f.presetId } });
                        api.setSurface(z.id);
                      }}
                      className={`flex min-h-12 flex-col items-start justify-center rounded-lg border-[1.5px] px-2 py-1 text-left leading-tight ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"}`}
                    >
                      <span className="text-[13px] font-extrabold">{f.label.split(" ")[0]}</span>
                      <span className={`text-[11px] ${on ? "text-white/75" : "text-(--muted)"}`}>
                        {f.widthCm}×{f.heightCm} cm
                      </span>
                      {delta != null ? <span className={`text-[11px] font-bold ${on ? "text-[#e5c45a]" : "text-[#1f6b3c]"}`}>+{formatPrice(delta, api.lang)}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <span className="text-xs text-(--muted2)">{t("zoneEmptyNote")}</span>
    </section>
  );
}

function ApparelSizeGrid({ product, sel, onSel, lang }: { product: ShopProduct; sel: Sel; onSel: (s: Sel) => void; lang: ShopLang }) {
  const t = studioApparelT(lang);
  const color = product.dtf?.colors.find((c) => c.key === sel.colorKey);
  if (!color) return null;
  if (apparelOneSize(color)) {
    const size: string = color.sizes[0] ?? "—";
    const max: number = apparelSizeMax(color, size);
    return (
      <div className="flex items-center justify-between gap-3" data-apparel-qty>
        <span className="text-sm font-bold">{t("quantity")}</span>
        <QtyStepper label={t("quantity")} value={Math.max(1, sel.sizes[size] ?? 1)} max={Math.max(1, max)} onChange={(n) => onSel({ ...sel, sizes: { [size]: n } })} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5" data-apparel-sizes>
      {color.sizes.map((s) => {
        const max: number = apparelSizeMax(color, s);
        const out: boolean = !inStock(color.sizeStock[s]);
        const q: number = sel.sizes[s] ?? 0;
        const tracked: boolean = s in color.sizeStock;
        const set = (n: number) => {
          const next = { ...sel.sizes };
          const v: number = Math.max(0, Math.min(max, Math.floor(n) || 0));
          if (v > 0) next[s] = v;
          else delete next[s];
          onSel({ ...sel, sizes: next });
        };
        return (
          <div key={s} className={`flex flex-col items-center gap-1 rounded-lg border-[1.5px] p-1.5 ${q > 0 ? "border-(--ink)" : "border-(--line2)"} ${out ? "opacity-45" : ""}`} data-apparel-size={s}>
            <b className="text-sm">{shopSizeLabel(s, lang)}</b>
            <div className="flex items-center gap-0.5">
              <button type="button" disabled={out || q <= 0} onClick={() => set(q - 1)} aria-label={`− ${s}`} className="h-8 w-7 rounded-md text-lg font-bold disabled:opacity-30">
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`${t("quantity")} ${s}`}
                disabled={out}
                value={q > 0 ? String(q) : ""}
                placeholder="0"
                onChange={(e) => set(Number(e.target.value.replace(/\D/g, "").slice(0, 4)))}
                className="h-8 w-9 rounded-md border border-(--line2) text-center text-sm font-bold"
              />
              <button type="button" disabled={out || q >= max} onClick={() => set(q + 1)} aria-label={`+ ${s}`} className="h-8 w-7 rounded-md text-lg font-bold disabled:opacity-30">
                +
              </button>
            </div>
            <span className="text-[10px] text-(--muted2)">{out ? t("soldOut") : tracked && max < 50 ? t("stockLeft", { n: max }) : " "}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Live price: per piece and total from the same engine as the server, the next run step. */
function ApparelPriceBox({ api, product, garment, pricing, sel, server }: { api: Pick<StudioEditorApi, "doc" | "lang">; product: ShopProduct; garment: ApparelGarmentConfig; pricing: ApparelPricing | null; sel: Sel; server?: ReactNode }) {
  const t = studioApparelT(api.lang);
  const { line } = useApparelLine(api, product, garment, sel);
  const est = useMemo(() => apparelEstimate(line, pricing), [line, pricing]);
  const next = useMemo(() => apparelNextStep(line, pricing), [line, pricing]);
  const pieces: number = apparelPieces(sel.sizes);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-(--line) p-3" data-apparel-price>
      {pieces === 0 ? <span className="text-sm font-semibold text-(--err)">{t("noSizes")}</span> : null}
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-(--muted)">{t("pieces", { n: pieces })}</span>
        <span className="font-bold" data-apparel-unit>
          {est ? t("perPiece", { price: formatPrice(est.unit, api.lang) }) : "—"}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <b>{t("total")}</b>
        <b className="text-xl" data-apparel-estimate={est?.total ?? ""}>
          {est ? formatPrice(est.total, api.lang) : "—"}
        </b>
      </div>
      {server}
      {next ? (
        <span className="text-xs font-semibold text-[#1f6b3c]" data-apparel-next>
          {t("nextStep", { n: next.minQty, price: formatPrice(next.unit, api.lang), pct: next.pct })}
        </span>
      ) : null}
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────

function ApparelPrimary({ api, product, garment, pricing, sel, onContinue }: { api: StudioEditorApi; product: ShopProduct; garment: ApparelGarmentConfig; pricing: ApparelPricing | null; sel: Sel; onContinue: () => void }) {
  const st = studioShopT(api.lang);
  const t = studioApparelT(api.lang);
  const q = useApparelQuality(api, garment);
  const { line } = useApparelLine(api, product, garment, sel);
  const est = useMemo(() => apparelEstimate(line, pricing), [line, pricing]);
  const [dialog, setDialog] = useState(false);
  const go = () => {
    if (q.blocks || q.yellow > 0) setDialog(true);
    else onContinue();
  };
  return (
    <>
      <StudioQualityChip q={q} lang={api.lang} onClick={() => setDialog(true)} compact={api.isPhone} />
      {est && !api.isPhone ? (
        <span className="text-sm font-extrabold whitespace-nowrap md:text-base" data-studio-top-price>
          {formatPrice(est.unit, api.lang)}
          <span className="text-xs font-semibold text-(--muted)">{t("perPieceShort")}</span>
        </span>
      ) : null}
      <button
        type="button"
        data-studio-continue
        onClick={go}
        disabled={q.blocks}
        title={q.blocks ? st("qualityBlocked") : undefined}
        className="shop-btn-dark flex h-11 flex-none items-center rounded-[10px] bg-(--ink) px-3 text-sm font-extrabold whitespace-nowrap text-white disabled:opacity-40 md:px-4 md:text-[15px]"
      >
        {api.isPhone ? t("toCart") : t("continue")}
      </button>
      {dialog ? (
        <StudioQualityDialog
          q={q}
          lang={api.lang}
          onPick={(it) => {
            if (it.surfaceId) api.setSurface(it.surfaceId);
            if (it.layerId) api.select(it.layerId);
            setDialog(false);
          }}
          onAccept={() => {
            setDialog(false);
            onContinue();
          }}
          onClose={() => setDialog(false)}
        />
      ) : null}
    </>
  );
}

// ─── Quality ─────────────────────────────────────────────────────────────

/** Opaque-edge verdicts of image bitmaps (by photo id and edit), measured once on a small copy. */
const opaqueCache = new Map<string, boolean>();

function imageOpaque(api: Pick<StudioEditorApi, "renderAssets">, l: StudioImageLayer): boolean | null {
  if (!l.src || l.mask !== "rect") return l.src ? false : null;
  const key = `${l.src.localId ?? l.src.key ?? ""}|${JSON.stringify(l.src.edit ?? {})}`;
  const hit = opaqueCache.get(key);
  if (hit != null) return hit;
  const bmp = api.renderAssets.image(l);
  if (!bmp) return null;
  try {
    const c = document.createElement("canvas");
    const w0 = (bmp as { width: number }).width;
    const h0 = (bmp as { height: number }).height;
    const k: number = Math.min(1, 96 / Math.max(w0, h0));
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const v: boolean = hasOpaqueEdges(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    opaqueCache.set(key, v);
    return v;
  } catch {
    return null;
  }
}

function useApparelQuality(api: StudioEditorApi, garment: ApparelGarmentConfig): StudioQualityState {
  const { doc, specs, productColor, renderAssets, version } = api;
  return useMemo(() => {
    const photoColorAt = studioPhotoSampler(doc, specs, renderAssets);
    const used = apparelUsedZones(garment, doc);
    const items: StudioQualityItem[] = evaluateApparelQuality(doc, specs, {
      productColorHex: productColor,
      ...(photoColorAt ? { photoColorAt } : {}),
      used,
      opaqueImage: (l) => imageOpaque({ renderAssets }, l),
      zoneName: (id) => (id === "back" ? studioApparelT(api.lang)("zoneBack") : studioApparelT(api.lang)("zoneFront")),
    });
    const c = studioQualityCounts(items);
    items.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
    return { items, red: c.red, yellow: c.yellow, blocks: studioQualityBlocks(items) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: photos finished loading
  }, [doc, specs, productColor, renderAssets, version, garment, api.lang]);
}

function ApparelQualityPanel({ api, garment }: { api: StudioEditorApi; garment: ApparelGarmentConfig }) {
  const q = useApparelQuality(api, garment);
  return (
    <StudioQualityList
      q={q}
      lang={api.lang}
      selectedId={api.selectedId}
      onPick={(it) => {
        if (it.surfaceId) api.setSurface(it.surfaceId);
        if (it.layerId) api.select(it.layerId);
      }}
    />
  );
}

// ─── «Elimină fundalul» ──────────────────────────────────────────────────

/** Selected image: remove its flat background (magic wand from the edges), as a new transparent PNG. */
function ApparelBgTool({ api }: { api: StudioEditorApi }) {
  const t = studioApparelT(api.lang);
  const layer = api.doc.surfaces.flatMap((s) => s.layers).find((l): l is StudioImageLayer => l.id === api.selectedId && l.kind === "image");
  const [state, setState] = useState<{ id: string; s: "working" | "done" | "none" | "failed" } | null>(null);
  const [tol, setTol] = useState(40);
  if (!layer?.src) return null;
  const opaque: boolean | null = imageOpaque(api, layer);
  const mine = state?.id === layer.id ? state.s : null;
  if (opaque === false && mine !== "done") return null;
  const run = async () => {
    const src = layer.src!;
    setState({ id: layer.id, s: "working" });
    try {
      if (src.localId) await api.assets.ensure(src.localId);
      const blob: Blob | null = src.localId ? api.assets.original(src.localId) : null;
      if (!blob) throw new Error("no original");
      const bmp = await createImageBitmap(blob);
      const k: number = Math.min(1, 4000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const share: number = removeFlatBackground(img.data, c.width, c.height, tol);
      if (share < 0.01) {
        setState({ id: layer.id, s: "none" });
        return;
      }
      ctx.putImageData(img, 0, 0);
      const png: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
      c.width = 0;
      c.height = 0;
      if (!png) throw new Error("no png");
      const a = await api.assets.addFile(png);
      const cur = api.doc;
      api.setDoc(updateLayer(cur, layer.id, { src: { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: "image/png", ...(src.edit ? { edit: src.edit } : {}) } }));
      setState({ id: layer.id, s: "done" });
    } catch (e) {
      console.error("[studio] background removal failed:", e);
      setState({ id: layer.id, s: "failed" });
    }
  };
  return (
    <section className="flex w-[calc(100vw-132px)] md:w-[340px] flex-col gap-1.5 rounded-xl border border-[#f0d9a8] bg-[#fffaf0] p-2.5 shadow-[0_2px_10px_rgba(20,33,61,0.12)]" data-apparel-bg-tool>
      {mine !== "done" ? <span className="text-xs font-semibold text-[#7a5a12]">{t("removeBgLead")}</span> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={mine === "working"} onClick={() => void run()} data-apparel-remove-bg className="min-h-10 flex-none rounded-lg bg-(--ink) px-3 text-sm font-bold text-white disabled:opacity-50">
          {mine === "working" ? t("removeBgWorking") : t("removeBg")}
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold text-(--muted)">
          {t("tolerance")}
          <input type="range" min={10} max={90} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="min-w-0 flex-1 accent-(--ink)" aria-label={t("tolerance")} />
        </label>
      </div>
      {mine === "done" ? <span className="text-xs font-semibold text-[#1f6b3c]">{t("removeBgDone")}</span> : null}
      {mine === "none" ? <span className="text-xs font-semibold text-(--warn)">{t("removeBgNone")}</span> : null}
      {mine === "failed" ? <span className="text-xs font-semibold text-(--err)">{t("removeBgFailed")}</span> : null}
    </section>
  );
}

// ─── «Verifică produsul» ─────────────────────────────────────────────────

function ApparelVerify({
  api,
  product,
  garment,
  data,
  sel,
  onSel,
  colorHex,
  photos,
  editLine,
  note,
  onBack,
  onAdded,
}: {
  api: StudioEditorApi;
  product: ShopProduct;
  garment: ApparelGarmentConfig;
  data: ApparelPageData;
  sel: Sel;
  onSel: (s: Sel) => void;
  colorHex: string;
  photos: ApparelPhotosState;
  editLine: CartLine | null;
  note: string | null;
  onBack: () => void;
  onAdded: (line: CartLine) => void;
}) {
  const t = studioApparelT(api.lang);
  const st = studioShopT(api.lang);
  const { t: shopT } = useShopLang();
  const q = useApparelQuality(api, garment);
  const { used, line } = useApparelLine(api, product, garment, sel);
  const est = useMemo(() => apparelEstimate(line, data.pricing), [line, data.pricing]);
  const quote = useLiveQuote(line, api.lang);
  const serverTotal: number | null = quote.status === "done" && quote.line.ok ? quote.line.total : null;
  const quoteFailed: boolean = quote.status === "error" || (quote.status === "done" && !quote.line.ok);
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState<StudioCartProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgs = useRef<Partial<Record<ApparelView, SVGSVGElement | null>>>({});
  const views: ApparelView[] = apparelViews(garment.shape).filter((v) => v === "front" || used.includes("back"));
  // The photos with the design (every view: the 3D turn needs the back too).
  const { urls, version } = usePrintUrlsAt(api);
  const prints = mockupPrints(api, product, garment, sel, urls);
  const comp = useApparelComposites(photos, prints, String(version));
  const labels = useMemo(() => buildLineLabels([product]), [product]);
  const canAdd: boolean = !!line && approved && !q.blocks && saving == null && !quoteFailed;

  const add = async () => {
    if (!line || !canAdd) return;
    if (!editLine && refuseIfCartFull()) return;
    setError(null);
    setSaving({ stage: "render", pct: null });
    try {
      const doc: StudioDoc = await uploadStudioPhotos(api, setSaving);
      setSaving({ stage: "render", pct: null });
      const ex = await api.assets.exportAssets(doc);
      if (ex.missing.length) {
        ex.release();
        throw new StudioPhotosMissing();
      }
      // One transparent PNG per printed zone at the format size, 300 dpi (A4 = 2480 × 3543 px).
      const pngs: { zone: ApparelZoneId; blob: Blob }[] = [];
      try {
        for (const zone of used) {
          const spec = api.specs.find((s) => s.id === zone);
          if (!spec) continue;
          const { blob, canvas } = await exportStudioPng(doc, spec, ex.assets);
          canvas.width = 0;
          canvas.height = 0;
          pngs.push({ zone, blob });
        }
      } finally {
        ex.release();
      }
      // The garment pictures (cart image = the first printed view; the back as the second picture).
      const firstView: ApparelView = used[0] === "back" ? "back" : "front";
      // Photo garments: composed again from the final prints (never a stale composite).
      const photoViews = photos.status === "ready" ? await composeApparelViews(photos.views, prints) : {};
      const picture = async (v: ApparelView, side: number): Promise<string | null> =>
        photoViews[v] ? framedJpeg(photoViews[v]!, photos.views[v]!, side) : svgs.current[v] ? await mockupJpeg(svgs.current[v]!, side) : null;
      const image: string | null = await picture(firstView, 240);
      const backThumb: string | null = used.includes("front") && used.includes("back") ? await picture("back", 200) : null;
      const files: Partial<Record<ApparelZoneId, ApparelZoneFile>> = {};
      for (const [i, p] of pngs.entries()) {
        setSaving({ stage: "upload", pct: null });
        const ref = await uploadArtwork(blobToFile(p.blob, `apparel-${product.slug}-${p.zone}-${Date.now()}.png`), (pct) =>
          setSaving({ stage: "upload", pct: Math.round(((i + pct / 100) / pngs.length) * 100) }),
        );
        files[p.zone] = { ...ref, thumb: p.zone === "back" ? backThumb : null };
      }
      setSaving({ stage: "save", pct: null });
      const studio: ShopLineStudio = {
        v: 1,
        docId: doc.id,
        approvedAt: new Date().toISOString(),
        checks: studioApprovalChecks(),
        ...(image && image.length <= 60_000 ? { preview: image } : {}),
      };
      await saveDoc({
        id: doc.id,
        kind: "apparel",
        doc,
        preview: image,
        slug: product.slug,
        variantId: sel.colorKey,
        cartedAt: Date.parse(studio.approvedAt),
        step: "edit",
        apparel: { colorKey: sel.colorKey, formats: sel.formats, sizes: sel.sizes },
      });
      const text = describeQuoteLine(line, labels, shopT);
      const cartLine: CartLine = apparelDesignCartLine({
        id: editLine?.id ?? newLineId(),
        addedAt: editLine?.addedAt ?? Date.now(),
        slug: product.slug,
        quote: line,
        files,
        layout: toLegacyLayout(doc),
        preview: image,
        studio,
        title: text?.title ?? product.name,
        optionsText: text?.optionsText ?? "",
        lastTotal: serverTotal ?? est?.total ?? null,
        fallbackImage: product.image,
      });
      if (!dispatchCart(editLine ? { type: "update", line: cartLine } : { type: "add", line: cartLine })) {
        setSaving(null);
        return;
      }
      api.replaceDoc(doc);
      setSaving(null);
      onAdded(cartLine);
    } catch (e) {
      console.error("[studio] apparel add to cart failed:", e);
      setError(e instanceof StudioPhotosMissing ? t("photosMissing") : t("saveFailed"));
      setSaving(null);
    }
  };

  const serverLine: ReactNode =
    line == null ? null : quote.status === "loading" ? (
      <span className="text-xs text-(--muted2)">{t("priceChecking")}</span>
    ) : quoteFailed ? (
      <span className="text-xs font-semibold text-(--err)">{t("priceFailed")}</span>
    ) : serverTotal != null && est && Math.abs(serverTotal - est.total) > 0.005 ? (
      <span className="text-xs font-semibold" data-apparel-server-total={serverTotal}>
        {t("total")}: {formatPrice(serverTotal, api.lang)}
      </span>
    ) : serverTotal != null ? (
      <span className="hidden" data-apparel-server-total={serverTotal} />
    ) : null;

  return (
    <div className="mx-auto grid w-full max-w-[1180px] items-start gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8" data-apparel-verify>
      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("verifyTitle")}</h1>
          <p className="m-0 text-sm text-(--muted)">{t("verifyLead")}</p>
          {note ? <p className="m-0 text-sm font-semibold text-[#7a6512]">{note}</p> : null}
        </div>
        <div className={`grid gap-3 ${views.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {views.map((v) => (
            <figure key={v} className="m-0 flex flex-col gap-1 overflow-hidden rounded-2xl bg-[#f4f5f7] p-3">
              {photos.views[v] ? (
                <PhotoImg canvas={comp.canvases[v] ?? null} className={`mx-auto block h-auto w-full rounded-xl ${views.length > 1 ? "" : "max-w-[620px]"}`} maxSide={1200} alt={`${product.name} · ${v}`} crop={garmentFrame(photos.views[v]!)} />
              ) : photos.status === "loading" ? (
                <span className="mx-auto block aspect-square w-full max-w-[520px] animate-pulse rounded-xl bg-white/60" />
              ) : (
                <ApparelMockupLive
                  api={api}
                  product={product}
                  garment={garment}
                  sel={sel}
                  colorHex={colorHex}
                  view={v}
                  svgRef={(el) => {
                    svgs.current[v] = el;
                  }}
                  className={`mx-auto block h-auto w-full ${views.length > 1 ? "" : "max-w-[520px]"}`}
                />
              )}
              <figcaption className="text-center text-xs font-bold text-(--muted)">{v === "back" ? t("viewBack") : t("viewFront")}</figcaption>
            </figure>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-(--muted2)">{garment.shape === "cap" ? t("capScale") : t("scaleNote", { size: APPAREL_REFERENCE[garment.shape].size })}</span>
          {(garment.shape === "tshirt" || garment.shape === "polo") && comp.canvases.front && comp.canvases.back ? (
            <ApparelRotateButton front={comp.canvases.front} back={comp.canvases.back} views={photos.views} label={t("rotate3d")} lang={api.lang} />
          ) : null}
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-(--muted)">
          {used.map((z) => {
            const f = apparelFormatOf(product, garment.zones.find((x) => x.id === z)!, sel.formats);
            return f ? (
              <li key={z} data-apparel-file={z}>
                {t("fileOf", { zone: z === "back" ? t("zoneBack") : t("zoneFront"), w: f.widthCm, h: f.heightCm })}
              </li>
            ) : null;
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <b className="text-lg">{product.name}</b>
        <ApparelColorPicker product={product} sel={sel} onSel={onSel} lang={api.lang} />
        <ApparelFormatsPicker api={api} product={product} garment={garment} data={data} sel={sel} onSel={onSel} compact />
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold">{t("sizes")}</h2>
          <ApparelSizeGrid product={product} sel={sel} onSel={onSel} lang={api.lang} />
        </section>
        <ApparelPriceBox api={api} product={product} garment={garment} pricing={data.pricing} sel={sel} server={serverLine} />
        <section className="flex flex-col gap-2">
          {q.items.length ? (
            <StudioQualityList
              q={q}
              lang={api.lang}
              selectedId={null}
              onPick={(it) => {
                // Back to the editor on that zone, the element selected (a sample text opened for typing).
                if (it.surfaceId) api.setSurface(it.surfaceId);
                onBack();
                if (it.layerId) {
                  const id = it.layerId;
                  if (it.code === "dtfSampleText") window.setTimeout(() => api.editText(id), 0);
                  else api.select(id);
                }
              }}
            />
          ) : (
            <>
              <h2 className="m-0 text-base font-extrabold">{t("checklist")}</h2>
              <span className="text-sm font-semibold text-[#1f6b3c]">✓ {t("checkClean")}</span>
            </>
          )}
        </section>
        <label className="flex min-h-11 items-start gap-2 rounded-xl border-[1.5px] border-(--line2) p-3 text-sm font-semibold">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-(--ink)" data-apparel-approve />
          {t("approve")}
        </label>
        {error ? (
          <p role="alert" className="m-0 text-sm font-bold text-(--err)">
            {error}
          </p>
        ) : null}
        {saving ? <StudioCartProgressLine p={saving} t={st} /> : null}
        <button
          type="button"
          onClick={() => void add()}
          disabled={!canAdd}
          data-apparel-add
          className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) px-4 text-base font-extrabold text-white disabled:opacity-40"
        >
          {editLine ? t("saveToCart") : t("addToCart")}
          {serverTotal != null || est ? ` · ${formatPrice(serverTotal ?? est!.total, api.lang)}` : ""}
        </button>
        {!approved && line ? <span className="text-xs text-(--muted2)">{t("approveNeeded")}</span> : null}
        <button type="button" onClick={onBack} disabled={saving != null} className="min-h-11 rounded-xl border-[1.5px] border-(--line2) font-bold">
          {t("backToEdit")}
        </button>
      </div>
    </div>
  );
}
