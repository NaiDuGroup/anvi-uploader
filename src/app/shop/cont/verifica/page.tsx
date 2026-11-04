import type { Metadata } from "next";
import { AccountVerify } from "@/components/shop/account/AccountClients";
import { safeShopNext } from "@/lib/shop/account/tokens";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("accVerifyTitle"), robots: { index: false }, referrer: "no-referrer" };
}

type Props = { searchParams: Promise<{ token?: string; next?: string }> };

/** `/cont/verifica?token=…` — the e-mail link; one click trades the token for the `shop_session` cookie. */
export default async function ShopAccountVerifyPage({ searchParams }: Props) {
  const t = shopT(await getShopLang());
  const sp = await searchParams;
  const token = typeof sp.token === "string" && sp.token.length <= 100 ? sp.token : "";
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("accVerifyTitle")}</h1>
      <AccountVerify token={token} next={safeShopNext(sp.next)} />
    </main>
  );
}
