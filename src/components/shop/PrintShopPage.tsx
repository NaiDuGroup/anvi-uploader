import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG, type PsProductId } from "@/lib/storefront/printShop/config";
import { psProduct } from "@/lib/storefront/printShop/config";
import { psT } from "@/lib/storefront/printShop/text";
import { PrintShopView } from "./PrintShopView";
import { UvStickersView } from "./UvStickersView";

/** A «Tipografie» product page body (served at `/p/<slug>`): breadcrumbs Home / Tipografie / product. */
export function PrintShopPage({
  lang,
  base,
  editId,
  page,
}: {
  lang: ShopLang;
  base: "" | "/shop";
  editId: string | null;
  page: { kind: "product"; productId: PsProductId } | { kind: "uv" };
}) {
  const t = shopT(lang);
  const href = (p: string) => shopHref(base, p);
  const name: string = page.kind === "uv" ? psT(lang)("uvTitle") : (psProduct(page.productId)?.name[lang] ?? "");
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <Link href={href(`/shop/${PS_CATEGORY_SLUG}`)}>{PS_CATEGORY_NAME[lang]}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{name}</span>
      </nav>
      {page.kind === "uv" ? <UvStickersView editId={editId} /> : <PrintShopView productId={page.productId} editId={editId} />}
    </main>
  );
}
