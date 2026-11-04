"use client";

import Link from "next/link";
import { canStepQuantity, cartCount, lineQuantity, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopT } from "@/lib/storefront/i18n";
import type { QuoteLineResult } from "@/lib/storefront/quoteClient";
import { useCartQuote } from "@/lib/storefront/useCartQuote";
import { QtyStepper } from "./ProductBits";
import { ShopImg } from "./ShopImg";
import { useShopLang } from "./ShopLangProvider";

export function CartPageClient() {
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
  const subtotal: number | null = quote.status === "done" ? quote.subtotal : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {lines.map((l) => (
          <CartRow key={l.id} line={l} result={quote.byId[l.id]} loading={quote.status === "loading"} t={t} lang={lang} />
        ))}
      </ul>
      <aside className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-6 lg:sticky lg:top-4">
        <b className="text-lg">{t("yourOrder")}</b>
        <div className="flex justify-between text-(--muted)">
          <span>{t("items", { n: cartCount(lines) })}</span>
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
        <Link
          href={href("/shop/checkout")}
          aria-disabled={unavailable}
          onClick={(e) => {
            if (unavailable) e.preventDefault();
          }}
          className={`shop-btn-dark rounded-xl bg-(--ink) py-4 text-center text-[17px] font-extrabold no-underline ${unavailable ? "pointer-events-none opacity-50" : ""}`}
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
  result,
  loading,
  t,
  lang,
}: {
  line: CartLine;
  result: QuoteLineResult | undefined;
  loading: boolean;
  t: ShopT;
  lang: "ro" | "ru";
}) {
  const { href } = useShopLang();
  const total: number | null = result?.ok ? result.total : (line.lastTotal ?? null);
  const stepper: boolean = canStepQuantity(line.quote);
  const lowRes: boolean = line.files.some((f) => f.lowRes);
  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 border-b border-(--line) pb-4 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-5">
      <Link href={href(`/shop/p/${line.slug}`)} aria-label={line.title}>
        <ShopImg src={line.image} alt="" className="aspect-square w-full rounded-xl" />
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <b className="text-base sm:text-[17px]">{line.title}</b>
        {line.optionsText ? <span className="text-sm text-(--muted)">{line.optionsText}</span> : null}
        <span className={`text-sm ${line.files.length ? (lowRes ? "text-(--warn)" : "text-(--ok)") : "text-(--muted2)"}`}>
          {line.files.length === 0
            ? t("noFile")
            : line.files.length === 1
              ? t("fileAttached", { name: line.files[0]!.fileName })
              : t("filesAttached", { n: line.files.length })}
        </span>
        {result && !result.ok ? (
          <span role="alert" className="text-sm text-(--err)">
            {result.reason === "price_unavailable" ? t("priceUnavailable") : t("lineUnavailable")}
          </span>
        ) : null}
        <div className="mt-1 flex gap-4 text-sm">
          <button type="button" onClick={() => dispatchCart({ type: "remove", id: line.id })} className="underline">
            {t("remove")}
          </button>
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        {stepper ? (
          <QtyStepper
            size="sm"
            value={lineQuantity(line.quote)}
            label={`${t("quantity")} — ${line.title}`}
            onChange={(q) => dispatchCart({ type: "setQty", id: line.id, quantity: q })}
          />
        ) : (
          <span className="text-sm text-(--muted)">× {lineQuantity(line.quote)}</span>
        )}
        <b className={`text-lg ${loading ? "opacity-50" : ""}`}>{total != null ? formatPrice(total, lang) : "…"}</b>
      </div>
    </li>
  );
}
