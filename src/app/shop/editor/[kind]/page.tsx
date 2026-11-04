import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogError } from "@/components/shop/CatalogError";
import { ShopDesignEditor } from "@/components/shop/editor/ShopDesignEditor";
import { EDITOR_FONT_VARIABLE_CLASSES } from "@/lib/editor/editorNextFonts";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { isShopEditorKind, productEditorKind, type ShopEditorKind } from "@/lib/storefront/design";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";
import type { ShopProduct } from "@/lib/storefront/types";

export const dynamic = "force-dynamic";

type Search = { slug?: string | string[]; variant?: string | string[]; edit?: string | string[] };
type Props = { params: Promise<{ kind: string }>; searchParams: Promise<Search> };

function one(v: string | string[] | undefined, max = 120): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

/** The product the design is for: the asked slug, else the first product with this editor. */
function pickProduct(products: readonly ShopProduct[], kind: ShopEditorKind, slug: string | null): ShopProduct | null {
  const withEditor = products.filter((p) => productEditorKind(p) === kind);
  return (slug ? withEditor.find((p) => p.slug === slug) : null) ?? withEditor.find((p) => p.available) ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { kind } = await params;
  // A tool, not a landing page (also served at the bare /mug, /notebook, /pen): never indexed.
  if (!isShopEditorKind(kind)) return { robots: SHOP_PRIVATE_ROBOTS };
  const lang = await getShopLang();
  const catalog = await tryLoadShopCatalog(lang);
  const product = catalog ? pickProduct(catalog.products, kind, one((await searchParams).slug)) : null;
  return product
    ? { title: shopT(lang)("editorTitle", { name: product.name }), robots: SHOP_PRIVATE_ROBOTS }
    : { robots: SHOP_PRIVATE_ROBOTS };
}

/**
 * Shop-mode editor (`anvi.md/editor/mug?slug=…&variant=…`, also served at the
 * bare `anvi.md/mug`): the studio template editor inside the storefront. The
 * design goes into the storefront cart as a normal line with its print file.
 */
export default async function ShopEditorPage({ params, searchParams }: Props) {
  const { kind } = await params;
  if (!isShopEditorKind(kind)) notFound();
  const sp = await searchParams;
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return <CatalogError lang={lang} />;
  const product = pickProduct(catalog.products, kind, one(sp.slug));
  if (!product) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12">
        <p className="m-0 text-lg text-(--muted)">{t("editorUnavailable")}</p>
        <Link href={shopHref(base, "/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3 font-bold no-underline">
          {t("backToCatalog")}
        </Link>
      </main>
    );
  }
  return (
    <main className={`mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pt-4 pb-16 sm:px-6 sm:pt-6 ${EDITOR_FONT_VARIABLE_CLASSES.join(" ")}`}>
      <ShopDesignEditor kind={kind} product={product} variantId={one(sp.variant, 64)} editId={one(sp.edit, 64)} />
    </main>
  );
}
