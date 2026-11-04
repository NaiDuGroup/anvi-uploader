import type { Metadata } from "next";
import { CompanyRequestForm } from "@/components/shop/CompanyRequestForm";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { formatPhone, telHref, telegramHref, viberHref, whatsappHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("companiesTitle") };
}

export default async function ShopCompaniesPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const contacts = await loadShopContacts();
  return (
    <main className="mx-auto grid max-w-[1320px] items-start gap-8 px-4 pt-6 pb-12 sm:px-6 sm:pt-10 lg:grid-cols-[1fr_440px]">
      <div className="flex flex-col gap-5">
        <span className="self-start rounded-full bg-(--gold) px-3 py-1.5 text-[13px] font-bold">{t("companyEyebrow")}</span>
        <h1 className="m-0 text-[30px] leading-tight font-extrabold sm:text-[44px]">{t("companyTitle")}</h1>
        <p className="m-0 max-w-[640px] text-base leading-relaxed text-(--muted) sm:text-lg">{t("companiesText")}</p>
        <div className="flex flex-col gap-3">
          <b>{t("companiesContact")}</b>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {contacts.wholesale.map((c) => (
              <li key={c.phone} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <a href={telHref(c.phone)} className="text-lg font-extrabold">
                  {formatPhone(c.phone)}
                </a>
                {c.name ? <span className="text-(--muted)">{c.name}</span> : null}
                {c.viber ? <a href={viberHref(c.phone)} className="rounded-lg bg-(--soft) px-3 py-1.5 text-sm font-bold no-underline">Viber</a> : null}
                {c.whatsapp ? <a href={whatsappHref(c.phone)} className="rounded-lg bg-(--soft) px-3 py-1.5 text-sm font-bold no-underline">WhatsApp</a> : null}
                {c.telegram ? <a href={telegramHref(c.phone)} className="rounded-lg bg-(--soft) px-3 py-1.5 text-sm font-bold no-underline">Telegram</a> : null}
              </li>
            ))}
          </ul>
          {contacts.address ? <span className="text-(--muted)">{contacts.address}</span> : null}
        </div>
      </div>
      <CompanyRequestForm />
    </main>
  );
}
