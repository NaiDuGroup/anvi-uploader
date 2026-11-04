"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CART_MAX_QTY, lineQuantity, newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import {
  capZones,
  firstDiscountQty,
  itemZones,
  printFrame,
  printUnitPrice,
  shirtZones,
  type ShirtPrintSelection,
  type ShirtSide,
} from "@/lib/storefront/dtfPrint";
import { kindNeedsFile, simpleQuoteKind } from "@/lib/storefront/fileRules";
import { productEditorKind, shopEditorPath } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang, ShopT } from "@/lib/storefront/i18n";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote, type LiveQuoteState } from "@/lib/storefront/quoteClient";
import { simpleQuoteLine } from "@/lib/storefront/quoteLine";
import { colorInStock, inStock, maxOrderQty, quoteVariantId, showsLowStock } from "@/lib/storefront/stock";
import type {
  ShopDtfColor,
  ShopDtfItemZone,
  ShopFileRef,
  ShopPriceTier,
  ShopPrintDiscount,
  ShopPrintOption,
  ShopProduct,
  ShopQuoteLine,
  ShopVariant,
} from "@/lib/storefront/types";
import { ArtworkUpload, type ArtworkState } from "./ArtworkUpload";
import { OptionPicker, ProductGallery, QtyStepper } from "./ProductBits";
import { CubeIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

function defaultFrontPreset(prints: ShopPrintOption[]): string | null {
  return (prints.find((p) => /^A4/i.test(p.label)) ?? prints[prints.length - 1])?.presetId ?? null;
}

/** Bag / toy: the first zone gets the smallest format (a logo), the others none. */
function defaultItemSelection(prints: ShopPrintOption[], zones: readonly ShopDtfItemZone[]): ShirtPrintSelection {
  const smallest: string | null =
    [...prints].sort((a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm)[0]?.presetId ?? null;
  const first = zones[0]?.side ?? "front";
  return { front: first === "front" ? smallest : null, back: first === "back" ? smallest : null };
}

/** Label of a print zone («Față», «Pe tricoul jucăriei»). */
function sideLabelOf(sides: readonly { side: string; label: string }[], side: string): string {
  return sides.find((s) => s.side === side)?.label ?? side;
}

/** Product family flags of a DTF product (none for simple products). */
function dtfFlags(product: ShopProduct) {
  const g = product.dtf?.garment;
  return { isShirt: g === "tshirt", isCap: g === "cap", isItem: g === "item", oneSize: g === "cap" || g === "item" };
}

/** Selection state of the product page, fresh or from a cart line being edited. */
interface Initial {
  optionKey: string;
  qty: number;
  sizeQty: Record<string, number>;
  printSel: ShirtPrintSelection;
  files: Record<string, ArtworkState | null>;
}

/** First size to pre-select: M when it can be ordered, else the first size in stock. */
function startSize(color: ShopDtfColor | undefined): string | undefined {
  if (!color) return undefined;
  const ok = color.sizes.filter((s) => inStock(color.sizeStock[s]));
  return ok.includes("M") ? "M" : ok[0];
}

/** Pieces per size kept within each size's stock (sold-out sizes dropped). */
function clampSizes(color: ShopDtfColor | undefined, sizeQty: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!color) return out;
  for (const s of color.sizes) {
    const q: number = Math.min(sizeQty[s] ?? 0, maxOrderQty(color.sizeStock[s], CART_MAX_QTY));
    if (q > 0) out[s] = q;
  }
  return out;
}

/** Most pieces of one option (variant, or the only size of a cap / bag / toy colour). */
function optionMax(variant: ShopVariant | undefined, color: ShopDtfColor | undefined, oneSize: boolean): number {
  if (variant) return maxOrderQty(variant.stock, CART_MAX_QTY);
  if (oneSize && color) return maxOrderQty(color.sizeStock[color.sizes[0] ?? ""], CART_MAX_QTY);
  return CART_MAX_QTY;
}

function initialState(product: ShopProduct, line: CartLine | null): Initial {
  const prints: ShopPrintOption[] = product.dtf?.prints ?? [];
  const zones: ShopDtfItemZone[] = product.dtf?.itemZones ?? [];
  const { isCap, isItem } = dtfFlags(product);
  const firstVariant: ShopVariant | undefined = product.variants.find((v) => inStock(v.stock)) ?? product.variants[0];
  const firstColor: ShopDtfColor | undefined = product.dtf?.colors.find(colorInStock) ?? product.dtf?.colors[0];
  const firstKey: string = product.mode === "simple" ? (firstVariant?.id ?? "") : (firstColor?.key ?? "");
  const fresh = (): Initial => {
    const start = startSize(firstColor);
    return {
      optionKey: firstKey,
      qty: 1,
      sizeQty: start ? { [start]: 1 } : {},
      printSel: isItem ? defaultItemSelection(prints, zones) : { front: defaultFrontPreset(prints), back: null },
      files: {},
    };
  };
  if (!line) return fresh();
  const q = line.quote;
  const done = (f: ShopFileRef): ArtworkState => ({ status: "done", ref: f, px: null });
  if (q.kind !== "dtf") {
    const id: string | null = quoteVariantId(q);
    const v = product.variants.find((x) => x.id === id);
    if (!v) return fresh();
    return {
      ...fresh(),
      optionKey: v.id,
      qty: Math.max(1, Math.min(q.quantity, optionMax(v, undefined, false))),
      files: line.files[0] ? { main: done(line.files[0]) } : {},
    };
  }
  const color = product.dtf?.colors.find((c) => c.garmentId === q.garmentId);
  if (!color) return fresh();
  if (isCap) {
    return {
      ...fresh(),
      optionKey: color.key,
      qty: Math.max(1, Math.min(lineQuantity(q), optionMax(undefined, color, true))),
      files: line.files[0] ? { main: done(line.files[0]) } : {},
    };
  }
  const asked: Record<string, number> = {};
  for (const s of q.sizes) asked[s.size] = s.quantity;
  const sizeQty: Record<string, number> = clampSizes(color, asked);
  const front = q.zones.find((z) => z.id !== "back")?.presetId ?? null;
  const back = q.zones.find((z) => z.id === "back")?.presetId ?? null;
  const files: Record<string, ArtworkState | null> = {};
  for (const f of line.files) {
    const zone: string = f.zone === "back" ? "back" : "front";
    if (!files[zone]) files[zone] = done(f);
  }
  if (isItem) {
    return {
      ...fresh(),
      optionKey: color.key,
      qty: Math.max(1, Math.min(lineQuantity(q), optionMax(undefined, color, true))),
      printSel: { front, back },
      files,
    };
  }
  return { optionKey: color.key, qty: 1, sizeQty, printSel: { front, back }, files };
}

/**
 * Product page configurator. With `editId` (from «Editează» in the cart) it
 * opens that cart line's configuration and saves back into the same line.
 */
export function ProductView({ product, editId = null }: { product: ShopProduct; editId?: string | null }) {
  const lines = useCart();
  const hydrated = useHydrated();
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.slug === product.slug) ?? null) : null;
  return <ProductEditor key={editLine?.id ?? "new"} product={product} editLine={editLine} />;
}

function ProductEditor({ product, editLine }: { product: ShopProduct; editLine: CartLine | null }) {
  const { t, lang, href, paymentLive } = useShopLang();
  const router = useRouter();
  const init = useMemo(() => initialState(product, editLine), [product, editLine]);

  // ─── Selection state ────────────────────────────────────────────────────
  const optionKeys: string[] =
    product.mode === "simple" ? product.variants.map((v) => v.id) : (product.dtf?.colors.map((c) => c.key) ?? []);
  const [optionKey, setOptionKeyRaw] = useState<string>(init.optionKey);
  const [qty, setQty] = useState(init.qty);
  const [sizeQty, setSizeQty] = useState<Record<string, number>>(init.sizeQty);
  const prints: ShopPrintOption[] = useMemo(() => product.dtf?.prints ?? [], [product.dtf]);
  const [printSel, setPrintSel] = useState<ShirtPrintSelection>(init.printSel);
  const [files, setFiles] = useState<Record<string, ArtworkState | null>>(init.files);
  const [added, setAdded] = useState(false);
  /** Which validation message was asked for; it only shows while it is still true. */
  const [hint, setHint] = useState<"sizes" | "zones" | "file" | null>(null);

  const variant = product.variants.find((v) => v.id === optionKey) ?? product.variants[0];
  const color = product.dtf?.colors.find((c) => c.key === optionKey) ?? product.dtf?.colors[0];
  const { isShirt, isCap, isItem, oneSize } = dtfFlags(product);
  const zonesOfItem: ShopDtfItemZone[] = useMemo(() => product.dtf?.itemZones ?? [], [product.dtf]);
  /** Print zones the visitor picks formats for: T-shirt front / back, or the item's own. */
  const printSides: { side: ShirtSide; label: string }[] = isItem
    ? zonesOfItem.map((z) => ({ side: z.side, label: z.label }))
    : [
        { side: "front", label: t("zoneFront") },
        { side: "back", label: t("zoneBack") },
      ];

  const labels = useMemo(() => buildLineLabels([product]), [product]);

  const sizesPicked: number = color ? color.sizes.reduce((s, size) => s + (sizeQty[size] ?? 0), 0) : 0;
  const noSizes: boolean = isShirt && sizesPicked === 0;
  const noZones: boolean = (isShirt || isItem) && printSel.front == null && printSel.back == null;

  // ─── Quote line ────────────────────────────────────────────────────────
  const quoteLine: ShopQuoteLine | null = useMemo(() => {
    if (product.mode === "simple") {
      if (!variant || !product.simpleKind) return null;
      return simpleQuoteLine(product.simpleKind, variant, qty);
    }
    if (!color || !product.dtf) return null;
    if (isCap) {
      const zone = product.dtf.fixedZone ?? { widthCm: 9, heightCm: 5 };
      return { kind: "dtf", garmentId: color.garmentId, sizes: [{ size: color.sizes[0] ?? "—", quantity: qty }], zones: capZones(zone) };
    }
    if (isItem) {
      const zones = itemZones(printSel, zonesOfItem, prints);
      if (zones.length === 0) return null;
      return { kind: "dtf", garmentId: color.garmentId, sizes: [{ size: color.sizes[0] ?? "—", quantity: qty }], zones };
    }
    const sizes = color.sizes.filter((s) => (sizeQty[s] ?? 0) > 0).map((s) => ({ size: s, quantity: sizeQty[s]! }));
    const zones = shirtZones(printSel, prints);
    if (sizes.length === 0 || zones.length === 0) return null;
    return { kind: "dtf", garmentId: color.garmentId, sizes, zones };
  }, [product, variant, color, isCap, isItem, zonesOfItem, qty, sizeQty, printSel, prints]);

  const quote = useLiveQuote(quoteLine, lang);

  // ─── Stock ─────────────────────────────────────────────────────────────
  /** Most pieces of the picked option (variant / cap colour); 0 = sold out. */
  const maxQty: number = optionMax(product.mode === "simple" ? variant : undefined, color, oneSize);
  const optionSoldOut: boolean = product.mode === "simple" || oneSize ? maxQty === 0 : color ? !colorInStock(color) : false;
  /** Balance shown under the quantity («Disponibil: N buc.») — simple products, caps, bags and toys. */
  const optionStock: number | null | undefined =
    product.mode === "simple" ? variant?.stock : oneSize && color ? color.sizeStock[color.sizes[0] ?? ""] : undefined;
  /** Another option: the quantity (or each size) shrinks to what it has in stock. */
  const setOptionKey = (key: string) => {
    setOptionKeyRaw(key);
    if (product.mode === "simple") {
      const max: number = optionMax(product.variants.find((v) => v.id === key), undefined, false);
      if (max > 0 && qty > max) setQty(max);
      return;
    }
    const next = product.dtf?.colors.find((c) => c.key === key);
    if (oneSize) {
      const max: number = optionMax(undefined, next, true);
      if (max > 0 && qty > max) setQty(max);
      return;
    }
    const kept = clampSizes(next, sizeQty);
    const start = startSize(next);
    setSizeQty(Object.keys(kept).length || !start ? kept : { [start]: 1 });
  };
  const pieces: number = quoteLine ? lineQuantity(quoteLine) : isShirt ? sizesPicked : qty;

  // ─── Files ─────────────────────────────────────────────────────────────
  /** One file per printed zone (T-shirt, bag, toy); else one file. */
  const perZone: boolean = isShirt || isItem;
  const zoneKeys: string[] = perZone
    ? (["front", "back"] as const).filter((z) => printSel[z] != null && printSides.some((s) => s.side === z))
    : ["main"];
  const uploading: boolean = zoneKeys.some((z) => files[z]?.status === "uploading");
  const doneFiles: ShopFileRef[] = zoneKeys.flatMap((z) => {
    const f = files[z];
    return f?.status === "done" ? [{ ...f.ref, ...(perZone ? { zone: z } : {}) }] : [];
  });

  const images: string[] = (product.mode === "simple" ? variant?.images : color?.images) ?? [];
  const lifestyleImages: string[] = (product.mode === "simple" ? variant?.lifestyleImages : color?.lifestyleImages) ?? [];

  /** Mug / notebook / pen / UV item: the order needs a design file (same rule as the checkout API). */
  const needsFile: boolean = product.simpleKind != null && kindNeedsFile(simpleQuoteKind(product.simpleKind));
  const noFile: boolean = needsFile && doneFiles.length === 0;

  // ─── Add to cart ───────────────────────────────────────────────────────
  const canAdd: boolean =
    quoteLine != null && product.available && !optionSoldOut && !uploading && !(quote.status === "done" && !quote.line.ok);
  const addToCart = () => {
    if (!product.available || optionSoldOut) return;
    if (!quoteLine) {
      setHint(noSizes ? "sizes" : "zones");
      return;
    }
    if (uploading) return;
    if (noFile) {
      setHint("file");
      document.getElementById("shop-artwork")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const text = describeQuoteLine(quoteLine, labels, t);
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: product.slug,
      title: text?.title ?? product.name,
      optionsText: text?.optionsText ?? "",
      image: images[0] ?? product.image,
      quote: quoteLine,
      files: doneFiles,
      ...(perZone && doneFiles.length
        ? { note: doneFiles.map((f) => `${sideLabelOf(printSides, f.zone === "back" ? "back" : "front")}: ${f.fileName}`).join("; ") }
        : {}),
      lastTotal: quote.status === "done" && quote.line.ok ? quote.line.total : null,
      // An editor-made line keeps its design while its print file stays (a new upload replaces the design).
      ...(editLine?.design && doneFiles.length === 1 && doneFiles[0]!.fileKey === editLine.files[0]?.fileKey
        ? { design: editLine.design, image: editLine.image }
        : {}),
      // Runs in the click handler, not during render.
      // eslint-disable-next-line react-hooks/purity
      addedAt: editLine?.addedAt ?? Date.now(),
    };
    setHint(null);
    if (editLine) {
      dispatchCart({ type: "update", line });
      router.push(href("/shop/cos"));
      return;
    }
    dispatchCart({ type: "add", line });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  };

  // ─── Print frame on the T-shirt photo ──────────────────────────────────
  const frontPrint = prints.find((p) => p.presetId === printSel.front);
  const overlay = isShirt && frontPrint ? <PrintFrame print={frontPrint} side="front" /> : null;

  const priceTotal: number | null =
    quote.status === "done" && quote.line.ok
      ? quote.line.total
      : quote.status === "loading" && quote.previous?.ok
        ? quote.previous.total
        : null;

  const hintText: string | null =
    hint === "sizes" && noSizes
      ? t("chooseAtLeastOneSize")
      : hint === "zones" && noZones
        ? t("chooseAtLeastOneZone")
        : hint === "file" && noFile && !uploading
          ? t("fileRequired")
          : null;
  /** Why there is no price yet (shown instead of «…»). */
  const idleHint: string | null = quoteLine ? null : noSizes ? t("chooseAtLeastOneSize") : noZones ? t("chooseWhereToPrint") : null;

  const tiers: ShopPriceTier[] | undefined = product.mode === "simple" ? variant?.tiers : color?.tiers;
  const tiered: boolean = product.unitFrom != null;
  /** Price of one piece (the first run tier): the main price in the header, «de la …/buc. la tiraj» below it. */
  const onePiecePrice: number | null = tiers?.find((tier) => tier.minQty <= 1)?.price ?? null;
  const addLabel: string = editLine ? t("updateInCart") : t("addToCart");
  /** «Creează în editor»: the storefront's own editor, on the picked colour (its cart, its checkout). */
  const editorKind = productEditorKind(product);
  const editorLink: string | null = editorKind
    ? href(shopEditorPath(editorKind, { slug: product.slug, variant: product.mode === "simple" ? optionKey : null }))
    : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="lg:sticky lg:top-4">
        <ProductGallery key={optionKey} images={images} lifestyle={lifestyleImages} alt={`${product.name} — ${variant?.label ?? color?.label ?? ""}`} overlay={overlay} />
        {isShirt ? <p className="mt-2 text-sm text-(--muted2)">{t("printFrameHint")}</p> : null}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {product.badge ? (
            <span className="self-start rounded-full bg-(--gold) px-2.5 py-1 text-xs font-bold text-(--ink)">{product.badge}</span>
          ) : null}
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{product.name}</h1>
          {product.unitFrom != null ? (
            onePiecePrice != null && onePiecePrice > product.unitFrom ? (
              <span className="flex flex-col gap-0.5">
                <span className="text-xl font-extrabold">{t("perPiece", { price: formatPrice(onePiecePrice, lang) })}</span>
                <span className="text-sm font-semibold text-(--gold-ink)">
                  {t("fromPerPiece", { price: formatPrice(product.unitFrom, lang) })}
                </span>
              </span>
            ) : (
              <span className="text-base font-bold text-(--gold-ink)">
                {t("fromPerPiece", { price: formatPrice(product.unitFrom, lang) })}
              </span>
            )
          ) : null}
          <p className="m-0 text-base leading-relaxed text-(--muted)">{product.description}</p>
          {editLine ? (
            <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
              {t("editingLine")}
            </p>
          ) : null}
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
                ? product.variants.map((v) => ({
                    key: v.id,
                    label: v.label,
                    hex: v.hex,
                    disabled: !inStock(v.stock),
                    disabledLabel: t("optionOutOfStock", { name: v.label }),
                  }))
                : (product.dtf?.colors ?? []).map((c) => ({
                    key: c.key,
                    label: c.label,
                    hex: c.hex,
                    disabled: !colorInStock(c),
                    disabledLabel: t("optionOutOfStock", { name: c.label }),
                  }))
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
                const left: number | undefined = color.sizeStock[s];
                const soldOut: boolean = !inStock(left);
                return (
                  <div
                    key={s}
                    className={`flex items-center justify-between gap-2 rounded-xl border-[1.5px] py-1.5 pr-1.5 pl-3 ${q > 0 ? "border-(--ink)" : "border-(--line)"} ${soldOut ? "opacity-60" : ""}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <b className={`text-[15px] ${soldOut ? "line-through" : ""}`}>{s}</b>
                      {soldOut ? (
                        <span className="text-xs text-(--muted2)">{t("outOfStock")}</span>
                      ) : showsLowStock(left) ? (
                        <span className="text-xs font-semibold text-(--warn)">{t("stockLeft", { n: left })}</span>
                      ) : null}
                    </span>
                    <QtyStepper
                      size="sm"
                      min={0}
                      max={maxOrderQty(left, CART_MAX_QTY)}
                      value={q}
                      label={soldOut ? `${t("sizeShirt")}: ${s} — ${t("outOfStock")}` : `${t("sizeShirt")}: ${s}`}
                      onChange={(v) => setSizeQty((m) => ({ ...m, [s]: v }))}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {isShirt || isItem ? (
          <ShirtPrintPicker
            prints={prints}
            sides={printSides}
            value={printSel}
            onChange={setPrintSel}
            pieces={Math.max(1, isItem ? qty : sizesPicked)}
            discount={product.dtf?.printDiscount ?? null}
            pressFeeMdl={product.dtf?.pressFeeMdl ?? 0}
            lang={lang}
            t={t}
          />
        ) : null}
        {isCap ? <p className="m-0 rounded-xl bg-(--soft) px-4 py-3 text-sm font-semibold">{t("capLogo")}</p> : null}

        <div id="shop-artwork" className="flex flex-col gap-2.5">
          <b className="text-[15px]">{t("design")}</b>
          <div className={`grid gap-3 ${editorLink ? "sm:grid-cols-2" : ""}`}>
            {editorLink ? (
              <Link
                href={editorLink}
                aria-label={`${t("createInEditor")} — ${product.name}`}
                aria-describedby="shop-editor-note"
                className="flex flex-col gap-1.5 rounded-[14px] border-2 border-(--ink) p-4 no-underline"
              >
                <b className="flex items-center gap-2">
                  <CubeIcon size={20} /> {t("createInEditor")}
                </b>
                <span className="text-sm leading-snug text-(--muted)">{t("createInEditorText")}</span>
                <span id="shop-editor-note" className="text-xs leading-snug text-(--muted2)">
                  {t("editorNote")}
                </span>
              </Link>
            ) : null}
            {zoneKeys.map((z) => {
              const p = z === "back" ? prints.find((x) => x.presetId === printSel.back) : z === "front" ? frontPrint : null;
              const cm = p ? { widthCm: p.widthCm, heightCm: p.heightCm } : isCap ? (product.dtf?.fixedZone ?? null) : product.printAreaCm;
              return (
                <ArtworkUpload
                  key={z}
                  label={perZone ? t("zoneFile", { zone: sideLabelOf(printSides, z) }) : t("uploadOwn")}
                  value={files[z] ?? null}
                  onChange={(next) => setFiles((m) => ({ ...m, [z]: next }))}
                  printCm={cm}
                  printLabel={p ? p.label : cm ? `${cm.widthCm}×${cm.heightCm} cm` : ""}
                />
              );
            })}
          </div>
          {needsFile ? (
            // Shown until a file is uploaded.
            noFile ? (
              <span className={`text-sm ${hint === "file" ? "font-semibold text-(--err)" : "text-(--muted2)"}`}>
                {hint === "file" ? t("fileRequired") : t("fileRequiredNote")}
              </span>
            ) : null
          ) : (
            // DTF: the order may be placed without a file (the checkout API accepts it).
            <span className="text-sm text-(--muted2)">{t("uploadLater")}</span>
          )}
        </div>

        {!isShirt ? (
          <div className="flex flex-wrap items-center gap-4">
            <b className="text-[15px]">{t("quantity")}</b>
            <QtyStepper value={qty} onChange={setQty} max={Math.max(1, maxQty)} label={t("quantity")} />
            {optionSoldOut ? (
              <span className="text-sm font-semibold text-(--err)">{t("outOfStock")}</span>
            ) : showsLowStock(optionStock) ? (
              <span className="text-sm font-semibold text-(--warn)">{t("stockLeft", { n: optionStock })}</span>
            ) : null}
            {tiered ? (
              <span className="text-sm text-(--muted2)">
                {t("bulkHint")} <Link href={href("/shop/companii")}>{t("bulkLink")}</Link>
              </span>
            ) : null}
          </div>
        ) : null}

        {tiers && tiers.length > 0 ? (
          <TierTable
            tiers={tiers}
            qty={pieces}
            title={isShirt ? t("tierTitleShirt") : t("tierTitle")}
            note={isShirt ? printDiscountNote(product.dtf?.printDiscount ?? null, t) : t("tierNote")}
            t={t}
            lang={lang}
          />
        ) : null}

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          {!product.available ? (
            <div role="status" className="flex flex-col gap-1">
              <b className="text-lg">{t("productUnavailable")}</b>
              <span className="text-sm text-(--muted)">{t("productUnavailableText")}</span>
            </div>
          ) : (
            <PriceLine quote={quote} total={priceTotal} pieces={pieces} idleHint={idleHint} t={t} lang={lang} />
          )}
          {hintText ? (
            <p role="alert" className="m-0 text-sm font-semibold text-(--err)">
              {hintText}
            </p>
          ) : null}
          <button
            type="button"
            onClick={addToCart}
            disabled={(!canAdd && quoteLine != null) || !product.available || optionSoldOut}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {!product.available ? t("productUnavailable") : added ? `✓ ${t("addedToCart")}` : addLabel}
          </button>
          <AddedNote added={added} t={t} />
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            <span>{t("readyIn")}</span>
            <span>{t("deliveryLine")}</span>
            <span>{paymentLive ? t("paymentLine") : t("paymentLineSoon")}</span>
          </div>
        </div>
      </div>

      {/* Phone: sticky add-to-cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        {!isShirt && product.available ? (
          <QtyStepper value={qty} onChange={setQty} max={Math.max(1, maxQty)} label={t("quantity")} />
        ) : null}
        <button
          type="button"
          onClick={addToCart}
          disabled={(!canAdd && quoteLine != null) || !product.available || optionSoldOut}
          className="shop-btn-dark min-h-12 flex-1 rounded-xl bg-(--ink) px-3 text-base font-extrabold disabled:opacity-50"
        >
          {!product.available
            ? t("productUnavailable")
            : added
              ? `✓ ${t("addedToCart")}`
              : editLine
                ? t("updateInCart")
                : t("addToCartShort")}
          {product.available && !added && priceTotal != null ? ` · ${formatPrice(priceTotal, lang)}` : ""}
        </button>
      </div>
    </div>
  );
}

function printDiscountNote(discount: ShopPrintDiscount | null, t: ShopT): string {
  if (!discount?.steps.length) return t("tierNote");
  const list: string = discount.steps.map((s) => t("printDiscountStep", { pct: s.pct, n: s.minQty })).join(", ");
  return t("tierPrintNote", { list });
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

/** Run-size price table (pens, caps, T-shirt item price); the row for `qty` is bold. */
export function TierTable({
  tiers,
  qty,
  title,
  note,
  t,
  lang,
}: {
  tiers: ShopPriceTier[];
  qty: number;
  title: string;
  note: string;
  t: ShopT;
  lang: ShopLang;
}) {
  return (
    <div className="flex flex-col gap-2">
      <b className="text-[15px]">{title}</b>
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
      <span className="text-xs text-(--muted2)">{note}</span>
    </div>
  );
}

/** Breakdown rows that are per piece (shown as «2 × 165 lei» at 2+ pieces). */
const PER_PIECE_ROWS: ReadonlySet<string> = new Set(["item", "print", "press"]);

function PriceLine({
  quote,
  total,
  pieces,
  idleHint,
  t,
  lang,
}: {
  quote: LiveQuoteState;
  total: number | null;
  pieces: number;
  idleHint: string | null;
  t: ShopT;
  lang: ShopLang;
}) {
  const failed = quote.status === "done" && !quote.line.ok;
  const ok = quote.status === "done" && quote.line.ok ? quote.line : null;
  const idle: boolean = quote.status === "idle";
  return (
    <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-(--muted)">{t("total")}</span>
        <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
          {total != null ? formatPrice(total, lang) : failed || quote.status === "error" || idle ? "—" : "…"}
        </span>
      </div>
      {idle && idleHint ? <span className="self-end text-sm font-semibold text-(--muted)">{idleHint}</span> : null}
      {ok && pieces > 1 ? (
        <span className="self-end text-sm text-(--muted2)">{t("perPiece", { price: formatPrice(ok.unitPrice, lang) })}</span>
      ) : null}
      {ok?.breakdown ? (
        <span className="self-end text-right text-sm text-(--muted2)">
          {ok.breakdown
            .map((b, i) => {
              const each: number = Math.round((b.amount / Math.max(1, ok.quantity)) * 100) / 100;
              const perPiece: string =
                ok.quantity > 1 && PER_PIECE_ROWS.has(b.key) ? ` (${ok.quantity} × ${formatPrice(each, lang)})` : "";
              // A discount row (capped at a larger run) reads «− 170 lei», not «+ −170».
              const sign: string = i === 0 ? "" : b.amount < 0 ? " − " : " + ";
              return `${sign}${b.label} ${formatPrice(Math.abs(b.amount), lang)}${perPiece}`;
            })
            .join("")}
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
  sides,
  value,
  onChange,
  pieces,
  discount,
  pressFeeMdl,
  lang,
  t,
}: {
  prints: ShopPrintOption[];
  /** Zones to pick a format for, with their labels (T-shirt: front and back). */
  sides: { side: ShirtSide; label: string }[];
  value: ShirtPrintSelection;
  onChange: (v: ShirtPrintSelection) => void;
  /** Pieces picked (≥ 1): the chips show the price per piece at this run. */
  pieces: number;
  discount: ShopPrintDiscount | null;
  pressFeeMdl: number;
  lang: ShopLang;
  t: ShopT;
}) {
  const firstStep: number | null = firstDiscountQty(discount);
  const note: string | null =
    firstStep == null ? null : pieces < firstStep ? t("printPriceDropsFrom", { n: firstStep }) : t("printPriceAtQty", { n: pieces });
  return (
    <div className="flex flex-col gap-4">
      {sides.map(({ side, label: zone }) => {
        return (
          <fieldset key={side} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[15px] font-bold">
              {t("printSize")} — {zone}
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={value[side] == null}
                aria-label={`${zone}: ${t("zoneNone")}`}
                onClick={() => onChange({ ...value, [side]: null })}
                className={`min-h-11 rounded-xl border-[1.5px] px-3.5 text-sm font-bold ${
                  value[side] == null ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                {t("zoneNone")}
              </button>
              {prints.map((p) => {
                const on: boolean = value[side] === p.presetId;
                const price: string = formatPrice(printUnitPrice(p, pieces, discount, pressFeeMdl), lang);
                return (
                  <button
                    key={p.presetId}
                    type="button"
                    aria-pressed={on}
                    aria-label={t("printSizeAria", { zone, size: p.label, price })}
                    onClick={() => onChange({ ...value, [side]: p.presetId })}
                    className={`flex min-h-11 flex-col items-start justify-center rounded-xl border-[1.5px] px-3.5 py-1.5 text-left ${
                      on ? "border-(--gold-ink) bg-[#fbf5dc]" : "border-(--line2) bg-white"
                    }`}
                  >
                    <span className="text-sm font-bold">{p.label}</span>
                    <span className="text-xs text-(--muted2)">+{price}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {note ? <span className="text-sm text-(--muted2)">{note}</span> : null}
    </div>
  );
}
