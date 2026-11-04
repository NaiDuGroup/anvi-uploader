import type { Metadata } from "next";
import { CompanyRequestForm } from "@/components/shop/CompanyRequestForm";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { shopPageMetadata } from "@/lib/storefront/shopSeo";
import { contactName } from "@/lib/storefront/studioText";
import { formatPhone, telHref, telegramHref, viberHref, whatsappHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  const t = shopT(lang);
  return shopPageMetadata({ title: t("companiesTitle"), description: t("companiesText"), path: "/companii", lang });
}

export default async function ShopCompaniesPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const contacts = await loadShopContacts();
  // Where to write while the form is not wired: e-mail if stored, else the phone + Viber.
  const reach = [
    ...(contacts.email ? [{ label: contacts.email, href: `mailto:${contacts.email}` }] : []),
    ...contacts.wholesale.flatMap((c) => [
      { label: formatPhone(c.phone), href: telHref(c.phone) },
      ...(c.viber ? [{ label: `Viber ${formatPhone(c.phone)}`, href: viberHref(c.phone) }] : []),
    ]),
  ];
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
                {c.name ? <span className="text-(--muted)">{contactName(c.name, lang)}</span> : null}
                {c.viber ? <a href={viberHref(c.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">Viber</a> : null}
                {c.whatsapp ? <a href={whatsappHref(c.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">WhatsApp</a> : null}
                {c.telegram ? <a href={telegramHref(c.phone)} className="inline-flex min-h-10 items-center rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline">Telegram</a> : null}
              </li>
            ))}
          </ul>
          {contacts.address ? <span className="text-(--muted)">{contacts.address}</span> : null}
        </div>
      </div>
      <CompanyRequestForm contacts={reach} />
    </main>
  );
}
