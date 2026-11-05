import Link from "next/link";
import { formatPrice } from "@/lib/storefront/format";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { SHOP_MADE_TO_ORDER_DAYS } from "@/lib/storefront/stock";
import type { ShopProduct } from "@/lib/storefront/types";
import { ShopImg } from "./ShopImg";

export function productPriceLabel(p: ShopProduct, lang: ShopLang): string {
  // Run-size prices (pens, caps, T-shirts): the lowest price per piece.
  if (p.unitFrom != null) return shopT(lang)("fromPerPiece", { price: formatPrice(p.unitFrom, lang) });
  if (p.fromPrice == null) return "";
  const price: string = formatPrice(p.fromPrice, lang);
  const varies: boolean =
    p.mode === "dtf" ? p.dtf?.garment !== "cap" : new Set(p.variants.map((v) => v.price)).size > 1;
  return varies ? shopT(lang)("fromPrice", { price }) : price;
}

export function ProductCard({
  product,
  lang,
  eager = false,
  base = "/shop",
}: {
  product: ShopProduct;
  lang: ShopLang;
  eager?: boolean;
  /** Link base: "" on the shop domain, "/shop" elsewhere. */
  base?: "" | "/shop";
}) {
  const href = (p: string) => shopHref(base, p);
  return (
    <Link href={href(`/shop/p/${product.slug}`)} className="group flex flex-col gap-2.5 no-underline">
      <div className="relative">
        <ShopImg
          src={product.image}
          alt={product.name}
          eager={eager}
          className="block aspect-square w-full rounded-[14px] transition-transform group-hover:scale-[1.01]"
        />
        {product.badge ? (
          <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-(--ink)">
            {product.badge}
          </span>
        ) : null}
      </div>
      <span className="text-[15px] leading-snug font-bold sm:text-base">{product.name}</span>
      <span className="text-sm text-(--muted2)">{product.subtitle}</span>
      <span className="text-[17px] font-extrabold sm:text-lg">{productPriceLabel(product, lang)}</span>
      {product.madeToOrder ? (
        <span className="text-[13px] font-semibold text-(--warn)">
          {shopT(lang)("madeToOrder", { days: product.madeToOrderDays ?? SHOP_MADE_TO_ORDER_DAYS })}
        </span>
      ) : null}
    </Link>
  );
}
