import type { Metadata } from "next";
import Link from "next/link";
import { AccountFilesClient } from "@/components/shop/account/AccountForms";
import { listAccountFiles } from "@/lib/shop/account/data";
import { requireShopCustomer } from "@/lib/shop/account/pageAuth";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("accFiles"), robots: { index: false } };
}

/** `/cont/fisiere`: the account's stored order files (delete). */
export default async function ShopAccountFilesPage() {
  const me = await requireShopCustomer("/cont/fisiere");
  const t = shopT(await getShopLang());
  const href = await getShopHref();
  const files = await listAccountFiles(me.id);
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <Link href={href("/shop/cont")} className="self-start text-sm font-semibold">
        {t("accBack")}
      </Link>
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("accFiles")}</h1>
      <p className="m-0 text-sm leading-relaxed text-(--muted2)">{t("accFilesNote")}</p>
      <AccountFilesClient initial={files} />
    </main>
  );
}
