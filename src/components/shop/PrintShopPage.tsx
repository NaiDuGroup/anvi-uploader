import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";
import { PS_CATEGORY_NAME, PS_CATEGORY_SLUG, type PsProductId } from "@/lib/storefront/printShop/config";
import { psProduct } from "@/lib/storefront/printShop/config";
import { psT } from "@/lib/storefront/printShop/text";
import { printShopPageJsonLd } from "@/lib/storefront/printShop/seo";
import { studioEditorPath } from "@/lib/storefront/design";
import { isStudioFlyerEnabled } from "@/lib/studio/flag";
import { studioSheetT } from "@/lib/studio/i18n.flyer";
import { BusinessCardChoice } from "./BusinessCardChoice";
import { JsonLd } from "./JsonLd";
import { PrintShopView } from "./PrintShopView";
import { UvStickersView } from "./UvStickersView";

/**
 * A «Tipografie» product page body (served at `/p/<slug>`): breadcrumbs Home / Tipografie / product.
 * Flyers with `flyerStudio` (staff / tester or `SHOP_STUDIO_FLYER=1`, see `studio/flag.ts`): two
 * choices, «Creează online» (ANVI Studio) and «Încarcă fișierul tău» (the upload view, unchanged;
 * editing an uploaded cart line opens there); without it the page is exactly as before.
 */
export function PrintShopPage({
  lang,
  base,
  editId,
  page,
  flyerStudio = false,
}: {
  lang: ShopLang;
  base: "" | "/shop";
  editId: string | null;
  page: { kind: "product"; productId: PsProductId } | { kind: "uv" };
  flyerStudio?: boolean;
}) {
  const t = shopT(lang);
  const href = (p: string) => shopHref(base, p);
  const product = page.kind === "product" ? psProduct(page.productId) : null;
  const name: string = page.kind === "uv" ? psT(lang)("uvTitle") : (product?.name[lang] ?? "");
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 md:gap-7">
      {product || page.kind === "uv" ? (
        <JsonLd data={printShopPageJsonLd(page.kind === "uv" ? { kind: "uv" } : { kind: "product", product: product! }, lang)} />
      ) : null}
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={href("/shop")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <Link href={href(`/shop/${PS_CATEGORY_SLUG}`)}>{PS_CATEGORY_NAME[lang]}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{name}</span>
      </nav>
      {page.kind === "uv" ? (
        <UvStickersView editId={editId} />
      ) : flyerStudio && page.productId === "flyers" ? (
        <FlyerChoice lang={lang} href={href} editId={editId} />
      ) : (
        <PrintShopView productId={page.productId} editId={editId} />
      )}
    </main>
  );
}

/** Flyers: «Creează online» (the flyer Studio) / «Încarcă fișierul tău» (the upload view). */
function FlyerChoice({ lang, href, editId }: { lang: ShopLang; href: (p: string) => string; editId: string | null }) {
  const ft = studioSheetT("flyer", lang);
  return (
    <BusinessCardChoice
      kind="flyer"
      text={{
        tabCreate: ft("tabCreate"),
        tabCreateSub: ft("tabCreateSub"),
        tabUpload: ft("tabUpload"),
        tabUploadSub: ft("tabUploadSub"),
        createTitle: ft("startTitle"),
        createLead: ft("createLead"),
        steps: [ft("createStep1"), ft("createStep2"), ft("createStep3")],
        createCta: ft("createCta"),
        ...(isStudioFlyerEnabled() ? {} : { badge: ft("testBadge") }),
      }}
      studioHref={href(studioEditorPath("flyer", { fresh: true }))}
      initial={editId ? "upload" : "create"}
      upload={<PrintShopView productId="flyers" editId={editId} />}
    />
  );
}
