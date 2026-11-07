"use client";

import { CART_MAX_LINES } from "@/lib/storefront/cart";
import { hideCartFullNotice, useCartNotice } from "@/lib/storefront/cartStore";
import { useShopLang } from "./ShopLangProvider";

/**
 * «One order has up to 30 lines» — shown when a full cart refuses a new line
 * (any product page, editor, Studio, «Repetă comanda»), or «the cart does not
 * fit in this browser» when its storage is full. Rendered once in the
 * shop layout, so it stays visible after a client navigation.
 */
export function CartFullToast() {
  const { t } = useShopLang();
  const notice = useCartNotice();
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-[88px] z-[60] flex items-start justify-between gap-3 rounded-xl bg-(--err) px-4 py-3 text-white shadow-lg md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:max-w-[420px]"
    >
      <b className="text-[15px] leading-snug">{notice === "storage" ? t("cartStorageFull") : t("cartFull", { n: CART_MAX_LINES })}</b>
      <button
        type="button"
        onClick={hideCartFullNotice}
        aria-label={t("closeMenu")}
        className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xl leading-none text-white"
      >
        ×
      </button>
    </div>
  );
}
