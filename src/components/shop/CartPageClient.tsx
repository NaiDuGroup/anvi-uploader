"use client";

import Link from "next/link";
import { printQtyText } from "@/lib/shop/printLine";
import { canStepQuantity, cartCount, lineQuantity, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { dtfZonesWithoutFile, lineMissingFile, shopZoneName as zoneName } from "@/lib/storefront/fileRules";
import { shopEditorPath, studioEditorPath } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import { itemsLabel, type ShopLang, type ShopT } from "@/lib/storefront/i18n";
import {
  cartLineText,
  lineMadeToOrderDays,
  lineStockLimit,
  lineStockShortage,
  type ShopLineLabels,
} from "@/lib/storefront/lineLabels";
import type { QuoteLineResult } from "@/lib/storefront/quoteClient";
import { useCartQuote } from "@/lib/storefront/useCartQuote";
import { QtyStepper } from "./ProductBits";
import { ShopImg } from "./ShopImg";
import { shopSizeLabel } from "@/lib/storefront/sizes";
import { useShopLang } from "./ShopLangProvider";

export function CartPageClient({ labels = null }: { labels?: ShopLineLabels | null }) {
  const { t, lang, href } = useShopLang();
  const lines = useCart();
  const hydrated = useHydrated();
  const quote = useCartQuote(lines, lang, hydrated);

  if (!hydrated) {
    return <div className="min-h-[320px]" aria-busy="true" />;
  }
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="m-0 text-lg text-(--muted)">{t("cartEmpty")}</p>
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("cartEmptyCta")}
        </Link>
      </div>
    );
  }

  const unavailable: boolean = lines.some((l) => quote.byId[l.id] && !quote.byId[l.id]!.ok);
  /** A mug / notebook / pen line without its design file (older cart): the checkout API would refuse it. */
  const missingFiles: boolean = lines.some(lineMissingFile);
  /** More pieces than in stock: the checkout API would refuse the line (`out_of_stock`). */
  const overStock: boolean = lines.some((l) => lineStockShortage(l.quote, labels) != null);
  const blocked: boolean = unavailable || missingFiles || overStock;
  const subtotal: number | null = quote.status === "done" ? quote.subtotal : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {lines.map((l) => (
          <CartRow
            key={l.id}
            line={l}
            labels={labels}
            result={quote.byId[l.id]}
            loading={quote.status === "loading"}
            t={t}
            lang={lang}
          />
        ))}
      </ul>
      <aside className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-6 lg:sticky lg:top-4">
        <b className="text-lg">{t("yourOrder")}</b>
        <div className="flex justify-between text-(--muted)">
          <span>{itemsLabel(cartCount(lines), lang)}</span>
          <span>{subtotal != null ? formatPrice(subtotal, lang) : "…"}</span>
        </div>
        <div className="flex justify-between text-(--muted)">
          <span>{t("delivery")}</span>
          <span>{t("deliveryNextStep")}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-(--line) pt-3.5">
          <b>{t("total")}</b>
          <b className="text-2xl" aria-live="polite">
            {subtotal != null ? formatPrice(subtotal, lang) : quote.status === "error" ? "—" : "…"}
          </b>
        </div>
        {quote.status === "loading" ? <span className="text-sm text-(--muted2)">{t("cartUpdating")}</span> : null}
        {quote.status === "error" ? (
          <span role="alert" className="text-sm text-(--err)">
            {t("priceError")}
          </span>
        ) : null}
        {unavailable ? (
          <span role="alert" className="text-sm text-(--err)">
            {t("lineUnavailable")}
          </span>
        ) : null}
        {missingFiles ? (
          <span role="alert" className="text-sm font-semibold text-(--err)">
            {t("filesMissingCart")}
          </span>
        ) : null}
        <Link
          href={href("/shop/checkout")}
          aria-disabled={blocked}
          onClick={(e) => {
            if (blocked) e.preventDefault();
          }}
          className={`shop-btn-dark rounded-xl bg-(--ink) py-4 text-center text-[17px] font-extrabold no-underline ${blocked ? "pointer-events-none opacity-50" : ""}`}
        >
          {t("checkout")}
        </Link>
        <p className="m-0 text-sm leading-snug text-(--muted2)">{t("cartNote")}</p>
      </aside>
    </div>
  );
}

function CartRow({
  line,
  labels,
  result,
  loading,
  t,
  lang,
}: {
  line: CartLine;
  labels: ShopLineLabels | null;
  result: QuoteLineResult | undefined;
  loading: boolean;
  t: ShopT;
  lang: ShopLang;
}) {
  const { href } = useShopLang();
  const total: number | null = result?.ok ? result.total : (line.lastTotal ?? null);
  const stepper: boolean = canStepQuantity(line.quote);
  const lowRes: boolean = line.files.some((f) => f.lowRes);
  const missingFile: boolean = lineMissingFile(line);
  /** DTF zones with no file yet: the order may be placed, but say so. */
  const noDtfFile: string[] = dtfZonesWithoutFile(line);
  // Name and options in the current language, rebuilt from the line's keys (old lines: stored text).
  const text = cartLineText(line, labels, t);
  const editHref: string = href(`/shop/p/${text.slug}?edit=${encodeURIComponent(line.id)}`);
  /** Made in the shop-mode editor: «Editează designul» reopens it and saves back into this line. */
  const designHref: string | null =
    line.design && line.quote.kind === line.design.editor
      ? href(
          // ANVI Studio lines reopen the Studio document; old editor lines the old editor.
          (line.design.studio ? studioEditorPath : shopEditorPath)(line.design.editor, {
            slug: line.slug,
            variant: line.quote.productId,
            edit: line.id,
          }),
        )
      : null;
  const limit: number | null = lineStockLimit(line.quote, labels);
  const short = lineStockShortage(line.quote, labels);
  const mtoDays: number | null = lineMadeToOrderDays(line.quote, labels);
  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 border-b border-(--line) pb-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-5">
      <Link href={href(`/shop/p/${text.slug}`)} aria-label={text.title}>
        <ShopImg
          src={line.image}
          alt={line.design?.preview ? t("designThumbAlt") : ""}
          fit={line.design?.preview ? "contain" : "cover"}
          className="aspect-square w-full rounded-xl"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <b className="text-base sm:text-[17px]">{text.title}</b>
        {text.optionsText ? <span className="text-sm text-(--muted)">{text.optionsText}</span> : null}
        {line.missingFiles?.length ? (
          // «Repetă comanda»: name the stored files deleted since (instead of the generic «missing»).
          <span role="alert" className="flex flex-wrap items-center gap-x-2 rounded-lg bg-(--warn-soft) px-3 py-2 text-sm font-semibold text-(--warn)">
            {t("cartFilesGone", { names: line.missingFiles.join(", ") })}
            <Link href={editHref} className="underline">
              {t("uploadFileLink")}
            </Link>
          </span>
        ) : missingFile ? (
          <span role="alert" className="flex flex-wrap items-center gap-x-2 rounded-lg bg-(--err-soft) px-3 py-2 text-sm font-semibold text-(--err)">
            {t("fileMissing")}
            <Link href={editHref} className="underline">
              {t("uploadFileLink")}
            </Link>
          </span>
        ) : noDtfFile.length ? (
          <span role="status" className="flex flex-wrap items-center gap-x-2 rounded-lg bg-(--warn-soft) px-3 py-2 text-sm font-semibold text-(--warn)">
            {line.quote.kind === "dtf" && line.quote.zones.length > 1
              ? t("fileNotSentYetZone", { zones: noDtfFile.map((z) => zoneName(z, t)).join(", ") })
              : t("fileNotSentYet")}
            <Link href={editHref} className="underline">
              {t("uploadFileNow")}
            </Link>
          </span>
        ) : (
          <span className={`text-sm ${line.files.length ? (lowRes ? "text-(--warn)" : "text-(--ok)") : "text-(--muted2)"}`}>
            {line.files.length === 0
              ? t("noFile")
              : line.files.length === 1
                ? t("fileAttached", { name: line.files[0]!.fileName })
                : t("filesAttached", { n: line.files.length })}
          </span>
        )}
        {result && !result.ok ? (
          <span role="alert" className="text-sm text-(--err)">
            {result.reason === "price_unavailable" ? t("priceUnavailable") : t("lineUnavailable")}
          </span>
        ) : short ? (
          <span role="alert" className="text-sm font-semibold text-(--err)">
            {short.available === 0
              ? `${short.size ? `${shopSizeLabel(short.size, lang)}: ` : ""}${t("outOfStock")}`
              : `${short.size ? `${shopSizeLabel(short.size, lang)}: ` : ""}${t("cartStockLimit", { n: short.available })}`}
          </span>
        ) : mtoDays != null ? (
          <span className="text-sm font-semibold text-(--warn)">{t("madeToOrder", { days: mtoDays })}</span>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {designHref ? (
            <Link
              href={designHref}
              aria-label={t("editDesignAria", { title: text.title })}
              className="inline-flex min-h-10 items-center rounded-lg px-1 font-semibold underline"
            >
              {t("editDesign")}
            </Link>
          ) : null}
          <Link
            href={editHref}
            aria-label={t("editAria", { title: text.title })}
            className="inline-flex min-h-10 items-center rounded-lg px-1 font-semibold underline"
          >
            {t("edit")}
          </Link>
          <button
            type="button"
            onClick={() => dispatchCart({ type: "remove", id: line.id })}
            aria-label={t("removeAria", { title: text.title })}
            className="inline-flex min-h-10 items-center rounded-lg px-1 underline"
          >
            {t("remove")}
          </button>
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        {stepper ? (
          <QtyStepper
            size="sm"
            value={lineQuantity(line.quote)}
            max={limit != null ? Math.max(1, limit) : undefined}
            label={`${t("quantity")} — ${text.title}`}
            onChange={(q) => dispatchCart({ type: "setQty", id: line.id, quantity: q })}
          />
        ) : (
          // Several sizes: the set is changed on the product page («Editează»), the label stays truthful.
          <span className="text-sm font-semibold text-(--muted)">
            {/* Print lines: the files are counted once (left); here the printed pages / photos. */}
            {line.quote.kind === "print" ? printQtyText(line.quote, t) : t("piecesTotal", { n: lineQuantity(line.quote) })}
          </span>
        )}
        <b className={`text-lg ${loading ? "opacity-50" : ""}`}>{total != null ? formatPrice(total, lang) : "…"}</b>
      </div>
    </li>
  );
}
