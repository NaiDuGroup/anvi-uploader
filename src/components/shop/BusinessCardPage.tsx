import { isStudioCardEnabled } from "@/lib/studio/flag";
import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG } from "@/lib/storefront/printShop/config";
import { studioEditorPath } from "@/lib/storefront/design";
import { studioCardT } from "@/lib/studio/i18n.card";
import { BusinessCardChoice } from "./BusinessCardChoice";
import { BusinessCardView } from "./BusinessCardView";

/**
 * «Cărți de vizită» page body (served at `/carti-de-vizita` and `/p/carti-de-vizita`).
 * `cardStudio` (staff / tester or `SHOP_STUDIO_CARD=1`, see `studio/flag.ts`) shows two
 * choices, «Creează online» (ANVI Studio) and «Încarcă fișierul tău» (the upload form,
 * unchanged); without it the page is exactly the upload page as before.
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
        <BusinessCardChoice
          text={{
            tabCreate: ct("tabCreate"),
            tabCreateSub: ct("tabCreateSub"),
            tabUpload: ct("tabUpload"),
            tabUploadSub: ct("tabUploadSub"),
            createTitle: ct("startTitle"),
            createLead: ct("createLead"),
            steps: [ct("createStep1"), ct("createStep2"), ct("createStep3")],
            createCta: ct("createCta"),
            ...(isStudioCardEnabled() ? {} : { badge: ct("testBadge") }),
          }}
          studioHref={href(studioEditorPath("card", { fresh: true }))}
          initial={editId ? "upload" : "create"}
          upload={<BusinessCardView editId={editId} />}
        />
      ) : (
        <BusinessCardView editId={editId} />
      )}
    </main>
  );
}
