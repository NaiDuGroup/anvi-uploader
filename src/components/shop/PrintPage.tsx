import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { PrintView } from "./PrintView";

/** «Printare foto și documente» page body (served at `/printare` and `/p/printare`). */
export function PrintPage({ lang, base, editId }: { lang: ShopLang; base: "" | "/shop"; editId: string | null }) {
  const t = shopT(lang);
  const href = (p: string) => shopHref(base, p);
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{t("photoTileTitle")}</span>
      </nav>
      <PrintView editId={editId} />
    </main>
  );
}
