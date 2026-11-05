"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShopLang } from "@/components/shop/ShopLangProvider";
import type { ShopLang } from "@/lib/storefront/i18n";
import { inStock } from "@/lib/storefront/stock";
import type { ShopProduct, ShopVariant } from "@/lib/storefront/types";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES, StudioAssetStore } from "@/lib/studio/assets";
import {
  addLayer as addLayerTo,
  emptyStudioDoc,
  fitDocToSurfaces,
  layerBounds,
  removeLayer,
  updateLayer,
  type StudioDoc,
  type StudioImageLayer,
  type StudioKind,
  type StudioLayer,
  type StudioSurface,
} from "@/lib/studio/document";
import type { CanvasReserve } from "@/lib/studio/canvasFit";
import { fitAllTextBoxes, loadTextFonts } from "@/lib/studio/fonts";
import { commit as commitHistory, initHistory, redo as redoHistory, replacePresent, resetHistory, undo as undoHistory, type History } from "@/lib/studio/history";
import { studioEditorT, type StudioEditorKey } from "@/lib/studio/i18n.editor";
import type { StudioT } from "@/lib/studio/i18n";
import { newImageLayer, placeFree } from "@/lib/studio/layerFactory";
import { studioInkFor } from "@/lib/studio/quality";
import type { StudioFields } from "@/lib/studio/smartFields";
import type { StudioRenderAssets } from "@/lib/studio/render";
import { printOfItem, studioSurfaces, surfaceBase, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { hasColorChoice, studioColorChoices } from "@/lib/studio/variantColors";
import type { StudioCanvasLabels } from "./StudioCanvas";
import {
  BackgroundToolPanel,
  ElementsToolPanel,
  ImagesToolPanel,
  LayersList,
  PropertiesPanel,
  QrToolPanel,
  TextToolPanel,
  layerName,
  useLayerActions,
  type StudioPanelCtx,
} from "./StudioPanels";
import { Icon, STUDIO_ICONS, StudioLangSwitch } from "./StudioUi";

const StudioCanvas = dynamic(() => import("./StudioCanvas").then((m) => m.StudioCanvas), { ssr: false });

export const STUDIO_TOOLS = ["templates", "text", "images", "elements", "qr", "background", "mydata"] as const;
export type StudioToolId = (typeof STUDIO_TOOLS)[number];

const TOOL_LABEL: Record<StudioToolId, StudioEditorKey> = {
  templates: "toolTemplates",
  text: "toolText",
  images: "toolImages",
  elements: "toolElements",
  qr: "toolQr",
  background: "toolBackground",
  mydata: "toolMyData",
};

/** Shorter names for the phone tool bar (seven tabs on 360–390 px). */
const PHONE_TOOL_LABEL: Partial<Record<StudioToolId, StudioEditorKey>> = {
  background: "toolBackgroundShort",
  mydata: "toolMyDataShort",
};

/** Studio data of a catalog variant (`/api/<kind>-products`): print area and colours. */
export interface StudioCatalogItem {
  id: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview?: boolean;
  bodyColorHex?: string;
  coverColorHex?: string;
  [k: string]: unknown;
}

/** What extensions (templates, «Datele mele», 3D, quality, cart) see and can do. */
export interface StudioEditorApi {
  kind: StudioKind;
  lang: ShopLang;
  t: StudioT<StudioEditorKey>;
  product: ShopProduct;
  variant: ShopVariant | undefined;
  /** Pick another variant (colour) of the product. */
  setVariant: (variantId: string) => void;
  /** Catalog item of the variant (null while loading or unknown). */
  item: StudioCatalogItem | null;
  specs: StudioSurfaceSpec[];
  spec: StudioSurfaceSpec;
  doc: StudioDoc;
  /** Edit with an undo step (`tag` coalesces). */
  setDoc: (doc: StudioDoc, tag?: string) => void;
  /** Replace without an undo step (template applied on start, autosave restore → also `resetHistory`). */
  replaceDoc: (doc: StudioDoc, opts?: { resetHistory?: boolean }) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  assets: StudioAssetStore;
  /** Editor assets (working copies), for previews / 3D textures. */
  renderAssets: StudioRenderAssets;
  /** Bumps on every document / photo / font change: refresh a 3D texture only when it changes. */
  version: number;
  productColor: string | null;
  /** Open a tool panel (null closes the phone sheet). */
  openTool: (tool: StudioToolId | null) => void;
  isPhone: boolean;
  /** Edit line in the cart (`?edit=`), if any. */
  editId: string | null;
}

export interface StudioExtensions {
  /** Panel content per tool (templates and «Datele mele» are placeholders until provided). */
  panels?: Partial<Record<StudioToolId, (api: StudioEditorApi) => ReactNode>>;
  /** Top-bar primary action (price + «Adaugă în coș»). */
  primaryAction?: (api: StudioEditorApi) => ReactNode;
  /** Replaces the «Salvat automat» status in the top bar. */
  status?: (api: StudioEditorApi) => ReactNode;
  /** Floating over the canvas, bottom-right (3D thumbnail). */
  canvasOverlay?: (api: StudioEditorApi) => ReactNode;
  /** Top of the right column on desktop / above the properties on phones (quality list). */
  rightPanelTop?: (api: StudioEditorApi) => ReactNode;
  /** Whole-screen layer above the editor (start screen, verify step); null = editor. */
  screen?: (api: StudioEditorApi) => ReactNode;
  /** First document once the print area is known (template, autosave, cart line). */
  initialDoc?: (ctx: {
    kind: StudioKind;
    specs: StudioSurfaceSpec[];
    editId: string | null;
    assets: StudioAssetStore;
    /** Restore the product colour / size the stored design was made for. */
    setVariant: (variantId: string) => void;
  }) => Promise<StudioDoc | null>;
  /** After every change (autosave). */
  onDocChange?: (doc: StudioDoc, api: StudioEditorApi) => void;
  /** Text colours offered first (brand colours). */
  extraColors?: (api: StudioEditorApi) => readonly string[];
  /** «Datele mele» (QR prefill). */
  myFields?: (api: StudioEditorApi) => StudioFields;
  /** First tool open on desktop (default «text»). */
  initialTool?: StudioToolId;
}

function useMedia(query: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

function itemColor(kind: StudioKind, item: StudioCatalogItem | null, variant: ShopVariant | undefined): string | null {
  // Pens: every SKU carries the same default body colour; the colour the customer picked is the variant's.
  const c = (kind === "pen" ? variant?.hex : null) ?? item?.bodyColorHex ?? item?.coverColorHex ?? variant?.hex ?? null;
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
}

export function StudioApp({
  kind,
  product,
  variantId,
  editId,
  extensions = {},
}: {
  kind: StudioKind;
  product: ShopProduct;
  variantId: string | null;
  editId: string | null;
  extensions?: StudioExtensions;
}) {
  const { lang, href } = useShopLang();
  const t = useMemo(() => studioEditorT(lang), [lang]);
  const isPhone = useMedia("(max-width: 767px)");
  const touch = useMedia("(pointer: coarse)");

  // ─── Floating card over the canvas (3D preview dock): its corner is kept clear ──
  const [overlaySize, setOverlaySize] = useState<{ w: number; h: number } | null>(null);
  const overlayObserver = useRef<ResizeObserver | null>(null);
  const overlayRef = useCallback((el: HTMLDivElement | null) => {
    overlayObserver.current?.disconnect();
    overlayObserver.current = null;
    if (!el) {
      setOverlaySize(null);
      return;
    }
    const measure = () =>
      setOverlaySize((cur) => (cur && cur.w === el.offsetWidth && cur.h === el.offsetHeight ? cur : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      overlayObserver.current = new ResizeObserver(measure);
      overlayObserver.current.observe(el);
    }
  }, []);
  // Card size plus its offset from the canvas edges (top-2 right-2 on the phone, right-4 bottom-4 otherwise).
  const canvasReserve: CanvasReserve | null =
    overlaySize && overlaySize.w > 0 && overlaySize.h > 0
      ? isPhone
        ? { w: overlaySize.w + 8, h: overlaySize.h + 8, corner: "top-right" }
        : { w: overlaySize.w + 16, h: overlaySize.h + 16, corner: "bottom-right" }
      : null;

  // ─── Product + catalog item ────────────────────────────────────────────
  const startVariant: ShopVariant | undefined =
    product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => inStock(v.stock)) ?? product.variants[0];
  const [variantKey, setVariantKey] = useState<string>(startVariant?.id ?? "");
  const restoreVariant = useCallback(
    (id: string) => {
      if (product.variants.some((v) => v.id === id)) setVariantKey(id);
    },
    [product.variants],
  );
  const variant: ShopVariant | undefined = product.variants.find((v) => v.id === variantKey) ?? startVariant;
  const colorChoices = useMemo(() => studioColorChoices(product.variants), [product.variants]);
  const [items, setItems] = useState<StudioCatalogItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/${kind}-products`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: StudioCatalogItem[] }) => !cancelled && setItems(d.items ?? []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [kind]);
  const item: StudioCatalogItem | null = items?.find((i) => i.id === variant?.id) ?? null;
  const printKey = item ? `${item.printWidthCm}x${item.printHeightCm}@${item.printDpi}` : "default";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the print area numbers
  const specs: StudioSurfaceSpec[] = useMemo(() => studioSurfaces(kind, printOfItem(kind, item)), [kind, printKey]);
  const spec: StudioSurfaceSpec = specs[0]!;
  const productColor = itemColor(kind, item, variant);

  // ─── Document + history ────────────────────────────────────────────────
  const [hist, setHist] = useState<History<StudioDoc> | null>(null);
  const doc: StudioDoc | null = hist?.present ?? null;
  const docRef = useRef<StudioDoc | null>(null);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const assets = useRef<StudioAssetStore>(null as unknown as StudioAssetStore);
  if (!assets.current) assets.current = new StudioAssetStore();
  const [assetsTick, setAssetsTick] = useState(0);
  useEffect(() => assets.current.subscribe(() => setAssetsTick((n) => n + 1)), []);
  const [fontsTick, setFontsTick] = useState(0);

  const initStarted = useRef(false);
  const extRef = useRef(extensions);
  useEffect(() => {
    extRef.current = extensions;
  });
  useEffect(() => {
    if (items == null || initStarted.current) return;
    initStarted.current = true;
    const make = async () => {
      const fromExt = extRef.current.initialDoc ? await extRef.current.initialDoc({ kind, specs, editId, assets: assets.current, setVariant: restoreVariant }) : null;
      const d: StudioDoc = fromExt ? fitDocToSurfaces(fromExt, specs.map(surfaceBase)) : emptyStudioDoc(kind, specs.map(surfaceBase));
      setHist(initHistory(d));
    };
    void make();
  }, [items, kind, specs, editId, restoreVariant]);

  // Another variant with another print size: layers follow the area.
  useEffect(() => {
    setHist((h) => {
      if (!h) return h;
      const s = h.present.surfaces[0];
      if (s && s.widthMm === spec.widthMm && s.heightMm === spec.heightMm) return h;
      return replacePresent(h, fitDocToSurfaces(h.present, specs.map(surfaceBase)));
    });
  }, [spec, specs]);

  const setDoc = useCallback((next: StudioDoc, tag?: string) => {
    setHist((h) => (h ? commitHistory(h, { ...next, updatedAt: Date.now() }, tag ?? null) : h));
  }, []);
  const replaceDoc = useCallback((next: StudioDoc, opts?: { resetHistory?: boolean }) => {
    setHist((h) => (opts?.resetHistory || !h ? resetHistory(next) : replacePresent(h, next)));
  }, []);
  const undo = useCallback(() => setHist((h) => (h ? undoHistory(h) : h)), []);
  const redo = useCallback(() => setHist((h) => (h ? redoHistory(h) : h)), []);

  // Autosave and other listeners: after every document change and colour / size pick
  // (the draft keeps the variant it was made for).
  const apiRef = useRef<StudioEditorApi | null>(null);
  useEffect(() => {
    if (doc && apiRef.current) extRef.current.onDocChange?.(doc, apiRef.current);
  }, [doc, variantKey]);

  // Version for extensions: every document / photo / font change.
  useEffect(() => {
    setVersion((v) => v + 1);
  }, [doc, assetsTick, fontsTick]);

  // Fonts: load the faces in use, then redraw and re-measure the text boxes.
  const fontSig: string = doc
    ? doc.surfaces
        .flatMap((s) => s.layers)
        .filter((l) => l.kind === "text")
        .map((l) => (l.kind === "text" ? `${l.fontFamily}|${l.bold}|${l.italic ?? false}|${[...new Set(l.text)].sort().join("")}` : ""))
        .join("§")
    : "";
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const texts = doc.surfaces.flatMap((s) => s.layers).filter((l) => l.kind === "text");
    if (texts.length === 0) return;
    void loadTextFonts(texts).then(() => {
      if (cancelled) return;
      setFontsTick((n) => n + 1);
      setHist((h) => {
        if (!h) return h;
        const fitted = fitAllTextBoxes(h.present, "bound");
        return fitted === h.present ? h : replacePresent(h, fitted);
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when faces / characters change
  }, [fontSig]);

  // ─── Keyboard: undo / redo / delete ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && !typing && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace") && selectedId && doc) {
        e.preventDefault();
        setDoc(removeLayer(doc, selectedId));
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, doc, setDoc]);

  // ─── Tools / phone sheet ───────────────────────────────────────────────
  const [tool, setTool] = useState<StudioToolId | null>(extensions.initialTool ?? "text");
  const [sheet, setSheet] = useState<StudioToolId | "props" | null>(null);
  const openTool = useCallback(
    (tl: StudioToolId | null) => {
      if (isPhone) setSheet(tl);
      else if (tl) setTool(tl);
    },
    [isPhone],
  );
  const [zoom, setZoom] = useState(1);
  const [cropMode, setCropMode] = useState(false);
  useEffect(() => setCropMode(false), [selectedId]);
  const [editTextNonce, setEditTextNonce] = useState(0);

  // ─── Photos ────────────────────────────────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const requestPhoto = useCallback((targetId: string | null) => {
    photoTarget.current = targetId;
    setPhotoError(null);
    fileInput.current?.click();
  }, []);
  const placePhoto = useCallback(
    async (file: File, targetId: string | null) => {
      if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        setPhotoError(t("uploadFailed"));
        return;
      }
      if (file.size > STUDIO_PHOTO_MAX_BYTES) {
        setPhotoError(t("uploadTooBig"));
        return;
      }
      try {
        const a = await assets.current.addFile(file);
        const src = { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime };
        const cur = docRef.current;
        if (!cur) return;
        const target = targetId
          ? cur.surfaces.flatMap((s) => s.layers).find((l): l is StudioImageLayer => l.id === targetId && l.kind === "image")
          : undefined;
        if (target) {
          setDoc(updateLayer(cur, target.id, { src, crop: { zoom: 1, ox: 0, oy: 0 } }));
          setSelectedId(target.id);
        } else {
          const surface = cur.surfaces[0]!;
          const layer = newImageLayer(surface, src);
          setDoc(addLayerTo(cur, surface.id, layer));
          setSelectedId(layer.id);
        }
      } catch {
        setPhotoError(t("uploadFailed"));
      }
    },
    [setDoc, t],
  );

  if (!doc) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
        <p className="m-0 text-(--muted2)" aria-busy="true">
          {t("loading")}
        </p>
      </div>
    );
  }

  const surface: StudioSurface = doc.surfaces.find((s) => s.id === spec.id) ?? doc.surfaces[0]!;
  const selected: StudioLayer | null = surface.layers.find((l) => l.id === selectedId) ?? null;
  const renderAssets = assets.current.editorAssets();

  const api: StudioEditorApi = {
    kind,
    lang,
    t,
    product,
    variant,
    setVariant: setVariantKey,
    item,
    specs,
    spec,
    doc,
    setDoc,
    replaceDoc,
    selectedId,
    select: setSelectedId,
    assets: assets.current,
    renderAssets,
    version,
    productColor,
    openTool,
    isPhone,
    editId,
  };
  apiRef.current = api;

  const ctx: StudioPanelCtx = {
    t,
    doc,
    spec,
    surface,
    selected,
    commit: setDoc,
    addLayer: (raw, opts) => {
      let l = placeFree(raw, surface.layers.filter((x) => !x.hidden).map((x) => layerBounds(x)), surface);
      // A new text takes the ink that reads on what is under it (white on a dark template).
      if (opts?.autoInk && l.kind === "text") l = { ...l, color: studioInkFor(surface, layerBounds(l), productColor) };
      setDoc(addLayerTo(doc, surface.id, l));
      setSelectedId(l.id);
      if (isPhone) setSheet(null);
    },
    select: setSelectedId,
    requestPhoto,
    productColor,
    cropMode,
    setCropMode,
    editTextNonce,
    photoMissing: (id) => assets.current.isMissing(id),
    extraColors: extensions.extraColors?.(api),
    fields: extensions.myFields?.(api),
  };

  const labels: StudioCanvasLabels = {
    bleed: t("bleed", { mm: String(surface.bleedMm).replace(".", lang === "en" ? "." : ",") }),
    safeZone: t("safeZone"),
    handle: t("handle"),
    seam: t("seam"),
    center: t("center"),
    photoPlaceholder: t("photoPlaceholder"),
  };

  const toolPanel = (tl: StudioToolId): ReactNode => {
    const ext = extensions.panels?.[tl];
    if (ext) return ext(api);
    switch (tl) {
      case "text":
        return <TextToolPanel ctx={ctx} />;
      case "images":
        return <ImagesToolPanel ctx={ctx} />;
      case "elements":
        return <ElementsToolPanel ctx={ctx} />;
      case "qr":
        return <QrToolPanel ctx={ctx} />;
      case "background":
        return <BackgroundToolPanel ctx={ctx} />;
      default:
        return (
          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-base font-extrabold">{t(TOOL_LABEL[tl])}</h2>
            <p className="m-0 text-sm text-(--muted2)">{t("soon")}</p>
          </div>
        );
    }
  };

  const canvas = (
    <StudioCanvas
      doc={doc}
      spec={spec}
      assets={renderAssets}
      redrawKey={assetsTick * 1000 + fontsTick}
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id);
        if (isPhone && id == null && sheet === "props") setSheet(null);
      }}
      onChange={setDoc}
      productColor={productColor}
      zoom={zoom}
      onZoomChange={setZoom}
      cropMode={cropMode}
      labels={labels}
      onRequestPhoto={requestPhoto}
      onEditText={(id) => {
        setSelectedId(id);
        if (isPhone) setSheet("props");
        setEditTextNonce((n) => n + 1);
      }}
      onDropFile={(f, target) => void placePhoto(f, target)}
      touch={touch}
      reserve={canvasReserve}
    />
  );

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept={STUDIO_PHOTO_TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-studio-photo-input
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void placePhoto(f, photoTarget.current);
      }}
    />
  );

  const screen = extensions.screen?.(api);
  const backHref = href(`/shop/p/${product.slug}`);
  const canUndo = (hist?.past.length ?? 0) > 0;
  const canRedo = (hist?.future.length ?? 0) > 0;

  const topBar = (
    <header className="flex h-14 flex-none items-center gap-2 border-b border-(--line) px-2 md:h-16 md:gap-3 md:px-4">
      <Link href={backHref} className="flex min-h-11 items-center gap-2 no-underline" aria-label={t("back")}>
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-(--ink) text-[13px] font-extrabold text-[#e5c45a]">A</span>
        <span className="hidden text-base font-extrabold sm:inline">{t("brand")}</span>
      </Link>
      <span className="hidden h-7 w-px bg-(--line) md:block" />
      <button type="button" onClick={undo} disabled={!canUndo} aria-label={t("undo")} title={t("undo")} className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-(--soft) disabled:text-[#9aa6ba] md:h-10 md:w-10">
        <Icon d={STUDIO_ICONS.undo} />
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-label={t("redo")} title={t("redo")} className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-(--soft) disabled:text-[#9aa6ba] md:h-10 md:w-10">
        <Icon d={STUDIO_ICONS.redo} />
      </button>
      <span className="hidden text-[13px] text-(--muted2) lg:inline">{extensions.status ? extensions.status(api) : t("autosaved")}</span>
      <span className="flex-1" />
      <StudioLangSwitch />
      <span className="hidden max-w-[220px] truncate text-sm font-bold lg:inline">{product.name}</span>
      {hasColorChoice(colorChoices) ? (
        <div className="hidden items-center gap-1 md:flex lg:gap-1.5" role="group" aria-label={t("productColor")}>
          {colorChoices.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={c.label}
              title={c.label}
              aria-pressed={c.key === variant?.id}
              disabled={c.disabled}
              onClick={() => setVariantKey(c.key)}
              className={`h-6 w-6 rounded-full border-[1.5px] disabled:opacity-30 lg:h-7 lg:w-7 ${c.key === variant?.id ? "border-(--ink) ring-2 ring-(--ink) ring-offset-1" : "border-(--line2)"}`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      ) : null}
      <div className="hidden items-center gap-1 rounded-[10px] bg-(--soft) p-0.5 md:flex">
        <button type="button" aria-label={t("zoomOut")} title={t("zoomOut")} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} className="h-9 w-9 text-lg font-bold">
          −
        </button>
        <button type="button" onClick={() => setZoom(1)} title={t("zoomFit")} className="min-w-11 text-sm font-bold">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label={t("zoomIn")} title={t("zoomIn")} onClick={() => setZoom((z) => Math.min(6, z * 1.25))} className="h-9 w-9 text-lg font-bold">
          +
        </button>
      </div>
      {extensions.primaryAction?.(api)}
    </header>
  );

  const errorNote = photoError ? (
    <p role="alert" className="m-0 bg-(--err-soft) px-4 py-2 text-sm font-bold text-(--err)">
      {photoError}
    </p>
  ) : null;

  // ─── Phone ─────────────────────────────────────────────────────────────
  if (isPhone) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white" data-studio-root>
        {fileField}
        {topBar}
        {errorNote}
        {screen ? (
          <div className="min-h-0 flex-1 overflow-y-auto">{screen}</div>
        ) : (
          <>
            <div className="relative min-h-[180px] flex-1 bg-[#eef1f5]">
              {canvas}
              {extensions.canvasOverlay ? (
                <div ref={overlayRef} className="pointer-events-none absolute top-2 right-2 [&>*]:pointer-events-auto">
                  {extensions.canvasOverlay(api)}
                </div>
              ) : null}
              {!selected && surface.layers.length > 0 ? (
                <p className="pointer-events-none absolute bottom-2 left-1/2 m-0 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold whitespace-nowrap text-(--muted2)">{t("pinchHint")}</p>
              ) : null}
            </div>
            {sheet ? (
              <section className="flex h-[45vh] flex-none flex-col border-t border-(--line) bg-white shadow-[0_-10px_28px_rgba(20,33,61,0.12)]" aria-label={sheet === "props" ? t("properties") : t(TOOL_LABEL[sheet])}>
                <div className="flex flex-none items-center justify-between px-4 pt-2">
                  <span className="mx-auto h-1.5 w-10 rounded-full bg-(--line2)" />
                  <button type="button" onClick={() => setSheet(null)} aria-label={t("close")} className="absolute right-2 flex h-11 w-11 items-center justify-center">
                    <Icon d={STUDIO_ICONS.close} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
                  {sheet === "props" ? (
                    <div className="flex flex-col gap-4">
                      {extensions.rightPanelTop?.(api)}
                      <PropertiesPanel ctx={ctx} />
                      <LayersList ctx={ctx} />
                    </div>
                  ) : (
                    toolPanel(sheet)
                  )}
                </div>
              </section>
            ) : null}
            {selected && sheet !== "props" ? <PhoneContextStrip ctx={ctx} onEdit={() => setSheet("props")} /> : null}
            <nav aria-label={t("tools")} className="flex flex-none items-stretch justify-between border-t border-(--line) bg-white px-1 pb-[env(safe-area-inset-bottom)]">
              {STUDIO_TOOLS.map((tl) => (
                <button
                  key={tl}
                  type="button"
                  onClick={() => setSheet((s) => (s === tl ? null : tl))}
                  aria-pressed={sheet === tl}
                  className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold ${sheet === tl ? "bg-(--ink) text-white" : tl === "mydata" ? "text-[#7a6512]" : "text-(--ink)"}`}
                >
                  <Icon d={STUDIO_ICONS[tl]} size={20} />
                  <span className="max-w-full truncate tracking-tight">{t(PHONE_TOOL_LABEL[tl] ?? TOOL_LABEL[tl])}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    );
  }

  // ─── Desktop / tablet ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white" data-studio-root>
      {fileField}
      {topBar}
      {errorNote}
      {screen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{screen}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <nav aria-label={t("tools")} className="flex w-[84px] flex-none flex-col gap-1 border-r border-(--line) px-1.5 py-2.5">
            {STUDIO_TOOLS.map((tl) => (
              <button
                key={tl}
                type="button"
                onClick={() => setTool((cur) => (cur === tl ? null : tl))}
                aria-pressed={tool === tl}
                className={`flex min-h-[60px] w-[72px] flex-col items-center justify-center gap-1 rounded-xl ${
                  tool === tl ? "bg-(--ink) text-white" : tl === "mydata" ? "bg-[#faf3dc] text-[#7a6512]" : "text-(--ink)"
                }`}
              >
                <Icon d={STUDIO_ICONS[tl]} size={22} />
                <span className="text-[11px] font-bold">{t(TOOL_LABEL[tl])}</span>
              </button>
            ))}
          </nav>
          {tool ? (
            <section aria-label={t(TOOL_LABEL[tool])} className="w-[260px] flex-none overflow-y-auto border-r border-(--line) p-4">
              {toolPanel(tool)}
            </section>
          ) : null}
          <main className="relative min-w-0 flex-1 bg-[#eef1f5]">
            {canvas}
            {extensions.canvasOverlay ? (
              <div ref={overlayRef} className="pointer-events-none absolute right-4 bottom-4 [&>*]:pointer-events-auto">
                {extensions.canvasOverlay(api)}
              </div>
            ) : null}
          </main>
          <aside aria-label={t("properties")} className="hidden w-[300px] flex-none flex-col gap-4 overflow-y-auto border-l border-(--line) p-4 lg:flex">
            {extensions.rightPanelTop?.(api)}
            <PropertiesPanel ctx={ctx} />
            <div className="border-t border-(--line) pt-3">
              <LayersList ctx={ctx} />
            </div>
          </aside>
          {selected ? (
            <div className="absolute right-4 bottom-4 z-10 w-[300px] rounded-xl border border-(--line) bg-white p-3 shadow-lg lg:hidden" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <PropertiesPanel ctx={ctx} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Phone: quick actions for the selected layer, above the tool bar. */
function PhoneContextStrip({ ctx, onEdit }: { ctx: StudioPanelCtx; onEdit: () => void }) {
  const { t, selected } = ctx;
  const a = useLayerActions(ctx);
  if (!selected) return null;
  const btn = "flex h-12 min-w-12 items-center justify-center rounded-[10px] text-white";
  return (
    <div role="toolbar" aria-label={layerName(t, selected)} className="flex flex-none items-center gap-1 overflow-x-auto bg-(--ink) px-2 py-1">
      <button type="button" onClick={onEdit} className={`${btn} gap-1.5 px-3 text-sm font-bold`}>
        <Icon d={STUDIO_ICONS.edit} size={18} />
        {t("edit")}
      </button>
      <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold text-white/70">{layerName(t, selected)}</span>
      <button type="button" aria-label={t("bringForward")} onClick={() => a.forward(selected.id)} className={btn}>
        <Icon d={STUDIO_ICONS.up} size={18} />
      </button>
      <button type="button" aria-label={t("duplicate")} onClick={() => a.duplicate(selected.id)} className={btn}>
        <Icon d={STUDIO_ICONS.duplicate} size={18} />
      </button>
      <button type="button" aria-label={selected.locked ? t("unlock") : t("lock")} onClick={() => a.toggleLock(selected)} className={btn}>
        <Icon d={selected.locked ? STUDIO_ICONS.lock : STUDIO_ICONS.unlock} size={18} />
      </button>
      <button type="button" aria-label={t("delete")} onClick={() => a.remove(selected.id)} className={`${btn} text-[#ff9d92]`}>
        <Icon d={STUDIO_ICONS.trash} size={18} />
      </button>
    </div>
  );
}
