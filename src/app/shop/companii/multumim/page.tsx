import type { Metadata } from "next";
import Link from "next/link";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { corpT } from "@/lib/storefront/corporateText";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { shopHref } from "@/lib/storefront/shopHost";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";
import { formatPhone, telHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: corpT(await getShopLang())("thanksTitle"), robots: SHOP_PRIVATE_ROBOTS };
}

/** «Am primit cererea» — after the «Pentru companii» form (`?nr=` = request number). */
export default async function CorporateThanksPage({ searchParams }: { searchParams: Promise<{ nr?: string }> }) {
  const lang = await getShopLang();
  const c = corpT(lang);
  const href = shopHref.bind(null, await getShopBase());
  const nr = (await searchParams).nr;
  const number = nr && /^\d{1,9}$/.test(nr) ? nr : null;
  const contacts = await loadShopContacts();
  const phone = contacts.wholesale[0]?.phone ?? contacts.mainPhone;

  return (
    <main className="mx-auto flex max-w-[720px] flex-col items-start gap-5 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-(--ok-soft) text-2xl text-(--ok)">
        ✓
      </span>
      <h1 className="m-0 text-[30px] leading-tight font-extrabold sm:text-[40px]">{c("thanksTitle")}</h1>
      {number ? <p className="m-0 text-lg font-bold">{c("thanksNumber", { n: number })}</p> : null}
      <p className="m-0 text-base leading-relaxed text-(--muted) sm:text-lg">{c("thanksText")}</p>
      {phone ? (
        <p className="m-0">
          {c("thanksUrgent")}{" "}
          <a href={telHref(phone)} className="font-extrabold">
            {formatPhone(phone)}
          </a>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold text-white no-underline">
          {c("thanksBack")}
        </Link>
        <Link href={href("/shop/companii")} className="rounded-xl border-[1.5px] border-(--line2) bg-white px-6 py-3.5 font-bold no-underline">
          {c("thanksAnother")}
        </Link>
      </div>
    </main>
  );
}
