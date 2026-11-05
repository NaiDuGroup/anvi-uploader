import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountLogin, LogoutButton } from "@/components/shop/account/AccountClients";
import { FileIcon, ReceiptIcon, UserIcon } from "@/components/shop/ShopIcons";
import { getShopCustomer } from "@/lib/shop/account/session";
import { safeShopNext } from "@/lib/shop/account/tokens";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("account"), robots: SHOP_PRIVATE_ROBOTS };
}

type Props = { searchParams: Promise<{ next?: string }> };

/** `/cont`: login (e-mail → link + code) or, signed in, the account overview. */
export default async function ShopAccountPage({ searchParams }: Props) {
  const lang = await getShopLang();
  const t = shopT(lang);
  const href = await getShopHref();
  const me = await getShopCustomer();
  const next = safeShopNext((await searchParams).next);
  if (!me) {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("accLoginTitle")}</h1>
        <AccountLogin next={next} />
        <TurnstileScope action="login" lang={lang} />
      </main>
    );
  }
  const cards = [
    { href: href("/shop/cont/comenzi"), title: t("myOrders"), sub: t("accOrdersSub"), Icon: ReceiptIcon },
    { href: href("/shop/cont/fisiere"), title: t("accFiles"), sub: t("accFilesSub"), Icon: FileIcon },
    { href: href("/shop/cont/date"), title: t("accDetails"), sub: t("accDetailsSub"), Icon: UserIcon },
  ];
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{me.name ? t("accHello", { name: me.name.split(/\s+/)[0]! }) : t("account")}</h1>
        <span className="text-(--muted)">{t("accSignedInAs", { email: me.email })}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {cards.map(({ href: to, title, sub, Icon }) => (
          <li key={to}>
            <Link href={to} className="flex min-h-16 items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--line) px-4 py-3 no-underline hover:border-(--ink)">
              <Icon size={22} />
              <span className="flex flex-1 flex-col">
                <b>{title}</b>
                <span className="text-sm text-(--muted)">{sub}</span>
              </span>
              <span aria-hidden className="text-(--muted2)">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <LogoutButton />
    </main>
  );
}
