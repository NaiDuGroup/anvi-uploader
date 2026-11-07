"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CartLine } from "@/lib/storefront/cart";
import { addedLineView, cartSummary } from "@/lib/studio/addedScreen";
import { useCart } from "@/lib/storefront/cartStore";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang } from "@/lib/storefront/i18n";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { useShopLang } from "../ShopLangProvider";

/** Another sheet product offered after a card / flyer («Cărți de vizită» after flyers and back). */
export interface StudioAlsoProduct {
  /** Written the `/shop/...` way (the screen passes it through `href()`). */
  path: string;
  name: string;
  subtitle?: string | null;
  image: string | null;
}

/**
 * «Produsul a fost adăugat în coș» (Vistaprint-like): what was added (front /
 * back pictures, name and options, quantity, price), the cart's count and
 * total, «Vezi coșul», «Creează încă unul», «Continuă cumpărăturile»;
 * «Continuă să editezi» reopens this very cart line (saving again updates it).
 * Shared by every Studio kind (mugs, notebooks, pens, cards, flyers).
 */
export function StudioAdded({
  line,
  updated = false,
  lang,
  onAgain,
  onEdit,
  crossSell,
  also,
  sideLabels,
}: {
  line: CartLine;
  /** The line was a cart line edited again (not a new one). */
  updated?: boolean;
  lang: ShopLang;
  onAgain: () => void;
  onEdit: () => void;
  /** «Designul tău pe alte produse» (mugs / pens / notebooks). */
  crossSell?: ReactNode;
  also?: StudioAlsoProduct | null;
  /** Names of the two pictures (apparel: «Față» / «Spate» instead of the card's «Verso»). */
  sideLabels?: { front: string; back: string };
}) {
  const t = studioShopT(lang);
  const { href } = useShopLang();
  const cart = useCart();
  const v = addedLineView(line);
  const sum = cartSummary(cart);
  const pics: { src: string; label: string | null }[] = [
    ...(v.front ? [{ src: v.front, label: v.back ? (sideLabels?.front ?? t("doneFront")) : null }] : []),
    ...(v.back ? [{ src: v.back, label: sideLabels?.back ?? t("doneBack") }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6 md:px-6 md:py-8" data-studio-added>
      <section className="flex flex-col gap-4 rounded-2xl border border-(--line) bg-white p-4 md:p-6" aria-labelledby="studio-added-title">
        <h1 id="studio-added-title" role="status" className="m-0 flex items-center gap-2 text-xl font-extrabold text-[#1f6b3c] md:text-2xl">
          <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#e7f5ec] text-base">
            ✓
          </span>
          {t(updated ? "doneUpdated" : "doneTitle")}
        </h1>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-8">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
            {pics.length ? (
              <div className="flex flex-none gap-3" data-studio-added-pics>
                {pics.map((p) => (
                  <figure key={p.src.slice(-40) + (p.label ?? "")} className="m-0 flex flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data URL thumbnail */}
                    <img
                      src={p.src}
                      alt={p.label ? `${t("doneThumbAlt")} — ${p.label}` : t("doneThumbAlt")}
                      className="h-32 w-auto max-w-[150px] rounded-lg border border-(--line) bg-(--soft) object-contain md:h-40 md:max-w-[200px]"
                    />
                    {p.label ? <figcaption className="text-xs font-semibold text-(--muted)">{p.label}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <b className="text-base md:text-lg">{v.title}</b>
              {v.optionsText ? <span className="text-sm text-(--muted)">{v.optionsText}</span> : null}
              <span className="text-sm text-(--muted)">{t("doneQty", { n: v.quantity })}</span>
              {v.total != null ? <span className="mt-1 text-lg font-extrabold" data-studio-added-total>{formatPrice(v.total, lang)}</span> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <Link
              href={href("/shop/cos")}
              className="shop-btn-dark flex min-h-12 items-center justify-center rounded-xl bg-(--ink) px-5 font-extrabold text-white no-underline"
            >
              {t("viewCart")}
            </Link>
            <button type="button" onClick={onAgain} className="min-h-12 rounded-xl border-[1.5px] border-(--ink) bg-white px-5 font-bold text-(--ink)" data-studio-added-again>
              {t("doneAgain")}
            </button>
            <Link href={href("/shop")} className="flex min-h-11 items-center justify-center text-sm font-semibold text-(--ink) underline">
              {t("doneShopping")}
            </Link>
            <span className="text-center text-sm text-(--muted)" data-studio-added-cart>
              {sum.total != null ? t("doneCartTotal", { n: sum.count, total: formatPrice(sum.total, lang) }) : t("doneCartCount", { n: sum.count })}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-(--line) pt-4 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" onClick={onEdit} className="min-h-11 self-start rounded-xl border-[1.5px] border-(--line2) px-4 text-sm font-bold" data-studio-added-edit>
            {t("continueEditing")}
          </button>
          <span className="text-sm text-(--muted)">{t("doneEditHint")}</span>
        </div>
      </section>
      {crossSell}
      {also ? (
        <section className="flex flex-col gap-3" data-studio-added-also>
          <h2 className="m-0 text-lg font-extrabold">{t("doneAlsoTitle")}</h2>
          <Link
            href={href(also.path)}
            className="flex max-w-md items-center gap-4 rounded-2xl border border-(--line) bg-white p-3 text-(--ink) no-underline hover:border-(--ink)"
          >
            {also.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a catalog picture
              <img src={also.image} alt="" className="h-16 w-16 flex-none rounded-xl bg-(--soft) object-cover" />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <b>{also.name}</b>
              {also.subtitle ? <span className="text-sm text-(--muted)">{also.subtitle}</span> : null}
            </span>
            <span className="flex-none text-sm font-bold underline">{t("doneAlsoCreate")}</span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
