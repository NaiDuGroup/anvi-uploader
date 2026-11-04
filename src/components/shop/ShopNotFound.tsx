import Link from "next/link";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";

/** Storefront 404: in the shop language, inside the shop layout, with links home and to the catalog. */
export async function ShopNotFound() {
  const t = shopT(await getShopLang());
  const href = await getShopHref();
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center sm:py-24">
      <p aria-hidden className="m-0 text-[64px] leading-none font-extrabold text-(--gold)">
        404
      </p>
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("notFoundTitle")}</h1>
      <p className="m-0 leading-relaxed text-(--muted)">{t("notFoundText")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3 font-bold no-underline">
          {t("notFoundHome")}
        </Link>
        <Link
          href={href("/shop#catalog")}
          className="rounded-xl border-[1.5px] border-(--ink) px-6 py-3 font-bold text-(--ink) no-underline"
        >
          {t("notFoundCatalog")}
        </Link>
      </div>
    </main>
  );
}

/** `<title>` of a storefront 404 (the pages that call `notFound()` set it). */
export async function shopNotFoundTitle(): Promise<string> {
  return shopT(await getShopLang())("notFoundTitle");
}
