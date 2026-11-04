"use client";

import Link from "next/link";
import { useShopLang } from "./ShopLangProvider";

/**
 * «Adăugat în coș — Vezi coșul» toast after adding a line (product pages and
 * business cards): above the phone add-to-cart bar, top-right on desktop.
 */
export function AddedToast({ show }: { show: boolean }) {
  const { t, href } = useShopLang();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-4 bottom-[88px] z-50 flex items-center justify-between gap-3 rounded-xl bg-(--ink) px-4 py-3 text-white shadow-lg transition-opacity md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:min-w-[320px] ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {show ? (
        <>
          <b className="text-[15px]">✓ {t("addedToCart")}</b>
          <Link href={href("/shop/cos")} className="shrink-0 font-bold text-(--gold) underline">
            {t("goToCart")}
          </Link>
        </>
      ) : null}
    </div>
  );
}
