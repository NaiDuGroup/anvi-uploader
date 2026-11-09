"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  LF_EDGES,
  LF_EYELET_MDL,
  LF_EYELET_SPACING_DEFAULT_CM,
  LF_HEM_PER_METER_MDL,
  LF_POCKET_PER_METER_MDL,
  lfEyeletPositions,
  type LfEdge,
  type LfEyeletPoint,
  type LfFinishingInput,
} from "@/lib/largeFormat/lfFinishing";
import type { LfKitId } from "@/lib/largeFormat/lfKits";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { effectiveDpi } from "@/lib/storefront/dtfPrint";
import { formatPrice } from "@/lib/storefront/format";
import {
  SHOP_LF_CATEGORY_PATH,
  SHOP_LF_IMAGES,
  SHOP_LF_MAX_LENGTH_CM,
  SHOP_LF_MAX_QTY,
  SHOP_LF_MAX_WIDTH_CM,
  SHOP_LF_MIN_SIDE_CM,
  SHOP_LF_RULES,
  shopLfCm,
  shopLfLineProblem,
  shopLfSizeText,
  type ShopLfMaterial,
  type ShopLfQuote,
} from "@/lib/storefront/largeFormat";
import { describeShopLfLine, SHOP_LF_EDGE_KEY, SHOP_LF_MATERIAL_KEY, SHOP_LF_PRODUCT_KEY } from "@/lib/storefront/largeFormatLabels";
import type { ShopLfPageData, ShopLfPageMaterial } from "@/lib/storefront/largeFormatPageData";
import { LF_PRODUCT_COPY, lfText, type LfT } from "@/lib/storefront/largeFormatText";
import { LF_CANVAS_STRETCHER_DEPTH_CM } from "@/lib/storefront/lfVisual";
import { pickLocalized } from "@/lib/storefront/i18n";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopFileRef } from "@/lib/storefront/types";
import { readImageSize, ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import { AddedToast } from "./AddedToast";
import { LfCanvas3DLazy } from "./LfCanvas3DLazy";
import { LfPreview } from "./LfPreview";
import { LfScaleView } from "./LfScaleView";
import { QtyStepper, StickyCtaLabel } from "./ProductBits";
import { ShopImg } from "./ShopImg";
import { UploadIcon } from "./ShopIcons";
import { orientedPresets, shopNumText } from "@/lib/storefront/sizes";
import { useShopLang } from "./ShopLangProvider";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/tiff,.pdf,.png,.jpg,.jpeg,.tif,.tiff";
const SPACINGS = [30, 35, 40, 45, 50] as const;
const PT_TO_CM = 2.54 / 72;

type FileState =
  | { status: "uploading"; name: string; pct: number }
  | {
      status: "done";
      ref: ShopFileRef;
      px: { width: number; height: number } | null;
      /** PDF: first page size, cm. */
      pageCm: { width: number; height: number } | null;
      previewUrl: string | null;
      pdf: boolean;
    }
  | { status: "error"; name: string; message: string };

type EyeletMode = "none" | "corners" | "spacing";
type PreviewView = "layout" | "scale" | "3d";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function readPdfPageCm(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const box = doc.getPages()[0]?.getMediaBox();
    return box ? { width: box.width * PT_TO_CM, height: box.height * PT_TO_CM } : null;
  } catch {
    return null;
  }
}

/** Small JPEG of an image file (longest side 360 px): the cart thumbnail and the preview after a reload. */
async function makeThumb(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image"));
      i.src = url;
    });
    const s: number = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseCm(s: string): number | null {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}

/**
 * A wide-format product page (banner, Oracal, canvas, poster, roll-up,
 * X-banner): material, size (price-list sizes and / or a custom size), banner
 * finishing, the artwork with a resolution check at the print size, a preview
 * to scale and the live price from the studio's pipeline. With `editId` it
 * edits that cart line.
 */
export function LargeFormatView({ data, editId = null }: { data: ShopLfPageData; editId?: string | null }) {
  const lines = useCart();
  const hydrated = useHydrated();
  const slug: string = SHOP_LF_RULES[data.product].slug;
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.slug === slug && l.quote.kind === "largeFormat") ?? null) : null;
  return <LfEditor key={editLine?.id ?? "new"} data={data} editLine={editLine} />;
}

function initialFile(editLine: CartLine | null): FileState | null {
  const f = editLine?.files[0];
  if (!f) return null;
  return {
    status: "done",
    ref: f,
    px: f.pixelWidth && f.pixelHeight ? { width: f.pixelWidth, height: f.pixelHeight } : null,
    pageCm: null,
    previewUrl: f.thumb ?? null,
    pdf: /\.pdf$/i.test(f.fileName),
  };
}

function LfEditor({ data, editLine }: { data: ShopLfPageData; editLine: CartLine | null }) {
  const { t, lang, href, paymentLive, payOnDelivery } = useShopLang();
  const lt: LfT = useMemo(() => lfText(lang), [lang]);
  const cm: string = t("lfCm");
  const router = useRouter();
  const rule = SHOP_LF_RULES[data.product];
  const edit: ShopLfQuote | null = editLine?.quote.kind === "largeFormat" ? editLine.quote : null;

  const [materialKey, setMaterialKey] = useState<ShopLfMaterial | null>(
    (edit?.material && data.materials.some((m) => m.key === edit.material) ? edit.material : data.materials[0]?.key) ?? null,
  );
  const material: ShopLfPageMaterial | null = data.materials.find((m) => m.key === materialKey) ?? null;
  const presets = material?.presets ?? [];
  const canCustom: boolean = rule.sizing === "custom" || rule.sizing === "both";

  // Size: a price-list size (with orientation) or a custom one.
  const editPresetIdx: number = edit?.preset
    ? presets.findIndex(
        (p) => (p.widthCm === edit.widthCm && p.heightCm === edit.heightCm) || (p.widthCm === edit.heightCm && p.heightCm === edit.widthCm),
      )
    : -1;
  const [sizeMode, setSizeMode] = useState<"preset" | "custom">(
    rule.sizing === "preset" || (rule.sizing === "both" && (edit ? !!edit.preset : presets.length > 0)) ? "preset" : "custom",
  );
  // Default: 50×70 (the most ordered canvas / photo size), else the middle of the list.
  const defaultPresetIdx: number = presets.findIndex((p) => p.widthCm === 50 && p.heightCm === 70);
  const [presetIdx, setPresetIdx] = useState<number>(
    editPresetIdx >= 0 ? editPresetIdx : defaultPresetIdx >= 0 ? defaultPresetIdx : Math.min(presets.length - 1, Math.floor(presets.length / 2)),
  );
  const [landscape, setLandscape] = useState<boolean>(edit?.preset ? (edit.widthCm ?? 0) > (edit.heightCm ?? 0) : false);
  const [wStr, setWStr] = useState<string>(edit && !edit.preset && edit.widthCm ? shopLfCm(edit.widthCm) : data.product === "banner" ? "200" : "100");
  const [hStr, setHStr] = useState<string>(edit && !edit.preset && edit.heightCm ? shopLfCm(edit.heightCm) : data.product === "banner" ? "100" : "70");
  const [kitId, setKitId] = useState<LfKitId | null>(edit?.kit ?? data.kits[0]?.id ?? null);
  const [qty, setQty] = useState<number>(edit?.quantity ?? 1);

  // Banner finishing.
  const ef = edit?.finishing;
  const [eyeletMode, setEyeletMode] = useState<EyeletMode>(ef?.eyelets ? ef.eyelets.mode : rule.finishing ? "spacing" : "none");
  const [spacing, setSpacing] = useState<number>(ef?.eyelets?.mode === "spacing" ? ef.eyelets.spacingCm : LF_EYELET_SPACING_DEFAULT_CM);
  const [hem, setHem] = useState<boolean>(ef?.hem ?? false);
  const [pockets, setPockets] = useState<LfEdge[]>(ef?.pockets ?? []);

  const [file, setFile] = useState<FileState | null>(() => initialFile(editLine));
  const [view, setView] = useState<PreviewView>("layout");
  const [threeFailed, setThreeFailed] = useState(false);
  const onThreeFail = useCallback(() => {
    setThreeFailed(true);
    setView("layout");
  }, []);
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState(false);
  const urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => (u.startsWith("blob:") ? URL.revokeObjectURL(u) : undefined));
  }, []);

  const kit = data.kits.find((k) => k.id === kitId) ?? null;
  const preset = sizeMode === "preset" ? presets[presetIdx] ?? null : null;
  const size: { widthCm: number; heightCm: number } | null = kit
    ? { widthCm: kit.printWidthCm, heightCm: kit.printHeightCm }
    : preset
      ? landscape === preset.widthCm < preset.heightCm
        ? { widthCm: preset.heightCm, heightCm: preset.widthCm }
        : { widthCm: preset.widthCm, heightCm: preset.heightCm }
      : (() => {
          const w = parseCm(wStr);
          const h = parseCm(hStr);
          return w && h ? { widthCm: w, heightCm: h } : null;
        })();

  const finishing: LfFinishingInput | undefined = rule.finishing
    ? (() => {
        const f: LfFinishingInput = {
          ...(hem ? { hem: true } : {}),
          ...(pockets.length ? { pockets: LF_EDGES.filter((e) => pockets.includes(e)) } : {}),
          ...(eyeletMode === "corners"
            ? { eyelets: { mode: "corners" as const } }
            : eyeletMode === "spacing"
              ? { eyelets: { mode: "spacing" as const, spacingCm: spacing } }
              : {}),
        };
        return Object.keys(f).length ? f : undefined;
      })()
    : undefined;

  const quoteLine: ShopLfQuote | null = useMemo(() => {
    if (rule.sizing === "kit") return kitId ? { kind: "largeFormat", product: data.product, kit: kitId, quantity: qty } : null;
    if (!materialKey || !size) return null;
    return {
      kind: "largeFormat",
      product: data.product,
      material: materialKey,
      widthCm: size.widthCm,
      heightCm: size.heightCm,
      quantity: qty,
      ...(preset ? { preset: true as const } : {}),
      ...(finishing ? { finishing } : {}),
    };
    // `size` / `finishing` are rebuilt every render: key on their values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.sizing, kitId, data.product, qty, materialKey, size?.widthCm, size?.heightCm, !!preset, JSON.stringify(finishing ?? null)]);

  const localProblem: string | null = quoteLine ? shopLfLineProblem(quoteLine) : canCustom ? "lf_size_required" : null;
  const tooWideForRoll: boolean =
    !!quoteLine && !quoteLine.kit && !!size && !!material && Math.min(size.widthCm, size.heightCm) + 2 * material.wrapCm > material.maxPrintableWidthCm + 1e-9;
  const quote = useLiveQuote(localProblem || tooWideForRoll ? null : quoteLine, lang);
  const total: number | null = quote.status === "done" && quote.line.ok ? quote.line.total : null;
  const failedCode: string | null =
    localProblem ?? (tooWideForRoll ? "lf_too_wide" : quote.status === "done" && !quote.line.ok ? quote.line.code : null);

  const problemText = (code: string): string => {
    switch (code) {
      case "lf_too_wide":
        return lt("tooWide", { w: shopLfCm(material?.maxPrintableWidthCm ?? SHOP_LF_MAX_WIDTH_CM) });
      case "lf_too_long":
        return lt("tooLong", { l: SHOP_LF_MAX_LENGTH_CM });
      case "lf_size_too_small":
        return lt("tooSmall", { m: SHOP_LF_MIN_SIDE_CM });
      case "lf_size_required":
      case "lf_size_invalid":
        return lt("sizeLimits", { w: shopLfCm(material?.maxPrintableWidthCm ?? SHOP_LF_MAX_WIDTH_CM), l: SHOP_LF_MAX_LENGTH_CM });
      default:
        return t("priceUnavailable");
    }
  };

  // Preview geometry.
  const eyeletPts: LfEyeletPoint[] =
    size && kit?.cornerEyelets
      ? lfEyeletPositions({ mode: "corners" }, size.widthCm, size.heightCm)
      : size && finishing?.eyelets
        ? lfEyeletPositions(finishing.eyelets, size.widthCm, size.heightCm)
        : [];
  const eyeletCount: number = finishing?.eyelets ? eyeletPts.length : 0;

  // File check at the print size (canvas: the face; the sides are mirrored from it).
  const done = file?.status === "done" ? file : null;
  const dpi: number | null = done?.px && size ? effectiveDpi(done.px, size) : null;
  const sizeLabel: string = size ? shopLfSizeText(size.widthCm, size.heightCm, cm) : "";
  const fileRatio: number | null = done?.px
    ? done.px.width / done.px.height
    : done?.pageCm
      ? done.pageCm.width / done.pageCm.height
      : null;
  const sizeRatio: number | null = size ? size.widthCm / size.heightCm : null;
  const proportionsOff: boolean = fileRatio != null && sizeRatio != null && Math.abs(fileRatio / sizeRatio - 1) > 0.03;
  const expectedPx: string = size
    ? `${Math.round((size.widthCm / 2.54) * rule.okDpi)}×${Math.round((size.heightCm / 2.54) * rule.okDpi)}`
    : "";

  const uploading: boolean = file?.status === "uploading";
  const canAdd: boolean = !!quoteLine && !failedCode && total != null && !uploading;

  const addToCart = () => {
    if (!quoteLine || !canAdd) return;
    if (!done) {
      setHint(true);
      document.getElementById("shop-lf-file")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const text = describeShopLfLine(quoteLine, t);
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: text.slug,
      title: text.title,
      optionsText: text.optionsText,
      image: done.ref.thumb ?? SHOP_LF_IMAGES[data.product],
      quote: quoteLine,
      files: [done.ref],
      lastTotal: total,
      // Runs in the click handler, not during render.
      addedAt: editLine?.addedAt ?? Date.now(),
    };
    setHint(false);
    if (editLine) {
      dispatchCart({ type: "update", line });
      router.push(href("/shop/cos"));
      return;
    }
    if (!dispatchCart({ type: "add", line })) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 4000);
  };

  const title: string = t(SHOP_LF_PRODUCT_KEY[data.product]);

  // Preview views: the layout (production spec, default), the real size next to a person, 3D (canvas).
  const can3d: boolean = data.product === "canvas" && (material?.wrapCm ?? 0) > 0;
  const views: PreviewView[] = can3d ? ["layout", "scale", "3d"] : ["layout", "scale"];
  // Sets: the stand's visible size (the roll-up print also goes into the cassette).
  const visible: { widthCm: number; heightCm: number } | null = kit ? { widthCm: kit.widthCm, heightCm: kit.heightCm } : size;
  const chip = (on: boolean) =>
    `min-h-11 rounded-[10px] border-[1.5px] px-4 font-bold ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"}`;
  const breakdown = quote.status === "done" && quote.line.ok ? (quote.line.breakdown ?? []) : [];

  if (!data.available) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-[26px] font-extrabold sm:text-4xl">{title}</h1>
        <p className="m-0 text-(--muted)">{t("priceUnavailable")}</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-[15px]">{lt("preview")}</b>
          {size ? (
            <div role="tablist" aria-label={lt("viewTabs")} className="flex rounded-[10px] bg-(--soft) p-1">
              {views.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => {
                    setView(v);
                    if (v === "3d") setThreeFailed(false);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-sm font-bold ${view === v ? "bg-white text-(--ink) shadow-sm" : "text-(--muted)"}`}
                >
                  {v === "layout" ? lt("tabLayout") : v === "scale" ? lt("tabScale") : lt("tab3d")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {size && view === "scale" && visible ? (
          <LfScaleView
            product={data.product}
            widthCm={visible.widthCm}
            heightCm={visible.heightCm}
            imageUrl={done?.previewUrl ?? null}
            sizeText={{ width: `${shopNumText(visible.widthCm, lang)} ${cm}`, height: `${shopNumText(visible.heightCm, lang)} ${cm}` }}
            caption={lt("scaleCaption")}
            label={lt("scaleAlt", { item: title, size: shopLfSizeText(visible.widthCm, visible.heightCm, cm) })}
          />
        ) : size && view === "3d" && can3d ? (
          <div className="flex flex-col gap-2">
            <LfCanvas3DLazy
              widthCm={size.widthCm}
              heightCm={size.heightCm}
              depthCm={LF_CANVAS_STRETCHER_DEPTH_CM}
              wrapCm={material?.wrapCm ?? 0}
              imageUrl={done && !done.pdf ? done.previewUrl : null}
              className="aspect-[4/3] w-full rounded-md border border-(--line2)"
              onFail={onThreeFail}
            />
            <span className="text-sm text-(--muted2)">{done?.pdf ? lt("canvas3dPdf") : lt("canvas3dHint")}</span>
          </div>
        ) : size ? (
          <LfPreview
            widthCm={size.widthCm}
            heightCm={size.heightCm}
            imageUrl={done?.previewUrl ?? null}
            safeCm={rule.safeCm}
            wrapCm={material?.wrapCm ?? 0}
            eyelets={eyeletPts}
            pockets={finishing?.pockets ?? []}
            hiddenBottomCm={kit?.hiddenBottomCm ?? 0}
            emptyText={done ? (done.pdf ? "PDF" : "✓") : lt("previewEmpty")}
            label={`${title} ${sizeLabel}`}
          />
        ) : (
          <ShopImg src={SHOP_LF_IMAGES[data.product]} alt="" className="aspect-square w-full rounded-[14px]" />
        )}
        {threeFailed ? (
          <p role="status" className="m-0 text-sm text-(--warn)">
            {lt("canvas3dUnavailable")}
          </p>
        ) : null}
        {view === "layout" || !size ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-(--muted2)">
            <li>
              <span aria-hidden className="mr-2 inline-block w-5 border-t-[2px] border-dashed border-[#2563eb] align-middle" />
              {lt("legendSafe")} ({shopLfCm(rule.safeCm)} {cm})
            </li>
            {material?.wrapCm ? (
              <li>
                <span aria-hidden className="mr-2 inline-block w-5 border-t-[2px] border-[#e11d48] align-middle" />
                {lt("legendWrap", { cm: material.wrapCm })}
              </li>
            ) : null}
            {eyeletPts.length ? (
              <li>
                <span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-[#111827] bg-white align-middle" />
                {lt("legendEyelets")} ({eyeletPts.length})
              </li>
            ) : null}
            {finishing?.pockets?.length ? <li>▧ {lt("legendPocket")}</li> : null}
            {kit?.hiddenBottomCm ? <li>▧ {lt("legendHidden", { cm: kit.hiddenBottomCm })}</li> : null}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{title}</h1>
          {data.fromPrice != null ? (
            <span className="text-base font-bold text-(--gold-ink)">
              {rule.sizing === "kit" && data.kits.length === 1 ? formatPrice(data.fromPrice, lang) : t("fromPrice", { price: formatPrice(data.fromPrice, lang) })}
            </span>
          ) : null}
          <p className="m-0 text-base leading-relaxed text-(--muted)">{pickLocalized(LF_PRODUCT_COPY[data.product].description, lang)}</p>
          {editLine ? (
            <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
              {t("editingLine")}
            </p>
          ) : null}
        </div>

        {data.materials.length > 1 ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{lt("material")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {data.materials.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={materialKey === m.key}
                  onClick={() => {
                    setMaterialKey(m.key);
                    if (m.presets.length === 0) setSizeMode("custom");
                    setPresetIdx((i) => Math.min(i, Math.max(0, m.presets.length - 1)));
                  }}
                  className={chip(materialKey === m.key)}
                >
                  {t(SHOP_LF_MATERIAL_KEY[m.key])}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {rule.sizing === "kit" ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{lt("kitSize")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {data.kits.map((k) => (
                <button key={k.id} type="button" aria-pressed={kitId === k.id} onClick={() => setKitId(k.id)} className={`${chip(kitId === k.id)} flex flex-col items-start justify-center py-1.5 text-left`}>
                  <span>{shopLfSizeText(k.widthCm, k.heightCm, cm)}</span>
                  <span className="text-xs font-semibold opacity-80">{formatPrice(k.price, lang)}</span>
                </button>
              ))}
            </div>
            <span className="text-sm text-(--muted2)">{lt("kitIncludes")}</span>
          </fieldset>
        ) : (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{lt("size")}</legend>
            {presets.length > 0 && rule.sizing !== "custom" ? (
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={lt("fixedSizes")}>
                {/* Labels and order follow the orientation: «Orizontală» shows 70×50. */}
                {orientedPresets(presets, landscape).map(({ preset: p, index: i, widthCm, heightCm }) => (
                  <button
                    key={`${p.widthCm}x${p.heightCm}`}
                    type="button"
                    aria-pressed={sizeMode === "preset" && presetIdx === i}
                    onClick={() => {
                      setSizeMode("preset");
                      setPresetIdx(i);
                    }}
                    className={`${chip(sizeMode === "preset" && presetIdx === i)} flex flex-col items-start justify-center py-1.5 text-left`}
                  >
                    <span>{`${shopNumText(widthCm, lang)}×${shopNumText(heightCm, lang)}`}</span>
                    <span className="text-xs font-semibold opacity-80">{formatPrice(p.price, lang)}</span>
                  </button>
                ))}
                {canCustom ? (
                  <button type="button" aria-pressed={sizeMode === "custom"} onClick={() => setSizeMode("custom")} className={chip(sizeMode === "custom")}>
                    {lt("customSize")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {sizeMode === "preset" && preset && preset.widthCm !== preset.heightCm ? (
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={lt("orientation")}>
                <button type="button" aria-pressed={!landscape} onClick={() => setLandscape(false)} className={chip(!landscape)}>
                  {lt("portrait")}
                </button>
                <button type="button" aria-pressed={landscape} onClick={() => setLandscape(true)} className={chip(landscape)}>
                  {lt("landscape")}
                </button>
              </div>
            ) : null}
            {sizeMode === "custom" && canCustom ? (
              <div className="flex flex-wrap items-end gap-3">
                <CmInput label={lt("widthCm")} value={wStr} onChange={setWStr} />
                <span className="pb-3 text-lg text-(--muted)">×</span>
                <CmInput label={lt("heightCm")} value={hStr} onChange={setHStr} />
              </div>
            ) : null}
            {sizeMode === "custom" ? (
              <span className="text-sm text-(--muted2)">
                {lt("sizeLimits", { w: shopLfCm(material?.maxPrintableWidthCm ?? SHOP_LF_MAX_WIDTH_CM), l: SHOP_LF_MAX_LENGTH_CM })}
              </span>
            ) : null}
          </fieldset>
        )}

        {rule.finishing ? (
          <fieldset className="m-0 flex flex-col gap-4 rounded-[14px] border-[1.5px] border-(--line2) p-4">
            <legend className="px-1 text-[15px] font-bold">{lt("finishing")}</legend>
            <div className="flex flex-col gap-2">
              <b className="text-sm">{lt("eyelets")}</b>
              <div className="flex flex-wrap gap-2">
                {(["none", "corners", "spacing"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={eyeletMode === m} onClick={() => setEyeletMode(m)} className={chip(eyeletMode === m)}>
                    {m === "none" ? lt("eyeletsNone") : m === "corners" ? lt("eyeletsCorners") : lt("eyeletsPerimeter")}
                  </button>
                ))}
              </div>
              {eyeletMode === "spacing" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-(--muted)">{lt("eyeletSpacing")}</span>
                  <div className="flex flex-wrap gap-2">
                    {SPACINGS.map((s) => (
                      <button key={s} type="button" aria-pressed={spacing === s} onClick={() => setSpacing(s)} className={chip(spacing === s)}>
                        {s} {cm}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {eyeletCount > 0 ? (
                <span className="text-sm text-(--muted2)">{lt("eyeletsCount", { n: eyeletCount, price: formatPrice(LF_EYELET_MDL, lang) })}</span>
              ) : null}
            </div>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" checked={hem} onChange={(e) => setHem(e.target.checked)} className="mt-1 h-5 w-5" />
              <span className="flex flex-col">
                <b className="text-sm">{lt("hem")}</b>
                <span className="text-sm text-(--muted2)">{lt("hemHint", { price: formatPrice(LF_HEM_PER_METER_MDL, lang) })}</span>
              </span>
            </label>
            <div className="flex flex-col gap-2">
              <b className="text-sm">{lt("pockets")}</b>
              <div className="flex flex-wrap gap-2">
                {LF_EDGES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={pockets.includes(e)}
                    onClick={() => setPockets((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]))}
                    className={chip(pockets.includes(e))}
                  >
                    {t(SHOP_LF_EDGE_KEY[e])}
                  </button>
                ))}
              </div>
              <span className="text-sm text-(--muted2)">{lt("pocketsHint", { price: formatPrice(LF_POCKET_PER_METER_MDL, lang) })}</span>
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <b className="text-[15px]">{lt("quantity")}</b>
          <QtyStepper value={qty} onChange={setQty} max={SHOP_LF_MAX_QTY} label={lt("quantity")} />
        </div>

        <div id="shop-lf-file" className="flex flex-col gap-2">
          <LfFileUpload
            value={file}
            onChange={(next) => {
              setFile((prev) => {
                if (prev?.status === "done" && prev.previewUrl?.startsWith("blob:")) {
                  URL.revokeObjectURL(prev.previewUrl);
                  urls.current.delete(prev.previewUrl);
                }
                return next;
              });
              if (next?.status === "done" && next.previewUrl) urls.current.add(next.previewUrl);
            }}
            lt={lt}
          />
          {size && !done ? (
            <span className="text-sm text-(--muted2)">{lt("fileHint", { size: sizeLabel, px: expectedPx, dpi: rule.okDpi })}</span>
          ) : null}
          {done && size ? (
            <div className="flex flex-col gap-1 text-sm">
              {dpi != null ? (
                <span role={dpi < rule.lowDpi ? "alert" : undefined} className={dpi < rule.okDpi ? "font-semibold text-(--warn)" : "text-(--ok)"}>
                  {lt(dpi >= rule.okDpi ? "dpiGood" : dpi >= rule.lowDpi ? "dpiOk" : "dpiLow", { dpi, size: sizeLabel })}
                </span>
              ) : done.pdf ? (
                <span className="text-(--muted)">
                  {done.pageCm ? `${lt("pdfSize", { size: shopLfSizeText(done.pageCm.width, done.pageCm.height, cm) })} ` : ""}
                  {lt("pdfNoCheck")}
                </span>
              ) : null}
              {proportionsOff && fileRatio ? (
                <span className="text-(--warn)">
                  {lt("proportions", {
                    file: done.px ? `${done.px.width}×${done.px.height} px` : done.pageCm ? shopLfSizeText(done.pageCm.width, done.pageCm.height, cm) : "",
                    size: sizeLabel,
                  })}
                </span>
              ) : null}
              {proportionsOff && fileRatio && sizeMode === "custom" && canCustom && size ? (
                <button
                  type="button"
                  onClick={() => setHStr(shopLfCm(Math.round((size.widthCm / fileRatio) * 10) / 10))}
                  className="self-start text-sm font-semibold underline"
                >
                  {lt("useFileProportions")}
                </button>
              ) : null}
            </div>
          ) : null}
          {hint && !done ? <span className="text-sm font-semibold text-(--err)">{lt("fileRequired")}</span> : null}
        </div>

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-(--muted)">{t("total")}</span>
              <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
                {total != null && !failedCode ? formatPrice(total, lang) : "—"}
              </span>
            </div>
            {breakdown.length > 1 && !failedCode ? (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm text-(--muted)">
                {breakdown.map((b) => (
                  <li key={b.key} className="flex justify-between gap-3">
                    <span>{b.label}</span>
                    <span>{formatPrice(b.amount, lang)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {total != null && qty > 1 && !failedCode ? (
              <span className="self-end text-sm text-(--muted2)">{t("perPiece", { price: formatPrice(total / qty, lang) })}</span>
            ) : null}
            {failedCode ? (
              <span className="text-sm text-(--err)">
                {problemText(failedCode)}{" "}
                {failedCode === "lf_too_wide" || failedCode === "lf_too_long" ? (
                  <Link href={href(`/shop${SHOP_LF_CATEGORY_PATH}#la-cerere`)} className="font-semibold underline">
                    {lt("onRequest")}
                  </Link>
                ) : null}
              </span>
            ) : null}
            {quote.status === "error" ? <span className="text-sm text-(--err)">{t("priceError")}</span> : null}
            {quote.status === "loading" && quote.rateLimited ? <span className="text-sm text-(--muted2)">{t("priceRetrying")}</span> : null}
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!canAdd}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {added ? `✓ ${t("addedToCart")}` : editLine ? t("updateInCart") : t("addToCart")}
          </button>
          <p aria-live="polite" className={`m-0 text-sm font-semibold ${added ? "" : "sr-only"}`}>
            {added ? (
              <>
                ✓ {t("addedToCart")} — <Link href={href("/shop/cos")}>{t("goToCart")}</Link>
              </>
            ) : null}
          </p>
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            {rule.sizing !== "kit" && rule.sizing !== "preset" && data.minLineMdl > 0 ? (
              <span>{lt("priceNote", { min: formatPrice(data.minLineMdl, lang) })}</span>
            ) : null}
            <span>{t("readyIn")}</span>
            <span>{t("deliveryLine")}</span>
            <span>{t(paymentLive ? "paymentLine" : payOnDelivery ? "paymentLineOnDelivery" : "paymentLineSoon")}</span>
          </div>
        </div>
      </div>

      <AddedToast show={added} />

      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={addToCart}
          disabled={!canAdd}
          className="shop-btn-dark @container min-h-12 flex-1 rounded-xl bg-(--ink) px-3 py-1 text-base font-extrabold disabled:opacity-50"
        >
          <StickyCtaLabel
            label={added ? `✓ ${t("addedToCart")}` : editLine ? t("updateInCart") : t("addToCartShort")}
            price={!added && total != null && !failedCode ? formatPrice(total, lang) : null}
          />
        </button>
      </div>
    </div>
  );
}

function CmInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
        className="w-28 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 py-2.5 text-base font-bold"
      />
    </label>
  );
}

/** The artwork: uploads right away, reads the pixel size (images) or the page size (PDF) for the checks. */
function LfFileUpload({ value, onChange, lt }: { value: FileState | null; onChange: (next: FileState | null) => void; lt: LfT }) {
  const { t } = useShopLang();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const my = ++token.current;
    onChange({ status: "uploading", name: f.name, pct: 0 });
    const pdf: boolean = isPdf(f);
    const measure = pdf
      ? readPdfPageCm(f).then((pageCm) => ({ px: null, pageCm }))
      : readImageSize(f).then((px) => ({ px, pageCm: null }));
    try {
      const ref = await uploadArtwork(f, (pct) => {
        if (token.current === my) onChange({ status: "uploading", name: f.name, pct });
      });
      const [{ px, pageCm }, thumb] = await Promise.all([measure, pdf ? Promise.resolve(null) : makeThumb(f)]);
      if (token.current !== my) return;
      onChange({
        status: "done",
        ref: { ...ref, ...(thumb ? { thumb } : {}), ...(px ? { pixelWidth: px.width, pixelHeight: px.height } : {}) },
        px,
        pageCm,
        previewUrl: px ? URL.createObjectURL(f) : null,
        pdf,
      });
    } catch (e) {
      if (token.current !== my) return;
      onChange({ status: "error", name: f.name, message: e instanceof ShopUploadError && e.code === "too_big" ? t("uploadTooBig") : t("uploadFailed") });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line2) p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-(--muted)">
          <UploadIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b>{lt("fileTitle")}</b>
          {value == null ? <span className="text-sm leading-snug text-(--muted)">{t("uploadOwnText")}</span> : null}
          {value?.status === "uploading" ? (
            <span className="text-sm text-(--muted)" aria-live="polite">
              <span className="block truncate">{value.name}</span>
              {t("uploading", { pct: value.pct })}
            </span>
          ) : null}
          {value?.status === "done" ? <span className="truncate text-sm font-semibold text-(--ok)">✓ {value.ref.fileName}</span> : null}
          {value?.status === "error" ? (
            <span role="alert" className="text-sm text-(--err)">
              {value.message}
            </span>
          ) : null}
        </div>
      </div>
      {value?.status === "uploading" ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-(--soft)" aria-hidden>
          <div className="h-full bg-(--gold) transition-[width]" style={{ width: `${value.pct}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-[10px] bg-(--soft) px-4 text-sm font-bold focus-within:outline-2 focus-within:outline-(--ink)"
        >
          {value?.status === "done" ? t("uploadReplace") : t("uploadChoose")}
          <input ref={inputRef} id={inputId} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {value && value.status !== "uploading" ? (
          <button
            type="button"
            onClick={() => {
              token.current++;
              onChange(null);
            }}
            className="min-h-11 rounded-[10px] px-3 text-sm font-semibold text-(--muted) underline"
          >
            {t("uploadRemove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
