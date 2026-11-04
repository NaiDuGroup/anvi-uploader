import type { Metadata } from "next";
import { OrderStatusClient } from "@/components/shop/OrderStatusClient";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { viberHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("myOrder"), robots: { index: false } };
}

export default async function ShopOrderPage({ params }: Props) {
  const { token } = await params;
  const contacts = await loadShopContacts();
  const viber = contacts.wholesale.find((c) => c.viber) ?? null;
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <OrderStatusClient token={token} viberHref={viber ? viberHref(viber.phone) : null} />
    </main>
  );
}
