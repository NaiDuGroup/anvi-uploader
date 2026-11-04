import { shopT, type ShopLang } from "@/lib/storefront/i18n";

export function CatalogError({ lang }: { lang: ShopLang }) {
  const t = shopT(lang);
  return (
    <div role="alert" className="mx-auto my-16 flex max-w-md flex-col items-center gap-4 px-4 text-center">
      <p className="text-lg text-(--muted)">{t("catalogError")}</p>
      <a href="" className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3 font-bold no-underline">
        {t("retry")}
      </a>
    </div>
  );
}
