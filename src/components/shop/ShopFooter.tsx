import Link from "next/link";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import type { ShopContacts } from "@/lib/storefront/contacts";
import { shopHref } from "@/lib/storefront/shopHost";
import { formatPhone, telHref } from "@/lib/studioInfo/studioInfo";

const linkCls = "inline-flex min-h-10 items-center";

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
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" />
          <address className="flex flex-col gap-0.5 not-italic">
            <span className="font-semibold text-(--ink)">{contacts.companyName}</span>
            {contacts.idno ? <span>{t("idno", { code: contacts.idno })}</span> : null}
            {contacts.legalAddress && contacts.legalAddress !== contacts.address ? (
              <span>{t("footerLegalAddress", { address: contacts.legalAddress })}</span>
            ) : null}
            {contacts.address ? <span>{t("footerWorkshopAddress", { address: contacts.address })}</span> : null}
            {contacts.mainPhone ? (
              <a href={telHref(contacts.mainPhone)} className={linkCls}>
                {formatPhone(contacts.mainPhone)}
              </a>
            ) : null}
            {contacts.email ? (
              <a href={`mailto:${contacts.email}`} className={linkCls}>
                {contacts.email}
              </a>
            ) : null}
          </address>
        </div>
        <nav aria-label={t("footerContacts")} className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <Link href={href("/shop/companii")} className={linkCls}>
            {t("forCompanies")}
          </Link>
          <Link href={href("/shop/cos")} className={linkCls}>
            {t("cart")}
          </Link>
          <Link href={href("/shop/comenzi")} className={linkCls}>
            {t("myOrders")}
          </Link>
          <Link href={href("/shop/termeni")} className={linkCls}>
            {t("footerTerms")}
          </Link>
          <Link href={href("/shop/retur")} className={linkCls}>
            {t("footerReturns")}
          </Link>
          <Link href={href("/shop/confidentialitate")} className={linkCls}>
            {t("footerPrivacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
