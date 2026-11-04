"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart } from "@/lib/storefront/cartStore";
import { capZones, printFrame, shirtZones, type ShirtPrintSelection, type ShirtSide } from "@/lib/storefront/dtfPrint";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopT } from "@/lib/storefront/i18n";
import { useLiveQuote, type LiveQuoteState } from "@/lib/storefront/quoteClient";
import type { ShopFileRef, ShopPriceTier, ShopPrintOption, ShopProduct, ShopQuoteLine } from "@/lib/storefront/types";
import { ArtworkUpload, type ArtworkState } from "./ArtworkUpload";
import { OptionPicker, ProductGallery, QtyStepper } from "./ProductBits";
import { CubeIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

function defaultFrontPreset(prints: ShopPrintOption[]): string | null {
  return (prints.find((p) => /^A4/i.test(p.label)) ?? prints[prints.length - 1])?.presetId ?? null;
}

function shortPrintLabel(p: ShopPrintOption): string {
  return p.label;
}

export function ProductView({ product }: { product: ShopProduct }) {
  const { t, lang, href } = useShopLang();

  // ─── Selection state ────────────────────────────────────────────────────
  const optionKeys: string[] =
    product.mode === "simple" ? product.variants.map((v) => v.id) : (product.dtf?.colors.map((c) => c.key) ?? []);
  const [optionKey, setOptionKey] = useState<string>(optionKeys[0] ?? "");
  const [qty, setQty] = useState(1);
  const [sizeQty, setSizeQty] = useState<Record<string, number>>(() => {
    const sizes = product.dtf?.colors[0]?.sizes ?? [];
    const start = sizes.includes("M") ? "M" : sizes[0];
    return start ? { [start]: 1 } : {};
  });
  const prints: ShopPrintOption[] = useMemo(() => product.dtf?.prints ?? [], [product.dtf]);
  const [printSel, setPrintSel] = useState<ShirtPrintSelection>(() => ({ front: defaultFrontPreset(prints), back: null }));
  const [files, setFiles] = useState<Record<string, ArtworkState | null>>({});
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const variant = product.variants.find((v) => v.id === optionKey) ?? product.variants[0];
  const color = product.dtf?.colors.find((c) => c.key === optionKey) ?? product.dtf?.colors[0];
  const isShirt: boolean = product.dtf?.garment === "tshirt";
  const isCap: boolean = product.dtf?.garment === "cap";

  // ─── Quote line ────────────────────────────────────────────────────────
  const quoteLine: ShopQuoteLine | null = useMemo(() => {
    if (product.mode === "simple") {
      if (!variant || !product.simpleKind) return null;
      return { kind: product.simpleKind, productId: variant.id, quantity: qty };
    }
    if (!color || !product.dtf) return null;
    if (isCap) {
      const zone = product.dtf.fixedZone ?? { widthCm: 9, heightCm: 5 };
      return { kind: "dtf", garmentId: color.garmentId, sizes: [{ size: color.sizes[0] ?? "—", quantity: qty }], zones: capZones(zone) };
    }
    const sizes = color.sizes.filter((s) => (sizeQty[s] ?? 0) > 0).map((s) => ({ size: s, quantity: sizeQty[s]! }));
    const zones = shirtZones(printSel, prints);
    if (sizes.length === 0 || zones.length === 0) return null;
    return { kind: "dtf", garmentId: color.garmentId, sizes, zones };
  }, [product, variant, color, isCap, qty, sizeQty, printSel, prints]);

  const quote = useLiveQuote(quoteLine, lang);
  const pieces: number = quoteLine ? (quoteLine.kind === "dtf" ? quoteLine.sizes.reduce((s, x) => s + x.quantity, 0) : quoteLine.quantity) : 0;

  // ─── Files ─────────────────────────────────────────────────────────────
  const zoneKeys: string[] = isShirt
    ? (["front", "back"] as const).filter((z) => printSel[z] != null)
    : ["main"];
  const uploading: boolean = zoneKeys.some((z) => files[z]?.status === "uploading");
  const doneFiles: ShopFileRef[] = zoneKeys.flatMap((z) => {
    const f = files[z];
    return f?.status === "done" ? [{ ...f.ref, ...(isShirt ? { zone: z } : {}) }] : [];
  });

  // ─── Texts ─────────────────────────────────────────────────────────────
  const optionsText: string = useMemo(() => {
    const parts: string[] = [];
    if (product.mode === "simple") {
      if (variant && product.variants.length > 1) parts.push(variant.label);
    } else if (color) {
      parts.push(color.label);
      if (isShirt) {
        parts.push(
          color.sizes
            .filter((s) => (sizeQty[s] ?? 0) > 0)
            .map((s) => `${s}×${sizeQty[s]}`)
            .join(", "),
        );
        const f = prints.find((p) => p.presetId === printSel.front);
        const b = prints.find((p) => p.presetId === printSel.back);
        if (f) parts.push(`${t("zoneFront")}: ${shortPrintLabel(f)}`);
        if (b) parts.push(`${t("zoneBack")}: ${shortPrintLabel(b)}`);
      } else if (isCap && product.dtf?.fixedZone) {
        parts.push(`logo ${product.dtf.fixedZone.widthCm}×${product.dtf.fixedZone.heightCm} cm`);
      }
    }
    return parts.filter(Boolean).join(" · ");
  }, [product, variant, color, isShirt, isCap, sizeQty, prints, printSel, t]);

  const images: string[] = (product.mode === "simple" ? variant?.images : color?.images) ?? [];

  // ─── Add to cart ───────────────────────────────────────────────────────
  const canAdd: boolean = quoteLine != null && !uploading && !(quote.status === "done" && !quote.line.ok);
  const addToCart = () => {
    if (!quoteLine) {
      setHint(isShirt && Object.values(sizeQty).every((q) => !q) ? t("chooseAtLeastOneSize") : t("chooseAtLeastOneZone"));
      return;
    }
    if (uploading) return;
    const line: CartLine = {
      id: newLineId(),
      slug: product.slug,
      title: product.name,
      optionsText,
      image: images[0] ?? product.image,
      quote: quoteLine,
      files: doneFiles,
      ...(isShirt && doneFiles.length
        ? { note: doneFiles.map((f) => `${f.zone === "back" ? t("zoneBack") : t("zoneFront")}: ${f.fileName}`).join("; ") }
        : {}),
      lastTotal: quote.status === "done" && quote.line.ok ? quote.line.total : null,
      addedAt: Date.now(),
    };
    dispatchCart({ type: "add", line });
    setHint(null);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  };

  // ─── Print frame on the T-shirt photo ──────────────────────────────────
  const frontPrint = prints.find((p) => p.presetId === printSel.front);
  const overlay = isShirt && frontPrint ? <PrintFrame print={frontPrint} side="front" /> : null;

  const priceTotal: number | null = quote.status === "done" && quote.line.ok ? quote.line.total : quote.status === "loading" && quote.previous?.ok ? quote.previous.total : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="lg:sticky lg:top-4">
        <ProductGallery key={optionKey} images={images} alt={`${product.name} — ${variant?.label ?? color?.label ?? ""}`} overlay={overlay} />
        {isShirt ? <p className="mt-2 text-sm text-(--muted2)">{t("printFrameHint")}</p> : null}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {product.badge ? (
            <span className="self-start rounded-full bg-(--gold) px-2.5 py-1 text-xs font-bold text-(--ink)">{product.badge}</span>
          ) : null}
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{product.name}</h1>
          <p className="m-0 text-base leading-relaxed text-(--muted)">{product.description}</p>
        </div>

        {optionKeys.length > 0 ? (
          <OptionPicker
            title={
              product.mode === "simple" && new Set(product.variants.map((v) => v.hex)).size === 1 && product.variants.length > 1
                ? t("variantWithName", { name: variant?.label ?? "" })
                : t("colorWithName", { name: (product.mode === "simple" ? variant?.label : color?.label) ?? "" })
            }
            options={
              product.mode === "simple"
                ? product.variants.map((v) => ({ key: v.id, label: v.label, hex: v.hex }))
                : (product.dtf?.colors ?? []).map((c) => ({ key: c.key, label: c.label, hex: c.hex }))
            }
            value={optionKey}
            onChange={setOptionKey}
          />
        ) : null}

        {isShirt && color ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-[15px] font-bold">{t("sizeShirt")}</legend>
            <span className="text-sm text-(--muted2)">{t("sizeShirtHint")}</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {color.sizes.map((s) => {
                const q: number = sizeQty[s] ?? 0;
                return (
                  <div
                    key={s}
                    className={`flex items-center justify-between gap-2 rounded-xl border-[1.5px] py-1.5 pr-1.5 pl-3 ${q > 0 ? "border-(--ink)" : "border-(--line)"}`}
                  >
                    <b className="text-[15px]">{s}</b>
                    <QtyStepper size="sm" min={0} value={q} label={s} onChange={(v) => setSizeQty((m) => ({ ...m, [s]: v }))} />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {isShirt ? (
          <ShirtPrintPicker prints={prints} value={printSel} onChange={setPrintSel} lang={lang} t={t} />
        ) : null}
        {isCap ? <p className="m-0 rounded-xl bg-(--soft) px-4 py-3 text-sm font-semibold">{t("capLogo")}</p> : null}

        <div className="flex flex-col gap-2.5">
          <b className="text-[15px]">{t("design")}</b>
          <div className={`grid gap-3 ${product.editorHref ? "sm:grid-cols-2" : ""}`}>
            {product.editorHref ? (
              <a
                href={product.editorHref}
                className="flex flex-col gap-1.5 rounded-[14px] border-2 border-(--ink) p-4 no-underline"
              >
                <b className="flex items-center gap-2">
                  <CubeIcon size={20} /> {t("createInEditor")}
                </b>
                <span className="text-sm leading-snug text-(--muted)">{t("createInEditorText")}</span>
                <span className="text-xs leading-snug text-(--muted2)">{t("editorNote")}</span>
              </a>
            ) : null}
            {zoneKeys.map((z) => {
              const p = z === "back" ? prints.find((x) => x.presetId === printSel.back) : z === "front" ? frontPrint : null;
              const cm = p ? { widthCm: p.widthCm, heightCm: p.heightCm } : isCap ? (product.dtf?.fixedZone ?? null) : product.printAreaCm;
              return (
                <ArtworkUpload
                  key={z}
                  label={isShirt ? t("zoneFile", { zone: z === "back" ? t("zoneBack") : t("zoneFront") }) : t("uploadOwn")}
                  value={files[z] ?? null}
                  onChange={(next) => setFiles((m) => ({ ...m, [z]: next }))}
                  printCm={cm}
                  printLabel={p ? shortPrintLabel(p) : cm ? `${cm.widthCm}×${cm.heightCm} cm` : ""}
                />
              );
            })}
          </div>
          <span className="text-sm text-(--muted2)">{t("uploadLater")}</span>
        </div>

        {!isShirt ? (
          <div className="flex flex-wrap items-center gap-4">
            <b className="text-[15px]">{t("quantity")}</b>
            <QtyStepper value={qty} onChange={setQty} label={t("quantity")} />
            <span className="text-sm text-(--muted2)">
              {t("bulkHint")} <Link href={href("/shop/companii")}>{t("bulkLink")}</Link>
            </span>
          </div>
        ) : null}

        {variant?.tiers && variant.tiers.length > 0 ? <TierTable tiers={variant.tiers} qty={qty} t={t} lang={lang} /> : null}

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <PriceLine quote={quote} total={priceTotal} pieces={pieces} t={t} lang={lang} />
          {hint ? (
            <p role="alert" className="m-0 text-sm font-semibold text-(--err)">
              {hint}
            </p>
          ) : null}
          <button
            type="button"
            onClick={addToCart}
            disabled={!canAdd && quoteLine != null}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {added ? `✓ ${t("addedToCart")}` : t("addToCart")}
          </button>
          <AddedNote added={added} t={t} />
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            <span>{t("readyIn")}</span>
            <span>{t("deliveryLine")}</span>
            <span>{t("paymentLine")}</span>
          </div>
        </div>
      </div>

      {/* Phone: sticky add-to-cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        {!isShirt ? <QtyStepper value={qty} onChange={setQty} label={t("quantity")} /> : null}
        <button
          type="button"
          onClick={addToCart}
          disabled={!canAdd && quoteLine != null}
          className="shop-btn-dark min-h-12 flex-1 rounded-xl bg-(--ink) px-3 text-base font-extrabold disabled:opacity-50"
        >
          {added ? `✓ ${t("addedToCart")}` : t("addToCartShort")}
          {!added && priceTotal != null ? ` · ${formatPrice(priceTotal, lang)}` : ""}
        </button>
      </div>
    </div>
  );
}

function AddedNote({ added, t }: { added: boolean; t: ShopT }) {
  const { href } = useShopLang();
  return (
    <p aria-live="polite" className={`m-0 text-sm font-semibold ${added ? "" : "sr-only"}`}>
      {added ? (
        <>
          ✓ {t("addedToCart")} — <Link href={href("/shop/cos")}>{t("goToCart")}</Link>
        </>
      ) : null}
    </p>
  );
}

function TierTable({ tiers, qty, t, lang }: { tiers: ShopPriceTier[]; qty: number; t: ShopT; lang: "ro" | "ru" }) {
  return (
    <div className="flex flex-col gap-2">
      <b className="text-[15px]">{t("tierTitle")}</b>
      <table className="w-full max-w-sm border-collapse text-sm">
        <thead>
          <tr className="text-left text-(--muted2)">
            <th className="py-1 pr-4 font-semibold">{t("tierQty")}</th>
            <th className="py-1 text-right font-semibold">{t("tierPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => {
            const current: boolean = qty >= tier.minQty && (tier.maxQty == null || qty <= tier.maxQty);
            const range: string =
              tier.maxQty == null
                ? t("tierFrom", { from: tier.minQty })
                : tier.maxQty === tier.minQty
                  ? String(tier.minQty)
                  : t("tierRange", { from: tier.minQty, to: tier.maxQty });
            return (
              <tr key={tier.minQty} className={`border-t border-(--line) ${current ? "font-bold" : ""}`} aria-current={current || undefined}>
                <td className="py-1 pr-4 tabular-nums">{range}</td>
                <td className="py-1 text-right tabular-nums">{formatPrice(tier.price, lang)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <span className="text-xs text-(--muted2)">{t("tierNote")}</span>
    </div>
  );
}

function PriceLine({
  quote,
  total,
  pieces,
  t,
  lang,
}: {
  quote: LiveQuoteState;
  total: number | null;
  pieces: number;
  t: ShopT;
  lang: "ro" | "ru";
}) {
  const failed = quote.status === "done" && !quote.line.ok;
  const ok = quote.status === "done" && quote.line.ok ? quote.line : null;
  return (
    <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-(--muted)">{t("total")}</span>
        <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
          {total != null ? formatPrice(total, lang) : failed || quote.status === "error" ? "—" : "…"}
        </span>
      </div>
      {ok && pieces > 1 ? (
        <span className="self-end text-sm text-(--muted2)">{t("perPiece", { price: formatPrice(ok.unitPrice, lang) })}</span>
      ) : null}
      {ok?.breakdown ? (
        <span className="self-end text-right text-sm text-(--muted2)">
          {ok.breakdown.map((b) => `${b.label} ${formatPrice(b.amount, lang)}`).join(" + ")}
        </span>
      ) : null}
      {quote.status === "loading" && total == null ? <span className="text-sm text-(--muted2)">{t("priceLoading")}</span> : null}
      {failed ? <span className="text-sm text-(--err)">{t("priceUnavailable")}</span> : null}
      {quote.status === "error" ? <span className="text-sm text-(--err)">{t("priceError")}</span> : null}
    </div>
  );
}

function PrintFrame({ print, side }: { print: ShopPrintOption; side: ShirtSide }) {
  const f = printFrame(print, side);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute grid -translate-x-1/2 place-items-center rounded-md border-2 border-dashed border-(--gold-ink) bg-[rgba(205,172,33,0.14)] text-xs font-bold text-(--gold-ink)"
      style={{ left: `${f.leftPct}%`, top: `${f.topPct}%`, width: `${f.widthPct}%`, aspectRatio: f.aspect }}
    >
      {print.label.split(" ")[0]}
    </div>
  );
}

function ShirtPrintPicker({
  prints,
  value,
  onChange,
  lang,
  t,
}: {
  prints: ShopPrintOption[];
  value: ShirtPrintSelection;
  onChange: (v: ShirtPrintSelection) => void;
  lang: "ro" | "ru";
  t: ShopT;
}) {
  return (
    <div className="flex flex-col gap-4">
      {(["front", "back"] as const).map((side) => (
        <fieldset key={side} className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">
            {t("printSize")} — {side === "front" ? t("zoneFront") : t("zoneBack")}
          </legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={value[side] == null}
              onClick={() => onChange({ ...value, [side]: null })}
              className={`min-h-11 rounded-xl border-[1.5px] px-3.5 text-sm font-bold ${
                value[side] == null ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
              }`}
            >
              {t("zoneNone")}
            </button>
            {prints.map((p) => {
              const on: boolean = value[side] === p.presetId;
              return (
                <button
                  key={p.presetId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, [side]: p.presetId })}
                  className={`flex min-h-11 flex-col items-start justify-center rounded-xl border-[1.5px] px-3.5 py-1.5 text-left ${
                    on ? "border-(--gold-ink) bg-[#fbf5dc]" : "border-(--line2) bg-white"
                  }`}
                >
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className="text-xs text-(--muted2)">+{formatPrice(p.price, lang)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
