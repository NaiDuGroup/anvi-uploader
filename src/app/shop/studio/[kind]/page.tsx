import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogError } from "@/components/shop/CatalogError";
import { StudioShop, type StudioCrossSellProduct } from "@/components/shop/studio/StudioShop";
import type { StudioAlsoProduct } from "@/components/shop/studio/StudioAdded";
import { EDITOR_FONT_VARIABLE_CLASSES } from "@/lib/editor/editorNextFonts";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { productStudioKind, studioEditorPath } from "@/lib/storefront/design";
import { inStock } from "@/lib/storefront/stock";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";
import type { ShopProduct } from "@/lib/storefront/types";
import { STUDIO_KINDS, isStudioKind, type StudioKind } from "@/lib/studio/document";
import { studioApparelAllowed, studioCardAllowed, studioEditorAllowed, studioFlyerAllowed } from "@/lib/studio/flagServer";
import { APPAREL_GARMENTS, isApparelProduct } from "@/lib/studio/apparel";
import { loadApparelPricing } from "@/lib/studio/apparelServer";
import { flyerShopProduct } from "@/lib/studio/flyerProduct";
import { shopBusinessCardProduct } from "@/lib/storefront/businessCardProduct";

export const dynamic = "force-dynamic";

type Search = {
  slug?: string | string[];
  variant?: string | string[];
  edit?: string | string[];
  from?: string | string[];
  new?: string | string[];
  /** With `from`: open the adapted copy in the editor (`edit`) instead of «Verifică designul». */
  step?: string | string[];
};
type Props = { params: Promise<{ kind: string }>; searchParams: Promise<Search> };

function one(v: string | string[] | undefined, max = 120): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

/** The product the design is for: the asked slug, else the first product with this editor (old editor or `studioKind`). */
function pickProduct(products: readonly ShopProduct[], kind: StudioKind, slug: string | null): ShopProduct | null {
  const withEditor = products.filter((p) => productStudioKind(p) === kind);
  return (slug ? withEditor.find((p) => p.slug === slug) : null) ?? withEditor.find((p) => p.available) ?? null;
}

/** «Designul tău pe alte produse»: one available product per other Studio kind. */
function crossSellProducts(products: readonly ShopProduct[], kind: StudioKind): StudioCrossSellProduct[] {
  const out: StudioCrossSellProduct[] = [];
  for (const k of STUDIO_KINDS) {
    // Business cards / flyers are not offered as «your design on other products» (their own packs and pages).
    if (k === kind || k === "card" || k === "flyer" || k === "apparel") continue;
    // The old-editor product first (its catalog item has the print area and the 3D look).
    const p = products.find((x) => x.editorHref && productStudioKind(x) === k && x.available) ?? products.find((x) => productStudioKind(x) === k && x.available);
    if (!p) continue;
    const ids = [...p.variants.filter((v) => inStock(v.stock)), ...p.variants.filter((v) => !inStock(v.stock))].map((v) => v.id);
    const prices: number[] = p.variants.map((v) => v.price).filter((x): x is number => typeof x === "number" && x > 0);
    out.push({ kind: k, slug: p.slug, name: p.name, variantIds: ids, price: prices.length ? Math.min(...prices) : null });
  }
  return out;
}

/** «Îți mai pot fi de folos» after a card / flyer: the other one, as a new Studio design. */
function sheetAlso(p: ShopProduct, kind: "card" | "flyer"): StudioAlsoProduct {
  return { path: studioEditorPath(kind, { fresh: true }), name: p.name, subtitle: p.subtitle, image: p.image };
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "ANVI Studio", robots: SHOP_PRIVATE_ROBOTS };
}

/**
 * ANVI Studio (`anvi.md/studio/mug?slug=…&variant=…&edit=…`): the new design
 * editor, hidden until the owner approves it — 404 unless
 * `SHOP_STUDIO_EDITOR=1` or a tester pass / staff session. Product pages keep
 * linking the old editor (`/editor/<kind>`). Products without the old editor
 * (UV mugs / pens, `studioKind`) open here too.
 */
export default async function StudioPage({ params, searchParams }: Props) {
  const { kind } = await params;
  if (!isStudioKind(kind)) notFound();
  // Business cards have their own gate (`SHOP_STUDIO_CARD=1` or staff / tester): the Studio flag is on for everyone.
  // Flyers too (`SHOP_STUDIO_FLYER=1` or staff / tester): neither the Studio nor the card flag opens them.
  // Apparel too (`SHOP_STUDIO_APPAREL=1` or staff / tester).
  if (!(await (kind === "card" ? studioCardAllowed() : kind === "flyer" ? studioFlyerAllowed() : kind === "apparel" ? studioApparelAllowed() : studioEditorAllowed()))) notFound();
  const sp = await searchParams;
  const lang = await getShopLang();
  if (kind === "card") {
    // Not a catalog item: the one business-card product (packs priced by `businessCards.ts`).
    return (
      <main data-studio-fonts className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>
        <StudioShop
          kind="card"
          product={shopBusinessCardProduct(lang)}
          variantId={null}
          editId={one(sp.edit, 64)}
          fromId={null}
          forceNew={one(sp.new, 5) != null}
          crossSell={[]}
          also={(await studioFlyerAllowed()) ? sheetAlso(flyerShopProduct(lang), "flyer") : null}
        />
      </main>
    );
  }
  if (kind === "flyer") {
    // Not a catalog item either: the print-shop flyer product (formats / papers / packs priced by `printShop/pricing.ts`).
    return (
      <main data-studio-fonts className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>
        <StudioShop
          kind="flyer"
          product={flyerShopProduct(lang)}
          variantId={null}
          editId={one(sp.edit, 64)}
          fromId={null}
          forceNew={one(sp.new, 5) != null}
          crossSell={[]}
          also={(await studioCardAllowed()) ? sheetAlso(shopBusinessCardProduct(lang), "card") : null}
        />
      </main>
    );
  }
  const t = shopT(lang);
  const base = await getShopBase();
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return <CatalogError lang={lang} />;
  if (kind === "apparel") {
    // The DTF garments of the apparel Studio (config order), those on sale now.
    const garments: ShopProduct[] = APPAREL_GARMENTS.map((g) => catalog.products.find((p) => p.slug === g.slug)).filter(
      (p): p is ShopProduct => p != null && isApparelProduct(p) && p.available,
    );
    const slug = one(sp.slug);
    const picked: ShopProduct | null = garments.find((p) => p.slug === slug) ?? garments[0] ?? null;
    if (!picked) {
      return (
        <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12">
          <p className="m-0 text-lg text-(--muted)">{t("editorUnavailable")}</p>
          <Link href={shopHref(base, "/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3 font-bold no-underline">
            {t("backToCatalog")}
          </Link>
        </main>
      );
    }
    const pricing = await loadApparelPricing(picked);
    return (
      <main data-studio-fonts className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>
        <StudioShop
          kind="apparel"
          product={picked}
          variantId={null}
          editId={one(sp.edit, 64)}
          fromId={null}
          forceNew={one(sp.new, 5) != null}
          crossSell={[]}
          apparel={{
            pricing,
            products: garments.map((p) => ({ slug: p.slug, name: p.name, image: p.image, fromPrice: p.fromPrice })),
          }}
        />
      </main>
    );
  }
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
    <main data-studio-fonts className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>
      <StudioShop
        kind={kind}
        product={product}
        variantId={one(sp.variant, 64)}
        editId={one(sp.edit, 64)}
        fromId={one(sp.from, 60)}
        forceNew={one(sp.new, 5) != null}
        fromEdit={one(sp.step, 10) === "edit"}
        crossSell={crossSellProducts(catalog.products, kind)}
      />
    </main>
  );
}
