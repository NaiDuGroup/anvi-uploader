import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG } from "@/lib/storefront/printShop/config";
import { studioEditorPath } from "@/lib/storefront/design";
import { studioCardT } from "@/lib/studio/i18n.card";
import { BusinessCardView } from "./BusinessCardView";

/**
 * «Cărți de vizită» page body (served at `/carti-de-vizita` and `/p/carti-de-vizita`).
 * `cardStudio` (staff / tester or `SHOP_STUDIO_CARD=1`, see `studio/flag.ts`) adds the
 * «Creează online» link to ANVI Studio; without it the page is the upload page as before.
 */
export function BusinessCardPage({ lang, base, editId, cardStudio = false }: { lang: ShopLang; base: "" | "/shop"; editId: string | null; cardStudio?: boolean }) {
  const t = shopT(lang);
  const ct = studioCardT(lang);
  const href = (p: string) => shopHref(base, p);
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <Link href={href(`/shop/${PS_CATEGORY_SLUG}`)}>{PS_CATEGORY_NAME[lang]}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{t("bcNav")}</span>
      </nav>
      {cardStudio ? (
        <Link
          href={href(studioEditorPath("card", { fresh: true }))}
          data-studio-card-cta
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#faf3dc] p-4 no-underline"
        >
          <span className="flex flex-col gap-0.5">
            <b className="text-lg text-(--ink)">{ct("startTitle")}</b>
            <span className="text-sm text-[#5c4c10]">{ct("testBadge")}</span>
          </span>
          <span className="shop-btn-dark rounded-xl bg-(--ink) px-5 py-3 font-extrabold text-white">ANVI Studio →</span>
        </Link>
      ) : null}
      <BusinessCardView editId={editId} />
    </main>
  );
}
