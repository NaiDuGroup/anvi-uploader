import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import type { ShopContacts } from "@/lib/storefront/contacts";
import { shopHref } from "@/lib/storefront/shopHost";
import { formatPhone, telHref } from "@/lib/studioInfo/studioInfo";

export function ShopFooter({
  lang,
  contacts,
  base = "/shop",
}: {
  lang: ShopLang;
  contacts: ShopContacts;
  base?: "" | "/shop";
}) {
  const t = shopT(lang);
  const href = (p: string) => shopHref(base, p);
  return (
    <footer className="mt-16 border-t border-(--line) bg-(--soft) md:mt-20">
      <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-6 px-4 py-9 text-sm text-(--muted) sm:px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-(--ink)">{t("footerCompany")}</span>
            <span>{contacts.address}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={href("/shop/companii")}>{t("forCompanies")}</Link>
          <Link href={href("/shop/cos")}>{t("cart")}</Link>
          {contacts.mainPhone ? <a href={telHref(contacts.mainPhone)}>{formatPhone(contacts.mainPhone)}</a> : null}
        </div>
      </div>
    </footer>
  );
}
