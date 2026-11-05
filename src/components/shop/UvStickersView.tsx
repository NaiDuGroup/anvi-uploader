"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { effectiveDpi } from "@/lib/storefront/dtfPrint";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopFileRef, ShopQuoteLine, ShopUvStickersLine } from "@/lib/storefront/types";
import { readImageSize, ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import { psT, type PsT } from "@/lib/storefront/printShop/text";
import {
  SHOP_UV_FILM_WIDTH_CM,
  SHOP_UV_IMAGE,
  SHOP_UV_MAX_DESIGNS,
  SHOP_UV_MAX_SETS,
  SHOP_UV_MINIMUM_MDL,
  SHOP_UV_STICKERS_SLUG,
  isShopUvStickersLine,
  uvStickerSizeProblem,
  uvStickerZone,
  uvStickerZoneId,
} from "@/lib/storefront/printShop/uvStickers";
import { AddedToast } from "./AddedToast";
import { UploadIcon } from "./ShopIcons";
import { shopNumText } from "@/lib/storefront/sizes";
import { useShopLang } from "./ShopLangProvider";
import { StickyCtaLabel } from "./ProductBits";

const ACCEPT = "image/png,image/jpeg,.png,.jpg,.jpeg";

interface Design {
  id: string;
  file:
    | null
    | { status: "uploading"; name: string; pct: number }
    | { status: "done"; ref: ShopFileRef; px: { width: number; height: number } | null; previewUrl: string | null }
    | { status: "error"; message: string };
  widthStr: string;
  heightStr: string;
}

const num = (s: string): number => Number(s.replace(",", "."));
const fmt = (n: number): string => String(Math.round(n * 10) / 10);

function nextId(designs: readonly Design[]): string {
  for (let n = 1; n <= SHOP_UV_MAX_DESIGNS + 1; n++) {
    const id = uvStickerZoneId(n);
    if (!designs.some((d) => d.id === id)) return id;
  }
  return uvStickerZoneId(designs.length + 1);
}

function initialDesigns(edit: ShopUvStickersLine | null, files: readonly ShopFileRef[]): Design[] {
  if (!edit) return [{ id: uvStickerZoneId(1), file: null, widthStr: "5", heightStr: "5" }];
  return edit.zones.map((z) => {
    const f = files.find((x) => x.zone === z.id);
    return {
      id: z.id,
      file: f ? { status: "done", ref: f, px: f.pixelWidth && f.pixelHeight ? { width: f.pixelWidth, height: f.pixelHeight } : null, previewUrl: f.thumb ?? null } : null,
      widthStr: fmt(z.widthCm),
      heightStr: fmt(z.heightCm),
    };
  });
}

/**
 * UV-DTF stickers (`/p/stickere-uv-dtf`): up to 6 PNG designs with a size
 * each, the number of sets, the live price from the UV engine (film metres).
 */
export function UvStickersView({ editId = null }: { editId?: string | null }) {
  const lines = useCart();
  const hydrated = useHydrated();
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.slug === SHOP_UV_STICKERS_SLUG) ?? null) : null;
  return <UvStickersEditor key={editLine?.id ?? "new"} editLine={editLine} />;
}

function UvStickersEditor({ editLine }: { editLine: CartLine | null }) {
  const { lang, href, paymentLive, t: shopTr } = useShopLang();
  const t: PsT = useMemo(() => psT(lang), [lang]);
  const router = useRouter();
  const editQuote: ShopUvStickersLine | null = editLine && isShopUvStickersLine(editLine.quote) ? editLine.quote : null;
  const [designs, setDesigns] = useState<Design[]>(() => initialDesigns(editQuote, editLine?.files ?? []));
  const [setsStr, setSetsStr] = useState<string>(String(editQuote?.quantity ?? 10));
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState(false);

  const urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
  }, []);

  const sets: number = Math.min(SHOP_UV_MAX_SETS, Math.max(1, Math.round(num(setsStr)) || 1));
  const sizes = designs.map((d) => ({ w: num(d.widthStr), h: num(d.heightStr) }));
  const sizeProblems = sizes.map((s) => uvStickerSizeProblem(s.w, s.h));
  const allSized: boolean = sizeProblems.every((p) => p == null);
  const quoteLine: ShopUvStickersLine | null = useMemo(
    () =>
      allSized
        ? {
            kind: "uv",
            source: "stickers",
            technique: "transfer",
            quantity: sets,
            zones: designs.map((d, i) => uvStickerZone(d.id, sizes[i]!.w, sizes[i]!.h)),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sizes` derives from `designs`
    [allSized, sets, designs],
  );
  const quote = useLiveQuote(quoteLine as ShopQuoteLine | null, lang);
  const total: number | null = quote.status === "done" && quote.line.ok ? quote.line.total : null;
  const failed: boolean = (quote.status === "done" && !quote.line.ok) || quote.status === "error";

  const uploading: boolean = designs.some((d) => d.file?.status === "uploading");
  const missing: Design[] = designs.filter((d) => d.file?.status !== "done");

  const update = (id: string, patch: Partial<Design>) => setDesigns((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  /** A new width keeps the image's proportions (the height follows). */
  const setWidth = (d: Design, widthStr: string) => {
    const px = d.file?.status === "done" ? d.file.px : null;
    const w: number = num(widthStr);
    update(d.id, px && w > 0 ? { widthStr, heightStr: fmt((w * px.height) / px.width) } : { widthStr });
  };
  const setHeight = (d: Design, heightStr: string) => {
    const px = d.file?.status === "done" ? d.file.px : null;
    const h: number = num(heightStr);
    update(d.id, px && h > 0 ? { heightStr, widthStr: fmt((h * px.width) / px.height) } : { heightStr });
  };

  const addToCart = () => {
    if (uploading || !quoteLine) return;
    if (missing.length) {
      setHint(true);
      document.getElementById(`shop-uv-${missing[0]!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const files: ShopFileRef[] = designs.flatMap((d) => (d.file?.status === "done" ? [{ ...d.file.ref, zone: d.id }] : []));
    const first = designs[0]?.file?.status === "done" ? designs[0].file : null;
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: SHOP_UV_STICKERS_SLUG,
      title: t("uvTitle"),
      optionsText: `${sizes.map((s) => `${shopNumText(s.w, lang)}×${shopNumText(s.h, lang)}`).join("; ")} ${lang === "ru" ? "см" : "cm"}`,
      image: first?.ref.thumb ?? SHOP_UV_IMAGE,
      quote: quoteLine as ShopQuoteLine,
      files,
      note: files.map((f, i) => `${t("uvDesign", { n: i + 1 })}: ${f.fileName}`).join("; "),
      lastTotal: total,
      addedAt: editLine?.addedAt ?? Date.now(),
    };
    setHint(false);
    if (editLine) {
      dispatchCart({ type: "update", line });
      router.push(href("/shop/cos"));
      return;
    }
    dispatchCart({ type: "add", line });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 4000);
  };

  const canAdd: boolean = !uploading && !failed && quoteLine != null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{t("uvTitle")}</h1>
        <span className="text-base font-bold text-(--gold-ink)">{t("uvSubtitle")}</span>
        <p className="m-0 text-base leading-relaxed text-(--muted)">{t("uvDescription")}</p>
        <p className="m-0 text-sm text-(--muted2)">{t("uvPngHint")}</p>
        <p className="m-0 text-sm text-(--muted2)">{t("uvPngOnly")}</p>
        {editLine ? (
          <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
            {shopTr("editingLine")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        {designs.map((d, i) => (
          <DesignCard
            key={d.id}
            n={i + 1}
            design={d}
            problem={sizeProblems[i] ?? null}
            t={t}
            canRemove={designs.length > 1}
            onRemove={() => setDesigns((list) => list.filter((x) => x.id !== d.id))}
            onWidth={(v) => setWidth(d, v)}
            onHeight={(v) => setHeight(d, v)}
            onFile={(file) => {
              if (file?.status === "done" && file.previewUrl) urls.current.add(file.previewUrl);
              // A new image: the height follows its proportions at the current width.
              if (file?.status === "done" && file.px) {
                const w: number = num(d.widthStr) || 5;
                update(d.id, { file, widthStr: fmt(w), heightStr: fmt((w * file.px.height) / file.px.width) });
              } else update(d.id, { file });
            }}
          />
        ))}
        {designs.length < SHOP_UV_MAX_DESIGNS ? (
          <button
            type="button"
            onClick={() => setDesigns((list) => [...list, { id: nextId(list), file: null, widthStr: "5", heightStr: "5" }])}
            className="self-start rounded-[10px] border-[1.5px] border-dashed border-(--line2) px-4 py-2.5 font-bold"
          >
            {t("uvAddDesign")}
          </button>
        ) : null}
        <span className={`text-sm ${hint && missing.length ? "font-semibold text-(--err)" : "text-(--muted2)"}`}>
          {hint && missing.length ? t("filesRequired") : t("uvFilesNote")}
        </span>

        <label className="flex flex-col gap-1.5">
          <b className="text-[15px]">{t("uvQty")}</b>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={SHOP_UV_MAX_SETS}
            value={setsStr}
            onChange={(e) => setSetsStr(e.target.value)}
            className="min-h-11 w-36 rounded-[10px] border-[1.5px] border-(--line2) px-3 text-base"
          />
        </label>

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-(--muted)">{shopTr("total")}</span>
              <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
                {total != null ? formatPrice(total, lang) : "—"}
              </span>
            </div>
            <span className="self-end text-sm text-(--muted2)">{t("uvPriceNote", { min: formatPrice(SHOP_UV_MINIMUM_MDL, lang) })}</span>
            {quote.status === "done" && !quote.line.ok ? <span className="text-sm text-(--err)">{shopTr("priceUnavailable")}</span> : null}
            {quote.status === "error" ? <span className="text-sm text-(--err)">{shopTr("priceError")}</span> : null}
            {quote.status === "loading" && quote.rateLimited ? <span className="text-sm text-(--muted2)">{shopTr("priceRetrying")}</span> : null}
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!canAdd}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {added ? `✓ ${shopTr("addedToCart")}` : editLine ? shopTr("updateInCart") : shopTr("addToCart")}
          </button>
          <p aria-live="polite" className={`m-0 text-sm font-semibold ${added ? "" : "sr-only"}`}>
            {added ? (
              <>
                ✓ {shopTr("addedToCart")} — <Link href={href("/shop/cos")}>{shopTr("goToCart")}</Link>
              </>
            ) : null}
          </p>
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            <span>{shopTr("readyIn")}</span>
            <span>{shopTr("deliveryLine")}</span>
            <span>{paymentLive ? shopTr("paymentLine") : shopTr("paymentLineSoon")}</span>
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
            label={added ? `✓ ${shopTr("addedToCart")}` : editLine ? shopTr("updateInCart") : shopTr("addToCartShort")}
            price={!added && total != null ? formatPrice(total, lang) : null}
          />
        </button>
      </div>
    </div>
  );
}

function DesignCard({
  n,
  design,
  problem,
  t,
  canRemove,
  onRemove,
  onWidth,
  onHeight,
  onFile,
}: {
  n: number;
  design: Design;
  problem: "range" | "too_wide" | null;
  t: PsT;
  canRemove: boolean;
  onRemove: () => void;
  onWidth: (v: string) => void;
  onHeight: (v: string) => void;
  onFile: (f: Design["file"]) => void;
}) {
  const { t: shopTr } = useShopLang();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);
  const f = design.file;
  const w: number = num(design.widthStr);
  const h: number = num(design.heightStr);
  const dpi: number | null = f?.status === "done" && f.px && w > 0 && h > 0 ? effectiveDpi(f.px, { widthCm: w, heightCm: h }) : null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      onFile({ status: "error", message: t("uvPngOnly") });
      return;
    }
    const my = ++token.current;
    onFile({ status: "uploading", name: file.name, pct: 0 });
    try {
      const sizeP = readImageSize(file);
      const ref = await uploadArtwork(file, (pct) => {
        if (token.current === my) onFile({ status: "uploading", name: file.name, pct });
      });
      const px = await sizeP;
      if (token.current !== my) return;
      onFile({
        status: "done",
        ref: { ...ref, zone: design.id, ...(px ? { pixelWidth: px.width, pixelHeight: px.height } : {}) },
        px,
        previewUrl: URL.createObjectURL(file),
      });
    } catch (e) {
      if (token.current !== my) return;
      onFile({ status: "error", message: e instanceof ShopUploadError && e.code === "too_big" ? shopTr("uploadTooBig") : shopTr("uploadFailed") });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div id={`shop-uv-${design.id}`} className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-(--line2) p-4">
      <div className="flex items-center justify-between gap-3">
        <b>{t("uvDesign", { n })}</b>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-sm font-semibold text-(--muted) underline">
            {t("uvRemove")}
          </button>
        ) : null}
      </div>
      <div className="flex items-start gap-3">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-(--line2)"
          style={{ background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 12px 12px" }}
        >
          {f?.status === "done" && f.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL / data URL of the chosen file
            <img src={f.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-(--muted)">
              <UploadIcon size={22} />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          {f?.status === "uploading" ? <span className="text-(--muted)">{shopTr("uploading", { pct: f.pct })}</span> : null}
          {f?.status === "done" ? <span className="truncate font-semibold text-(--ok)">✓ {f.ref.fileName}</span> : null}
          {f?.status === "error" ? (
            <span role="alert" className="text-(--err)">
              {f.message}
            </span>
          ) : null}
          {dpi != null ? (
            <span className={dpi < 290 ? "text-(--warn)" : "text-(--muted)"}>
              {dpi < 290 ? t("checkLowDpi", { dpi, px: "—" }) : `~${dpi} dpi`}
            </span>
          ) : null}
          <label
            htmlFor={inputId}
            className="mt-1 inline-flex min-h-11 cursor-pointer items-center self-start rounded-[10px] bg-(--soft) px-4 font-bold focus-within:outline-2 focus-within:outline-(--ink)"
          >
            {f?.status === "done" ? shopTr("uploadReplace") : shopTr("uploadChoose")}
            <input ref={inputRef} id={inputId} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("uvWidth")}
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100}
            step={0.5}
            value={design.widthStr}
            onChange={(e) => onWidth(e.target.value)}
            className="min-h-11 w-28 rounded-[10px] border-[1.5px] border-(--line2) px-3 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("uvHeight")}
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100}
            step={0.5}
            value={design.heightStr}
            onChange={(e) => onHeight(e.target.value)}
            className="min-h-11 w-28 rounded-[10px] border-[1.5px] border-(--line2) px-3 text-base"
          />
        </label>
      </div>
      {problem === "too_wide" ? (
        <span role="alert" className="text-sm text-(--err)">
          {t("uvTooWide", { max: SHOP_UV_FILM_WIDTH_CM })}
        </span>
      ) : null}
    </div>
  );
}
