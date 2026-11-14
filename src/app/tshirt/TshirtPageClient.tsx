"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle,
  Crosshair,
  Eye,
  ImagePlus,
  Loader2,
  Shirt,
  Trash2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, TEXT_COLOR_OPTIONS, fontOptionById } from "@/lib/editor/editorPalette";
import {
  TSHIRT_DPI_WARN,
  TSHIRT_MIN_DESIGN_CM,
  TSHIRT_SIDES,
  TSHIRT_REFERENCE_SIZE,
  anchorTopCm,
  garmentCm,
  neckDropCm,
  placementCm,
  sizePrintArea,
  sizeRatio,
  TSHIRT_SIZES,
  TSHIRT_DEFAULT_PREVIEW_SIZE,
  TSHIRT_SLEEVE_CM,
  isSleeve,
  printedDpi,
  type TshirtSide,
} from "@/lib/tshirt/tshirtRules";
import {
  ceilCm,
  layersForSize,
  layerBoxCm,
  textLines,
  type ImageLayer,
  type Layer,
  type Measure,
  type TextLayer,
} from "@/lib/tshirt/tshirtLayers";
import { renderPrintPng } from "@/lib/tshirt/renderSide";
import { ClarityPanel } from "./_components/ClarityPanel";
import { OrderConsentCheckbox } from "@/components/upload/OrderConsentCheckbox";
import { orderConsentPayload } from "@/lib/orderConsent";
import {
  TSHIRT_EDGE_MARGIN_CM,
  TSHIRT_MAX_DESIGN,
  layerInRegion,
  layersBounds,
  placeLayer,
  regionAnchor,
  regionForSizes,
  layersForOrderSize,
  shrinkToMaxSize,
  withinMaxSize,
  type PrintRegion,
} from "@/lib/tshirt/tshirtRegion";
import { loadApparelPhotoView, type ApparelPhotoView } from "@/components/shop/studio/apparelPhoto";
import { PHOTO_VIEWS, apparelPhotoAsset, supplierColourCode, type PhotoView } from "@/lib/studio/photoMockup";
import { SLEEVE_PRINT_MIDDLE, photoSizeFactor, photoViewOf, stageGeometry } from "@/lib/tshirt/tshirtPhoto";
import { canvasPng, composeTshirtView, cropCanvas } from "./_components/tshirtPhotoCompose";
import type { Print3D } from "./_components/TshirtModel3D";
import { modelScaleFor } from "@/lib/tshirt/tshirt3d";
import { renderAreaCanvas } from "@/lib/tshirt/renderSide";
import dynamic from "next/dynamic";

/** The 3D T-shirt with the designs painted on its panels, loaded only for Previzualizare. */
const TshirtModel3D = dynamic(() => import("./_components/TshirtModel3D").then((m) => m.TshirtModel3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ),
});
import { GarmentZoneSchema } from "@/app/admin/_components/dtf/GarmentZoneSchema";
import {
  moveLayersToBox,
  TSHIRT_BACK_PLACEMENTS,
  TSHIRT_FRONT_PLACEMENTS,
  placementBox,
  sizeForBox,
  type TshirtPlacement,
} from "@/lib/tshirt/tshirtPlacements";

import { lightness } from "./_components/TshirtShape";

type Garment = {
  id: string;
  stockItemId: string;
  names: { ro: string; ru: string; en: string };
  colorName: string;
  colorHex: string | null;
  sizes: { size: string; inStock: number }[];
  fromPriceMdl: number | null;
};

type Quote = {
  quantity: number;
  totalMdl: number;
  perPieceMdl: number;
  zones: { placement: string; presetLabel: string }[];
};

const EMPTY_LAYERS: Record<TshirtSide, Layer[]> = { front: [], back: [], sleeve_left: [], sleeve_right: [] };

async function uploadBlob(blob: Blob, name: string): Promise<string> {
  const type = blob.type || "application/octet-stream";
  const urlRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // the size is required for clients who aren't logged in (the upload link is signed with it)
    body: JSON.stringify({ fileName: name, contentType: type, fileSize: blob.size }),
  });
  if (!urlRes.ok) throw new Error("upload_url");
  const { uploadUrl, fileKey } = (await urlRes.json()) as { uploadUrl: string; fileKey: string };
  const up = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: blob });
  if (!up.ok) throw new Error("upload_put");
  return fileKey;
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export default function TshirtPageClient({
  initial = null,
}: {
  /** Catalog loaded with the page (null: fetched here). */
  initial?: { garments: Garment[]; sleeve: { maxCm: number; priceMdl: number } } | null;
}) {
  const { t, locale } = useLanguageStore();
  const s = t.tshirt;

  const [garments, setGarments] = useState<Garment[] | null>(initial?.garments ?? null);
  const [modelId, setModelId] = useState<string | null>(initial?.garments[0]?.stockItemId ?? null);
  const [garmentId, setGarmentId] = useState<string | null>(initial?.garments[0]?.id ?? null);
  const [side, setSide] = useState<TshirtSide>("front");
  const [layers, setLayers] = useState<Record<TshirtSide, Layer[]>>(EMPTY_LAYERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** The ready placement picked per side (the design was fitted into its box). */
  const [placement, setPlacement] = useState<Partial<Record<TshirtSide, TshirtPlacement>>>({});
  const [previewShots, setPreviewShots] = useState<Partial<Record<PhotoView, string>>>({});
  /** Previzualizare: the 3D model (default) or one photo view on the gold mannequin. */
  const [previewMode, setPreviewMode] = useState<"3d" | PhotoView>("3d");
  const [prints3d, setPrints3d] = useState<Partial<Record<TshirtSide, Print3D>> | null>(null);
  const [sleeve, setSleeve] = useState<{ maxCm: number; priceMdl: number }>(initial?.sleeve ?? { maxCm: TSHIRT_SLEEVE_CM, priceMdl: 50 });
  // Previzualizare's 3D shirt (three.js + the 6.8 MB model) starts loading in the background once
  // the editor is up, so opening Previzualizare doesn't wait for it.
  useEffect(() => {
    const t = window.setTimeout(() => void import("./_components/TshirtModel3D"), 1500);
    return () => window.clearTimeout(t);
  }, []);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [gdpr, setGdpr] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<{ orderNumber: number; publicToken: string } | null>(null);
  const [fontTick, setFontTick] = useState(0);
  const [stageW, setStageW] = useState(400);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);

  // ── Catalog ──
  useEffect(() => {
    if (initial) return;
    fetch("/api/tshirt/catalog")
      .then((r) => r.json())
      .then((d: { garments: Garment[]; sleeve?: { maxCm: number; priceMdl: number } }) => {
        setGarments(d.garments ?? []);
        if (d.sleeve) setSleeve(d.sleeve);
        const first = d.garments?.[0];
        if (first) {
          setModelId(first.stockItemId);
          setGarmentId(first.id);
        }
      })
      .catch(() => setGarments([]));
  }, []);

  useEffect(() => {
    document.fonts?.ready.then(() => setFontTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [garments]);

  const models = useMemo(() => {
    const m = new Map<string, Garment[]>();
    for (const g of garments ?? []) m.set(g.stockItemId, [...(m.get(g.stockItemId) ?? []), g]);
    return [...m.entries()];
  }, [garments]);
  const colors = models.find(([id]) => id === modelId)?.[1] ?? [];
  const garment = (garments ?? []).find((g) => g.id === garmentId) ?? null;
  const shirtColor = garment?.colorHex ?? "#ffffff";
  const darkShirt = lightness(shirtColor) < 110;
  const nameOf = (g: Garment) => g.names[locale as "ro" | "ru" | "en"] || g.names.ro;
  const sideName = (sd: TshirtSide) => ({ front: s.front, back: s.back, sleeve_left: s.sleeveLeft, sleeve_right: s.sleeveRight })[sd];

  // ── Real garment photos (the same as the ANVI Studio on anvi.md) ──
  // Loaded per view when it is needed (the shown side first; the rest for Previzualizare), each
  // prepared once (cached by colour). White / black use Roly's own photo, not a recoloured one.
  const photoColour = garment ? photoColourOf(garment.id, shirtColor) : null;
  const colourId = photoColour ? `${photoColour.key}|${photoColour.hex}` : "";
  const [photoViews, setPhotoViews] = useState<{ id: string; views: Partial<Record<PhotoView, ApparelPhotoView>>; failed: boolean }>({ id: "", views: {}, failed: false });
  // The stage shows Roly's photo file itself (on white, decoded by the browser: instant). Only a
  // colour without its own photo needs the prepared (recoloured) one on the stage.
  const supplierCode: string | null = photoColour ? supplierColourCode(photoColour.key, PHOTO_VIEWS["tshirt-front"]!.colours) : null;
  const stagePhotoUrl = (v: PhotoView): string | null => (supplierCode ? apparelPhotoAsset(PHOTO_VIEWS[`tshirt-${v}`]!, supplierCode) : null);
  const neededViews: PhotoView[] = useMemo(() => {
    const want = new Set<PhotoView>(supplierCode ? [] : [photoViewOf(side)]);

    return [...want];
  }, [side, previewOnly, layers, supplierCode]);
  const neededKey = neededViews.join(",");
  useEffect(() => {
    if (!photoColour) return;
    let alive = true;
    for (const v of neededViews) {
      void loadApparelPhotoView("tshirt", v, photoColour).then((pv) => {
        if (!alive) return;
        setPhotoViews((prev) => {
          const base = prev.id === colourId ? prev : { id: colourId, views: {}, failed: false };
          return pv ? { ...base, views: { ...base.views, [v]: pv } } : { ...base, failed: true };
        });
      });
    }
    return () => {
      alive = false;
    };
    // colourId / neededKey carry the inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colourId, neededKey]);
  const views: Partial<Record<PhotoView, ApparelPhotoView>> = useMemo(
    () => (photoViews.id === colourId ? photoViews.views : {}),
    [photoViews, colourId],
  );
  const photos = {
    views,
    status: views[photoViewOf(side)] || stagePhotoUrl(photoViewOf(side)) ? "ready" : photoViews.id === colourId && photoViews.failed ? "none" : "loading",
  };
  // Previzualizare / sending need the prepared photos: get the front ready while the client designs.
  useEffect(() => {
    if (!photoColour || !supplierCode) return;
    const h = window.setTimeout(() => void loadApparelPhotoView("tshirt", "front", photoColour), 2500);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colourId]);

  // ── Fonts for canvas (next/font hashes the family names) ──
  const resolveFont = useCallback((fontId: string): string => {
    const opt = fontOptionById(fontId);
    const varName = opt.cssVar.slice("var(".length, -1);
    const el = rootRef.current ?? document.documentElement;
    const v = getComputedStyle(el).getPropertyValue(varName).trim();
    return v || `'${opt.family}', ${opt.fallback}`;
  }, []);

  const measure: Measure = useCallback(
    (line, fontPx, layer) => {
      if (!measureCtx.current) measureCtx.current = document.createElement("canvas").getContext("2d");
      const ctx = measureCtx.current;
      if (!ctx) return line.length * fontPx * 0.55;
      ctx.font = `${layer.bold ? 700 : 400} ${fontPx}px ${resolveFont(layer.fontId)}`;
      return ctx.measureText(line).width;
    },
    // fontTick: re-measure once web fonts have loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolveFont, fontTick],
  );

  // The print area follows the chosen sizes (the smallest one decides).
  const chosenSizes = useMemo(() => Object.keys(qty).filter((k2) => (qty[k2] ?? 0) > 0), [qty]);
  // The design is made on M (100 %); every ordered size gets it scaled (`sizeScale`).
  const designLocked = false;
  // The drawing is scaled to one size: the smallest chosen by default (where the print looks biggest).
  const sizeRank = (sz: string) => {
    const i = (TSHIRT_SIZES as readonly string[]).indexOf(sz.toUpperCase());
    return i < 0 ? 99 : i;
  };
  const sortedChosen = useMemo(() => [...chosenSizes].sort((a, b) => sizeRank(a) - sizeRank(b)), [chosenSizes]);
  // Like Canva: the client always designs on M (and sees M in Previzualizare); when the order is sent,
  // every ordered size gets its own file, resized for that shirt (`layersForOrderSize`).
  const editSize = TSHIRT_REFERENCE_SIZE;
  const kEdit = sizeRatio(editSize);
  const previewSize = editSize;
  /** Where a design may sit (M's cm) and how big it may be so that it fits every ordered size. */
  const sleeveCm = sleeve.maxCm;
  const regions = useMemo(
    () =>
      Object.fromEntries(TSHIRT_SIDES.map((sd) => [sd, regionForSizes(sd, chosenSizes, sleeveCm)])) as Record<TshirtSide, PrintRegion>,
    [chosenSizes, sleeveCm],
  );
  /** M's cm → the edited size's cm (where it is drawn). */
  const toEdit = useCallback(
    (sd: TshirtSide, x: number, y: number): [number, number] => {
      const from = anchorTopCm(sd, TSHIRT_REFERENCE_SIZE);
      const to = anchorTopCm(sd, editSize);
      return [x * kEdit, to + (y - from) * kEdit];
    },
    [editSize, kEdit],
  );
  /** A ready placement's box for this order (the middle prints take the largest print of the ordered sizes). */
  const boxOf = (p: TshirtPlacement) => placementBox(p, sleeveCm, regions[placementBox(p, sleeveCm).side].max, TSHIRT_REFERENCE_SIZE);
  // ── Stage geometry: the photo of the shown size, px per cm ──
  // One scale for the order (its biggest size fits): a smaller size is drawn smaller, the print stays the same.
  // One scale for the whole order (its biggest size fills the stage): a smaller size is drawn smaller.
  const geo = stageGeometry(side, editSize, stageW, sleeveCm, editSize);
  const pxPerCm = geo.pxPerCm;
  const sideLayers = layers[side];
  /** Every side's design as printed on the shown size (Previzualizare's close-up). */
  const layersOnPreview = useMemo(
    () => Object.fromEntries(TSHIRT_SIDES.map((sd) => [sd, layersForSize(layers[sd], sd, editSize)])) as Record<TshirtSide, Layer[]>,
    [layers, editSize],
  );
  /** What each ordered size will print for this side (resized; shrunk where that size can't take it). */
  const orderPrints = useMemo(
    () =>
      sortedChosen.map((sz) => {
        const r = layersForOrderSize(sideLayers, side, sz, measure, sleeveCm);
        return { size: sz, bounds: layersBounds(r.layers, measure), shrunk: r.shrunk };
      }),
    [sortedChosen, sideLayers, side, measure, sleeveCm],
  );
  /** The side's design as drawn on the edited size. */
  const shownLayers = useMemo(() => layersForSize(sideLayers, side, editSize), [sideLayers, side, editSize]);
  const selected = sideLayers.find((l) => l.id === selectedId) ?? null;

  // Every change goes through placeLayer: a layer can't cross the 3 cm edge or grow past 30 × 42.
  const [maxHit, setMaxHit] = useState(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flagMax = (hit: boolean) => {
    if (!hit) return;
    setMaxHit(true);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => setMaxHit(false), 1800);
  };
  const updateLayer = (id: string, patch: Partial<TextLayer> | Partial<ImageLayer>) => {
    const list = layers[side];
    const cur = list.find((l) => l.id === id);
    if (!cur) return;
    const r = placeLayer(cur, { ...cur, ...patch } as Layer, list.filter((l) => l.id !== id), side, regions[side], measure);
    flagMax(r.hitMax);
    setLayers((prev) => ({ ...prev, [side]: prev[side].map((l) => (l.id === id ? r.layer : l)) }));
  };
  const pushLayer = (layer: Layer) => {
    const r = placeLayer(null, layer, layers[side], side, regions[side], measure);
    flagMax(r.hitMax);
    setLayers((prev) => ({ ...prev, [side]: [...prev[side], r.layer] }));
  };

  // Never more than 30 × 42 (rounded to 0.1 cm, as priced and printed).
  useEffect(() => {
    const fixed = Object.fromEntries(
      TSHIRT_SIDES.map((sd) => [sd, shrinkToMaxSize(layers[sd], measure, regions[sd].max)]),
    ) as Record<TshirtSide, Layer[]>;
    if (TSHIRT_SIDES.some((sd) => fixed[sd] !== layers[sd])) setLayers(fixed);
  }, [layers, measure, regions]);

  // A smaller size ordered → a smaller shirt: pull every layer back inside.
  const regionsKey = TSHIRT_REFERENCE_SIZE;
  useEffect(() => {
    setLayers((prev) => {
      const fit = (sd: TshirtSide) => {
        const out: Layer[] = [];
        for (const l of prev[sd]) out.push(placeLayer(null, l, out, sd, regions[sd], measure).layer);
        return out;
      };
      return Object.fromEntries(TSHIRT_SIDES.map((sd) => [sd, fit(sd)])) as Record<TshirtSide, Layer[]>;
    });
    // regionsKey carries the regions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionsKey, sleeveCm]);

  const addText = () => {
    const anchor = regionAnchor(side, regions[side]);
    const pick = placement[side];
    let layer: TextLayer = {
      id: nanoid(8),
      kind: "text",
      cx: anchor[0],
      cy: isSleeve(side) ? anchor[1] : anchor[1] - 8,
      rotation: 0,
      text: s.newText,
      fontId: FONT_OPTIONS[0]!.id,
      color: darkShirt ? "#FFFFFF" : "#000000",
      sizeCm: isSleeve(side) ? 2 : 4,
      bold: true,
    };
    if (pick) {
      // In the picked place: a logo in the middle of its square, a front / back print at the top of its area.
      const box = boxOf(pick);
      const logo = box.w <= 10.01 && box.h <= 10.01;
      const size = Math.min(logo || isSleeve(side) ? 3 : 4, sizeForBox(layer, box, measure));
      layer = { ...layer, sizeCm: size, cx: box.cx, cy: logo ? box.cy : box.cy - box.h / 2 + size * 0.6 + 0.5 };
    }
    pushLayer(layer);
    setSelectedId(layer.id);
    setPreviewOnly(false);
  };

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const src = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("img"));
        img.src = src;
      });
    } catch {
      URL.revokeObjectURL(src);
      setSendError(s.imageError);
      return;
    }
    // SVG without its own size: take the proportions from its viewBox.
    let natW = img.naturalWidth;
    let natH = img.naturalHeight;
    if (isSvg && (!natW || !natH)) {
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(await file.text());
      natW = vb ? Number(vb[1]) : 1000;
      natH = vb ? Number(vb[2]) : 1000;
    }
    if (!natW || !natH) {
      URL.revokeObjectURL(src);
      setSendError(s.imageError);
      return;
    }
    // Start as large as the image allows at good quality, within the print area.
    const sharpCm = isSvg ? 20 : (natW / TSHIRT_DPI_WARN) * 2.54;
    const onSleeve = isSleeve(side);
    const maxW = onSleeve ? regions[side].max.maxWidthCm * 0.8 : 20;
    const maxH = onSleeve ? regions[side].max.maxHeightCm * 0.8 : 28;
    let widthCm = Math.min(maxW, TSHIRT_MAX_DESIGN.maxWidthCm, Math.max(onSleeve ? 2 : 5, sharpCm));
    const hFor = (w: number) => (w * natH) / natW;
    if (hFor(widthCm) > maxH) widthCm = (maxH * natW) / natH;
    const anchor = regionAnchor(side, regions[side]);
    const pick = placement[side];
    const pickBox = pick ? boxOf(pick) : null;
    const pickLogo = !!pickBox && pickBox.w <= 10.01 && pickBox.h <= 10.01;
    if (pickBox) widthCm = Math.min(pickLogo ? pickBox.w : widthCm, pickBox.w, (pickBox.h * natW) / natH) * 0.98;
    const layer: ImageLayer = {
      id: nanoid(8),
      kind: "image",
      cx: pickBox ? pickBox.cx : anchor[0],
      cy: pickBox ? (pickLogo ? pickBox.cy : pickBox.cy - pickBox.h / 2 + hFor(widthCm) / 2) : onSleeve ? anchor[1] : anchor[1] - 10 + hFor(widthCm) / 2,
      rotation: 0,
      src,
      fileName: file.name,
      naturalW: natW,
      naturalH: natH,
      widthCm: Math.round(widthCm * 10) / 10,
      vector: isSvg || undefined,
    };
    pushLayer(layer);
    setSelectedId(layer.id);
    setPreviewOnly(false);
    setSendError(null);
  };

  /** A ready placement: go to its side and fit the design there (a later text / image goes there too). */
  const [placeTooBig, setPlaceTooBig] = useState<TshirtPlacement | null>(null);
  const [placeShrunk, setPlaceShrunk] = useState<TshirtPlacement | null>(null);
  const pickPlacement = (p: TshirtPlacement) => {
    const box = boxOf(p);
    const sd = box.side;
    setSide(sd);
    setSelectedId(null);
    setPreviewOnly(false);
    setPlacement((prev) => ({ ...prev, [sd]: p }));
    if (layers[sd].length === 0) return;
    // The whole design moves there as one group (texts and pictures keep their places to each other).
    // The middle prints keep its size; a chest logo shrinks a bigger design to its 10 × 10 square.
    const moved = moveLayersToBox(layers[sd], box, measure);
    setPlaceTooBig(moved.tooBig ? p : null);
    setPlaceShrunk(moved.shrunk ? p : null);
    setLayers((prev) => ({ ...prev, [sd]: moved.layers }));
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => ({ ...prev, [side]: prev[side].filter((l) => l.id !== id) }));
    setSelectedId(null);
  };
  const moveLayer = (id: string, dir: 1 | -1) =>
    setLayers((prev) => {
      const list = [...prev[side]];
      const i = list.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j]!, list[i]!];
      return { ...prev, [side]: list };
    });

  // ── Drag & resize ──
  const drag = useRef<
    | { mode: "move"; id: string; x: number; y: number; cx: number; cy: number }
    | { mode: "resize"; id: string; ox: number; oy: number; d0: number; size0: number; kind: Layer["kind"] }
    | null
  >(null);

  /** Keep receiving moves outside the element; harmless if the browser refuses. */
  const capturePointer = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // e.g. a synthetic pointer: the stage's own move handler still drives the drag
    }
  };

  const onLayerDown = (e: React.PointerEvent, l: Layer) => {
    if (previewOnly) return;
    e.stopPropagation();
    setSelectedId(l.id);
    capturePointer(e);
    setDragging(true);
    const m = sideLayers.find((x) => x.id === l.id) ?? l;
    drag.current = { mode: "move", id: l.id, x: e.clientX, y: e.clientY, cx: m.cx, cy: m.cy };
  };
  const onHandleDown = (e: React.PointerEvent, l: Layer) => {
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).parentElement!;
    const r = el.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    capturePointer(e);
    setDragging(true);
    drag.current = {
      mode: "resize",
      id: l.id,
      ox,
      oy,
      d0: Math.hypot(e.clientX - ox, e.clientY - oy) || 1,
      size0: (() => {
        const m = sideLayers.find((x) => x.id === l.id) ?? l;
        return m.kind === "image" ? m.widthCm : m.sizeCm;
      })(),
      kind: l.kind,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      // screen px → the edited size's cm → M's cm
      updateLayer(d.id, { cx: d.cx + (e.clientX - d.x) / pxPerCm / kEdit, cy: d.cy + (e.clientY - d.y) / pxPerCm / kEdit });
    } else {
      const f = Math.hypot(e.clientX - d.ox, e.clientY - d.oy) / d.d0;
      const v = Math.round(Math.max(d.kind === "image" ? 1 : 0.5, d.size0 * f) * 10) / 10;
      updateLayer(d.id, d.kind === "image" ? { widthCm: v } : { sizeCm: v });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  // ── Checks per side ──
  const checks = useMemo(() => {
    const out: Record<TshirtSide, { bounds: ReturnType<typeof layersBounds>; problems: string[]; warnings: string[] }> = {
      front: { bounds: null, problems: [], warnings: [] },
      back: { bounds: null, problems: [], warnings: [] },
      sleeve_left: { bounds: null, problems: [], warnings: [] },
      sleeve_right: { bounds: null, problems: [], warnings: [] },
    };
    for (const sd of TSHIRT_SIDES) {
      const list = layers[sd];
      const b = layersBounds(list, measure);
      const c = out[sd];
      c.bounds = b;
      if (!b) continue;
      if (!list.every((l) => layerInRegion(l, regions[sd], measure)) || !withinMaxSize(list, measure, regions[sd].max)) c.problems.push(s.outside);
      if (b.w < TSHIRT_MIN_DESIGN_CM || b.h < TSHIRT_MIN_DESIGN_CM) c.problems.push(s.tooSmall.replace("{cm}", String(TSHIRT_MIN_DESIGN_CM)));
      for (const l of list) {
        if (l.kind !== "image" || l.vector) continue;
        const dpi = printedDpi(l.naturalW, l.widthCm);
        // any picture may be ordered — the client is only told it will be blurry
        // too few pixels for its printed size: we print exactly what was uploaded
        if (dpi < TSHIRT_DPI_WARN && !c.warnings.includes(s.lowQuality)) c.warnings.push(s.lowQuality);
      }
    }
    return out;
  }, [layers, measure, s, regions]);

  const designedSides = TSHIRT_SIDES.filter((sd) => layers[sd].length > 0);

  // Previzualizare: the design printed on the garment photos (front with the sleeves, back).
  const sizeFactor = useMemo(() => photoSizeFactor(previewSize), [previewSize]);
  // Prepared in the background while the client edits (a short pause after the last change), so
  // opening Previzualizare shows the shirt at once; with Previzualizare open, right away.
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      await document.fonts?.ready;
      // The 3D model: each side's design as printed on the shown size, painted on its panel at its real size.
      const out3d: Partial<Record<TshirtSide, Print3D>> = {};
      for (const sd of TSHIRT_SIDES) {
        const list = layersForSize(layers[sd], sd, previewSize);
        const rect = layersBounds(list, measure);
        if (!list.length || !rect) continue;
        try {
          out3d[sd] = { canvas: await renderAreaCanvas(list, rect, 60, resolveFont, measure), rect };
        } catch {
          // a picture failed to load: the shirt without it
        }
      }
      if (alive) setPrints3d(out3d);
    }, previewOnly ? 0 : 800);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [previewOnly, layers, resolveFont, measure, previewSize]);
  // The 3D view stays loaded once opened (paused while editing): opening it again is instant.
  const [opened3d, setOpened3d] = useState(false);
  useEffect(() => {
    if (previewOnly) setOpened3d(true);
  }, [previewOnly]);
  const sizesInput = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([size, quantity]) => ({ size, quantity }));
  const totalPieces = sizesInput.reduce((a, b) => a + b.quantity, 0);
  const zonesInput = designedSides
    .map((sd) => ({ sd, b: checks[sd].bounds }))
    .filter((z) => z.b && checks[z.sd].problems.length === 0 && z.b.w >= TSHIRT_MIN_DESIGN_CM && z.b.h >= TSHIRT_MIN_DESIGN_CM)
    .map(({ sd, b }) => ({ placement: sd, widthCm: ceilCm(b!.w), heightCm: ceilCm(b!.h) }));
  const quoteKey = JSON.stringify({ garmentId, sizesInput, zonesInput });

  // ── Live price ──
  useEffect(() => {
    if (!garmentId || sizesInput.length === 0 || zonesInput.length === 0) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/tshirt/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garmentId, sizes: sizesInput, zones: zonesInput }),
        signal: ctrl.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          setQuote((await r.json()) as Quote);
          setQuoteError(false);
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") {
            setQuote(null);
            setQuoteError(true);
          }
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // quoteKey carries every input of the price
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  // ── Send ──
  const allProblems = TSHIRT_SIDES.flatMap((sd) => checks[sd].problems);
  const blocker =
    designedSides.length === 0
      ? s.needDesign
      : allProblems.length > 0
        ? s.needFix.replace("{problem}", allProblems[0]!)
        : totalPieces === 0
          ? s.needSize
          : null;

  // One id per order: a retry of the same order (after an error or a lost answer) can't make a second one.
  // A new design, size or colour is a new order: a new id.
  const requestIdRef = useRef<string>("");
  useEffect(() => {
    requestIdRef.current = `ts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }, [layers, qty, garmentId]);

  const send = async () => {
    if (blocker || !garment || !gdpr || phone.trim().length < 8) return;
    setSubmitting(true);
    setSendError(null);
    try {
      await document.fonts?.ready;
      const zones = [];
      for (const sd of designedSides) {
        const b = checks[sd].bounds!;
        const w = ceilCm(b.w);
        const h = ceilCm(b.h);
        // Originals of the images, so the studio can reopen the design.
        const list: Layer[] = [];
        for (const l of layers[sd]) {
          if (l.kind === "image" && !l.srcKey) {
            const blob = await (await fetch(l.src)).blob();
            list.push({ ...l, srcKey: await uploadBlob(blob, l.fileName || "image.png") });
          } else list.push(l);
        }
        // One print file per ordered size: the design (made on M) scaled for that shirt.
        const perSize: {
          size: string;
          widthCm: number;
          heightCm: number;
          fileKey: string;
          positionCm?: { fromCollarCm: number; fromCenterCm: number };
        }[] = [];
        for (const sz of sortedChosen) {
          // the design as printed on this size: scaled, starting at that size's standard distance from the collar
          const scaled = layersForOrderSize(list, sd, sz, measure, sleeveCm).layers;
          const sb = layersBounds(scaled, measure)!;
          const sw = ceilCm(sb.w);
          const sh = ceilCm(sb.h);
          const blob = await renderPrintPng(scaled, sb, sw, sh, resolveFont, measure);
          perSize.push({
            size: sz,
            widthCm: sw,
            heightCm: sh,
            fileKey: await uploadBlob(blob, `tricou-${sd}-${sz}-${Date.now()}.png`),
            positionCm: isSleeve(sd)
              ? undefined
              : {
                  fromCollarCm: Math.max(0, Math.round((sb.y - neckDropCm(sd, sz)) * 10) / 10),
                  fromCenterCm: Math.round((sb.x + sb.w / 2) * 10) / 10,
                },
          });
        }
        const fileKey = perSize[0]!.fileKey;
        // The garment photo with this side printed on it (a sleeve: a close-up of it).
        let mockup: Blob | null = null;
        const view = photoViewOf(sd);
        const pv = views[view] ?? (photoColour ? await loadApparelPhotoView("tshirt", view, photoColour) : null);
        if (pv) {
          try {
            const c = await composeTshirtView(pv, view, { [sd]: list }, { sizeFactor, sleeveCm, resolveFont, measure });
            if (isSleeve(sd)) {
              const at = SLEEVE_PRINT_MIDDLE;
              const half = 20 * c.pxPerCm;
              const mx = c.originX + at.cx * sizeFactor.x * c.pxPerCm;
              const my = c.originY + at.cy * sizeFactor.y * c.pxPerCm;
              mockup = await canvasPng(cropCanvas(c.canvas, mx - half, my - half, 2 * half, 2 * half));
            } else mockup = await canvasPng(c.canvas);
          } catch {
            mockup = null;
          }
        }
        const mockupKey = mockup ? await uploadBlob(mockup, `tricou-${sd}-mockup-${Date.now()}.png`) : undefined;
        zones.push({
          placement: sd,
          widthCm: w,
          heightCm: h,
          fileKey,
          mockupKey,
          // where the workshop presses it: top of the design below the collar, its middle left/right of centre
          positionCm: isSleeve(sd)
            ? undefined
            : {
                fromCollarCm: Math.round(b.y * 10) / 10,
                fromCenterCm: Math.round((b.x + b.w / 2) * 10) / 10,
              },
          layers: list.map((l) => (l.kind === "image" ? { ...l, src: undefined } : l)),
          perSize,
        });
      }
      const res = await fetch("/api/tshirt/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garmentId: garment.id,
          sizes: sizesInput,
          zones,
          phone: phone.trim(),
          name: name.trim() || undefined,
          notes: notes.trim() || undefined,
          consent: orderConsentPayload(),
          requestId: requestIdRef.current,
        }),
      });
      if (!res.ok) {
        // the server's reason (e.g. a size out of stock, a design too big): shown with the message
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as { orderNumber: number; publicToken: string });
    } catch (e) {
      console.error("tshirt order failed", e);
      const why = e instanceof Error ? e.message : String(e);
      setSendError(`${s.sendError} (${why})`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  if (result) {
    return (
      <main ref={rootRef} className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
        <CheckCircle className="mb-4 h-14 w-14 text-emerald-500" />
        <h1 className="text-2xl font-bold text-gray-900">{s.sentTitle}</h1>
        <p className="mt-2 text-gray-600">{s.sentText}</p>
        <p className="mt-6 text-sm text-gray-500">{s.orderNumber}</p>
        <p className="text-3xl font-bold tabular-nums text-gray-900">#{String(result.orderNumber).padStart(4, "0")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href={`/track/${result.publicToken}`} className="rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-white hover:bg-gold-dark">
            {s.track}
          </Link>
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setResult(null);
              setLayers(EMPTY_LAYERS);
              setQty({});
              setSelectedId(null);
            }}
          >
            {s.another}
          </button>
        </div>
      </main>
    );
  }

  const b = checks[side].bounds;
  // On the edited size: the design's bounds and the largest print there (the frame closest to its shape).
  const bShown = layersBounds(shownLayers, measure);
  const maxFrame = (() => {
    const max = regions[side].max;
    const frames = (max.frames ?? [{ w: max.maxWidthCm, h: max.maxHeightCm }]).map((f) => ({ w: f.w * kEdit, h: f.h * kEdit }));
    if (!bShown) return frames[0]!;
    return frames.reduce((best, f) => (Math.min(f.w / bShown.w, f.h / bShown.h) > Math.min(best.w / bShown.w, best.h / bShown.h) ? f : best));
  })();
  const guideColor = darkShirt ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.35)";

  return (
    <main ref={rootRef} className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> ANVI
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{s.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">{s.subtitle}</p>

      {garments === null ? (
        <div className="flex justify-center py-24 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : garments.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">{s.noShirts}</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Stage: the shirt with the design */}
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {TSHIRT_SIDES.map((sd) => (
                <button
                  key={sd}
                  type="button"
                  onClick={() => {
                    setSide(sd);
                    setSelectedId(null);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium",
                    side === sd ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700",
                  )}
                >
                  {sideName(sd)}
                  {layers[sd].length > 0 && <span className="ml-1.5 opacity-70">· {layers[sd].length}</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPreviewOnly((v) => !v);
                  setSelectedId(null);
                }}
                className={cn(
                  "ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                  previewOnly ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700",
                )}
              >
                <Eye className="h-4 w-4" /> {s.preview}
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100 p-4">
              {(previewOnly || opened3d) && (
                <div className={cn("mx-auto w-full max-w-[640px]", !previewOnly && "hidden")}>
                  <div className="aspect-square w-full overflow-hidden rounded-xl bg-white">
                    {prints3d ? (
                      <TshirtModel3D
                        shirtColor={shirtColor}
                        {...modelScaleFor(garmentCm(previewSize))}
                        sleeveTopCm={placementCm(previewSize).sleeveTop}
                        prints={prints3d}
                        hint={s.dragToTurn}
                        active={previewOnly}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {previewOnly ? (
                <div className="mx-auto w-full max-w-[640px]">
                  {previewMode === "3d" ? null : previewShots[previewMode] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewShots[previewMode]} alt="" className="w-full rounded-xl bg-white" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-gray-400">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                  <p className="mt-2 text-center text-xs text-gray-600" data-preview-caption>
                    {s.previewCaption
                      .replace("{size}", previewSize)
                      .replace("{chest}", fmt(garmentCm(previewSize).chest))
                      .replace("{length}", fmt(garmentCm(previewSize).length))
                      .replace("{pct}", String(Math.round(sizeRatio(previewSize) * 100)))}
                    {(() => {
                      const pb = layersBounds(layersForSize(sideLayers, side, previewSize), measure);
                      return pb ? ` · ${sideName(side)}: ${fmt(ceilCm(pb.w))} × ${fmt(ceilCm(pb.h))} cm` : "";
                    })()}
                  </p>
                  <ClarityPanel layers={layersOnPreview} shirtColor={shirtColor} resolveFont={resolveFont} measure={measure} labels={s} />
                </div>
              ) : (
                <div
                  ref={stageRef}
                  className={cn("relative mx-auto w-full max-w-[520px] select-none touch-none overflow-hidden rounded-xl", photos.status === "ready" && "bg-white")}
                  style={{ height: geo.height }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerDown={() => setSelectedId(null)}
                >
                  {stagePhotoUrl(geo.photo.view) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={stagePhotoUrl(geo.photo.view)!}
                      alt=""
                      draggable={false}
                      decoding="async"
                      className="pointer-events-none absolute max-w-none"
                      style={{ left: geo.photo.left, top: geo.photo.top, width: geo.photo.width, height: geo.photo.height }}
                    />
                  ) : views[geo.photo.view] && (
                    <PhotoBackdrop
                      source={views[geo.photo.view]!.canvas}
                      left={geo.photo.left}
                      top={geo.photo.top}
                      width={geo.photo.width}
                      height={geo.photo.height}
                    />
                  )}
                  {photos.status === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                  {/* Allowed area: faint while moving a design (always on a sleeve, or without a photo) */}
                  {(dragging || isSleeve(side) || (!views[geo.photo.view] && !stagePhotoUrl(geo.photo.view))) && (
                    <AllowedArea
                      region={{
                        ...regions[side],
                        outlines: regions[side].outlines.map((poly) => poly.map(([x, y]) => toEdit(side, x, y))),
                        margin: regions[side].margin * kEdit,
                      }}
                      originX={geo.originX}
                      originY={geo.originY}
                      pxPerCm={pxPerCm}
                      dark={darkShirt}
                    />
                  )}
                  {/* Layers, in cm from the collar (a sleeve: from the top of its square) */}
                  <div className="absolute" style={{ left: geo.originX, top: geo.originY, width: 0, height: 0 }}>
                    {bShown && maxFrame && !previewOnly && !isSleeve(side) && (maxHit || bShown.w >= maxFrame.w - 0.5 || bShown.h >= maxFrame.h - 0.5) && (
                      <div
                        className="pointer-events-none absolute flex items-end justify-center pb-1 text-[10px] font-medium"
                        style={{
                          left: (bShown.x + bShown.w / 2 - maxFrame.w / 2) * pxPerCm,
                          top: (bShown.y + bShown.h / 2 - maxFrame.h / 2) * pxPerCm,
                          width: maxFrame.w * pxPerCm,
                          height: maxFrame.h * pxPerCm,
                          border: `2px dashed ${darkShirt ? "#ffffff" : "#000000"}`,
                          color: darkShirt ? "#ffffff" : "#000000",
                          opacity: 0.3,
                        }}
                      >
                        {(() => {
                          // the frame in the cm of the ordered size it comes from (the design is drawn on M)
                          for (const sz of [...sortedChosen].reverse()) {
                            const r = sizeRatio(sz);
                            for (const f of sizePrintArea(side, sz, sleeveCm).frames ?? [{ w: sizePrintArea(side, sz, sleeveCm).maxWidthCm, h: sizePrintArea(side, sz, sleeveCm).maxHeightCm }])
                              if (Math.abs(f.w / r - maxFrame.w) < 0.15 && Math.abs(f.h / r - maxFrame.h) < 0.15)
                                return `${sz}: ${s.maxSizeLabel.replace("{w}", fmt(f.w)).replace("{h}", fmt(f.h))}`;
                          }
                          return s.maxSizeLabel.replace("{w}", fmt(maxFrame.w)).replace("{h}", fmt(maxFrame.h));
                        })()}
                      </div>
                    )}
                    {shownLayers.map((l) => {
                      const box = layerBoxCm(l, measure);
                      const isSel = l.id === selectedId && !previewOnly;
                      return (
                        <div
                          key={l.id}
                          onPointerDown={(e) => onLayerDown(e, l)}
                          className={cn("absolute cursor-move", isSel && "outline outline-2 outline-sky-500")}
                          style={{
                            left: (l.cx - box.w / 2) * pxPerCm,
                            top: (l.cy - box.h / 2) * pxPerCm,
                            width: box.w * pxPerCm,
                            height: box.h * pxPerCm,
                            transform: `rotate(${l.rotation}deg)`,
                          }}
                        >
                          {l.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.src} alt="" draggable={false} className="pointer-events-none h-full w-full" />
                          ) : (
                            <div
                              className="pointer-events-none whitespace-pre text-center"
                              style={{
                                fontFamily: fontOptionById(l.fontId).cssVar,
                                fontWeight: l.bold ? 700 : 400,
                                fontSize: l.sizeCm * pxPerCm,
                                lineHeight: 1.2,
                                color: l.color,
                              }}
                            >
                              {textLines(l, measure).join("\n")}
                            </div>
                          )}
                          {isSel && (
                            <span
                              onPointerDown={(e) => onHandleDown(e, l)}
                              className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500 shadow"
                            />
                          )}
                        </div>
                      );
                    })}
                    {sideLayers.length === 0 && !previewOnly && (
                      <div
                        className="pointer-events-none absolute flex items-center justify-center p-3 text-center text-xs"
                        style={
                          isSleeve(side)
                            ? { left: (-sleeveCm / 2) * pxPerCm, top: 0, width: sleeveCm * pxPerCm, height: sleeveCm * pxPerCm, color: guideColor }
                            : { left: -12 * pxPerCm, top: 14 * pxPerCm, width: 24 * pxPerCm, height: 16 * pxPerCm, color: guideColor }
                        }
                      >
                        {designLocked ? s.needSizeFirst : s.emptySide}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Designed on M; each ordered size gets its own resized print file (like Canva's resize). */}
              <div className="mt-3 rounded-lg bg-white/70 p-2 text-xs text-gray-600" data-size-scale>
                <p>{s.sizeNote}</p>
                {sortedChosen.length > 0 && sideLayers.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {orderPrints.map(({ size: sz, bounds: sb, shrunk }) => (
                      <span
                        key={sz}
                        data-order-print={sz}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 tabular-nums",
                          shrunk ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-300 bg-white text-gray-700",
                        )}
                        title={shrunk ? s.sizeShrunk : undefined}
                      >
                        <b>{sz}</b>
                        {sb && <> · {fmt(ceilCm(sb.w))} × {fmt(ceilCm(sb.h))} cm</>}
                        {shrunk && <> · {s.sizeShrunk}</>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                  {isSleeve(side)
                    ? `${s.sleeveRule.replaceAll("{s}", fmt(sleeveCm))} ${s.sleevePrice.replace("{p}", fmt(sleeve.priceMdl))}`
                    : s.printMax.replace(
                        "{list}",
                        (sortedChosen.length ? sortedChosen : [editSize])
                          .map((sz) => {
                            const fr = sizePrintArea(side, sz, sleeveCm).frames ?? [sizePrintArea(side, sz, sleeveCm)].map((a) => ({ w: a.maxWidthCm, h: a.maxHeightCm }));
                            return `${sz} ${fr.map((f) => `${fmt(f.w)} × ${fmt(f.h)}`).join(" / ")} cm`;
                          })
                          .join(" · "),
                      )}
                </span>
                {bShown && <span className="font-medium text-gray-700">{s.designSize.replace("{w}", fmt(ceilCm(bShown.w))).replace("{h}", fmt(ceilCm(bShown.h)))} · {editSize}</span>}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{s.mockupNote}</p>
            </div>

            {(checks[side].problems.length > 0 || checks[side].warnings.length > 0) && (
              <ul className="mt-3 space-y-1">
                {checks[side].problems.map((p, i) => (
                  <li key={`p${i}`} className="flex items-start gap-1.5 text-sm text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p}
                  </li>
                ))}
                {checks[side].warnings.map((p, i) => (
                  <li key={`w${i}`} className="flex items-start gap-1.5 text-sm text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Controls */}
          <aside className="space-y-5">
            {/* 1. Shirt */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-gray-900">{s.stepShirt}</h2>
              <div className="flex flex-wrap gap-2">
                {models.map(([id, list]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setModelId(id);
                      setGarmentId(list[0]!.id);
                      setQty({});
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                      modelId === id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700",
                    )}
                  >
                    <Shirt className="h-4 w-4" /> {nameOf(list[0]!)}
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-medium text-gray-500">
                {s.color}: <span className="text-gray-800">{garment?.colorName}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {colors.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    title={g.colorName}
                    aria-label={g.colorName}
                    onClick={() => {
                      setGarmentId(g.id);
                      setQty({});
                    }}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 shadow-sm",
                      garmentId === g.id ? "border-sky-500 ring-2 ring-sky-200" : "border-gray-300",
                    )}
                    style={{ backgroundColor: g.colorHex ?? "#ffffff" }}
                  />
                ))}
              </div>
            </div>

            {/* 2. Sizes (they set the print area) */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-gray-900">{s.stepSizes}</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(garment?.sizes ?? []).map((sz) => (
                  <label key={sz.size} className="rounded-lg border border-gray-200 p-2 text-center">
                    <span className="block text-sm font-semibold text-gray-900">{sz.size}</span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={qty[sz.size] ?? 0}
                      onChange={(e) => setQty((q) => ({ ...q, [sz.size]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      className="mt-1 h-8 text-center"
                    />
                    <span className="mt-1 block text-[10px] text-gray-400">{s.inStock.replace("{n}", String(sz.inStock))}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">{s.totalPieces.replace("{n}", String(totalPieces))}</p>
            </div>

            {/* Ready places (as on the order form), for the side being edited; sleeves have their own tabs */}
            {!isSleeve(side) && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-1 font-semibold text-gray-900">{s.placeTitle}</h2>
              <p className="mb-3 text-xs text-gray-500">{s.placeHint}</p>
              {placeShrunk && placement[side] === placeShrunk && (
                <p className="mb-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-800" data-place-shrunk>
                  {s.placeShrunk}
                </p>
              )}
              {placeTooBig && placement[side] === placeTooBig && (
                <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.placeTooBig}
                </p>
              )}
              {side === "front" && <p className="mb-1 text-[11px] text-gray-500">{t.dtf.editor.sideHint}</p>}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(side === "front" ? TSHIRT_FRONT_PLACEMENTS : TSHIRT_BACK_PLACEMENTS).map((p) => {
                  const on = placement[side] === p;
                  const label =
                    p === "front" ? s.placeFront : p === "chest_left" ? s.placeChestLeft : p === "chest_right" ? s.placeChestRight : p === "back" ? s.placeBack : s.placeNape;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      title={label}
                      onClick={() => pickPlacement(p)}
                      className={cn(
                        "flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-0.5 pb-1 pt-1.5 text-center transition-colors",
                        on ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                      )}
                    >
                      <GarmentZoneSchema placement={p === "front" ? "front_mid" : p === "back" ? "back_mid" : p} className="h-10 w-10" />
                      <span className="line-clamp-2 w-full break-words text-[11px] font-medium leading-tight text-gray-700">{label}</span>
                      {p === "chest_left" && (
                        <span className="text-[9px] font-normal leading-none text-gray-400" data-recommended>
                          {s.recommended}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* 3. Design */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-1 font-semibold text-gray-900">
                {s.stepDesign} · {sideName(side)}
              </h2>
              <p className={cn("mb-3 text-xs", designLocked ? "text-amber-700" : "text-gray-500")}>
                {designLocked ? s.needSizeFirst : s.selectHint}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={addText} disabled={designLocked}>
                  <Type className="mr-1.5 h-4 w-4" /> {s.addText}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={designLocked}>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> {s.addImage}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.svg,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    void addImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-gray-400">{s.pngTip}</p>

              {selected && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  {selected.kind === "text" ? (
                    <>
                      <textarea
                        value={selected.text}
                        onChange={(e) => updateLayer(selected.id, { text: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                      />
                      <p className="-mt-2 text-[11px] text-gray-400">{s.textWraps}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs text-gray-500">
                          {s.font}
                          <select
                            value={selected.fontId}
                            onChange={(e) => updateLayer(selected.id, { fontId: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                          >
                            {FONT_OPTIONS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-500">
                          {s.textSize}
                          <Input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={Math.round(selected.sizeCm * kEdit * 10) / 10}
                            onChange={(e) => updateLayer(selected.id, { sizeCm: Math.max(0.5, Number(e.target.value) || 0.5) / kEdit })}
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-gray-500">{s.textColor}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {TEXT_COLOR_OPTIONS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={c}
                              onClick={() => updateLayer(selected.id, { color: c })}
                              className={cn(
                                "h-7 w-7 rounded-full border",
                                selected.color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-sky-400" : "border-gray-300",
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <input
                            type="color"
                            value={selected.color}
                            onChange={(e) => updateLayer(selected.id, { color: e.target.value })}
                            className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                            aria-label={s.textColor}
                          />
                          <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-700">
                            <input type="checkbox" checked={selected.bold} onChange={(e) => updateLayer(selected.id, { bold: e.target.checked })} />
                            {s.bold}
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 items-end gap-3">
                      <label className="block text-xs text-gray-500">
                        {s.width}
                        <Input
                          type="number"
                          min={1}
                          step={0.5}
                          value={Math.round(selected.widthCm * kEdit * 10) / 10}
                          onChange={(e) => updateLayer(selected.id, { widthCm: Math.max(1, Number(e.target.value) || 1) / kEdit })}
                          className="mt-1"
                        />
                      </label>
                      {(() => {
                        // the biggest ordered size prints it largest
                        const kMax = Math.max(1, ...sortedChosen.map((sz) => sizeRatio(sz)));
                        const low = !selected.vector && printedDpi(selected.naturalW, selected.widthCm * kMax) < TSHIRT_DPI_WARN;
                        return (
                          <span
                            className={cn(
                              "flex items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-medium",
                              low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
                            )}
                          >
                            {low ? s.qualityLow : s.qualityOk}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  <label className="block text-xs text-gray-500">
                    {s.rotate}: {Math.round(selected.rotation)}°
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selected.rotation}
                      onChange={(e) => updateLayer(selected.id, { rotation: Number(e.target.value) })}
                      className="mt-1 w-full"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => updateLayer(selected.id, { cx: 0 })}>
                      <Crosshair className="mr-1 h-3.5 w-3.5" /> {s.center}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => moveLayer(selected.id, 1)} aria-label={s.forward}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => moveLayer(selected.id, -1)} aria-label={s.backward}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="ml-auto text-red-600" onClick={() => removeLayer(selected.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> {s.remove}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Send */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-gray-900">{s.stepSend}</h2>
              <div className="mb-3 rounded-xl bg-gray-50 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-gray-600">{s.priceTotal}</span>
                  <span className="text-xl font-bold tabular-nums text-gray-900">{quote ? `${quote.totalMdl.toFixed(2)} MDL` : "—"}</span>
                </div>
                {quote && <p className="text-right text-xs text-gray-500">{s.perPiece.replace("{p}", quote.perPieceMdl.toFixed(2))}</p>}
                {quoteError && <p className="mt-1 text-xs text-red-600">{s.priceError}</p>}
                <p className="mt-1 text-[11px] text-gray-400">{s.priceHint}</p>
              </div>
              <div className="space-y-3">
                <label className="block text-xs text-gray-500">
                  {s.phone}
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+373 6x xxx xxx" className="mt-1" />
                </label>
                <label className="block text-xs text-gray-500">
                  {s.name}
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
                </label>
                <label className="block text-xs text-gray-500">
                  {s.notes}
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
                  />
                </label>
                <OrderConsentCheckbox checked={gdpr} onChange={setGdpr} />
                {blocker && <p className="text-xs text-amber-700">{blocker}</p>}
                {!blocker && TSHIRT_SIDES.some((sd) => checks[sd].warnings.includes(s.lowQuality)) && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.lowQualitySend}
                  </p>
                )}
                {sendError && <p className="text-xs text-red-600">{sendError}</p>}
                <Button
                  type="button"
                  className="w-full"
                  disabled={!!blocker || !gdpr || phone.trim().length < 8 || submitting || !quote}
                  onClick={send}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? s.sending : s.send}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

/**
 * The allowed area drawn faintly on the stage: inside the shirt outline of the
 * smallest ordered size, 3 cm from its edges (a sleeve: its print square).
 */
function AllowedArea({
  region,
  originX,
  originY,
  pxPerCm,
  dark,
}: {
  region: PrintRegion;
  originX: number;
  originY: number;
  pxPerCm: number;
  dark: boolean;
}) {
  const id = useMemo(() => `allowed-${Math.random().toString(36).slice(2, 8)}`, []);
  const colour = dark ? "#ffffff" : "#0f172a";
  const toPath = (poly: [number, number][]) =>
    poly.map(([x, y], i) => `${i ? "L" : "M"}${(originX + x * pxPerCm).toFixed(1)} ${(originY + y * pxPerCm).toFixed(1)}`).join(" ") + " Z";
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {/* Inside EVERY ordered size (one mask per size, nested: the smallest wins), 3 cm off its edges. */}
      <defs>
        {region.outlines.map((poly, i) => (
          <mask key={i} id={`${id}-${i}`}>
            <path d={toPath(poly)} fill="white" />
            {region.margin > 0 && <path d={toPath(poly)} fill="none" stroke="black" strokeWidth={2 * region.margin * pxPerCm} strokeLinejoin="round" />}
          </mask>
        ))}
      </defs>
      {region.outlines.reduceRight<React.ReactNode>(
        (inner, _poly, i) => <g mask={`url(#${id}-${i})`}>{inner}</g>,
        <rect width="100%" height="100%" fill={colour} opacity={0.1} />,
      )}
      {region.margin === 0 &&
        region.outlines.map((poly, i) => (
          <path key={i} d={toPath(poly)} fill="none" stroke={colour} strokeOpacity={0.45} strokeDasharray="4 4" strokeWidth={1.5} />
        ))}
    </svg>
  );
}

/**
 * The photo colour of a shirt: Roly's own photo for white and black (the stock
 * key may be a local name like «negru» instead of the supplier code), else the
 * key as it is (the white photo recoloured to `hex`).
 */
function photoColourOf(garmentId: string, hex: string): { key: string; hex: string } {
  const key = garmentId.slice(garmentId.indexOf(":") + 1);
  if (/(^|[^0-9])0[12]$/.test(key.replace(/[^0-9A-Za-z]/g, "-"))) return { key, hex };
  const l = lightness(hex);
  if (l >= 245) return { key: "CA6502-01", hex };
  if (l <= 40) return { key: "CA6502-02", hex };
  return { key, hex };
}

/** The garment photo behind the stage, drawn from its prepared canvas (no image encoding). */
function PhotoBackdrop({ source, left, top, width, height }: { source: HTMLCanvasElement; left: number; top: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source, width, height]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute" style={{ left, top, width, height }} />;
}
