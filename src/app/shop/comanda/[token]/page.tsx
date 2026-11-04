import type { Metadata } from "next";
import { OrderStatusClient } from "@/components/shop/OrderStatusClient";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { formatShopHours } from "@/lib/storefront/studioText";
import { safeHttpUrl, telegramHref, viberHref } from "@/lib/studioInfo/studioInfo";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("myOrder"), robots: SHOP_PRIVATE_ROBOTS };
}

export default async function ShopOrderPage({ params }: Props) {
  const { token } = await params;
  const lang = await getShopLang();
  const contacts = await loadShopContacts();
  const viber = contacts.wholesale.find((c) => c.viber) ?? null;
  const telegram = contacts.wholesale.find((c) => c.telegram) ?? null;
  const pickup = { address: contacts.address, hours: formatShopHours(contacts.hours, lang), mapUrl: safeHttpUrl(contacts.mapUrl) };
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <OrderStatusClient
        token={token}
        viberHref={viber ? viberHref(viber.phone) : null}
        telegramHref={telegram ? telegramHref(telegram.phone) : null}
        pickup={pickup}
      />
    </main>
  );
}
