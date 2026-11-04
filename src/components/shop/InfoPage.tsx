import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { JsonLd } from "@/components/shop/JsonLd";
import { isRealPaymentConfigured } from "@/lib/shop/paymentMode";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { pickLocalized, shopT, type ShopLang } from "@/lib/storefront/i18n";
import {
  INFO_LABEL,
  INFO_PAGES,
  fillInfoText,
  infoFaqEntries,
  infoHref,
  infoPageVars,
  parseInfoInline,
  type InfoBlock,
  type InfoPageSlug,
} from "@/lib/storefront/infoPages";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { breadcrumbJsonLd, faqPageJsonLd, shopPageMetadata } from "@/lib/storefront/shopSeo";
import { safeHttpUrl } from "@/lib/studioInfo/studioInfo";

/** Metadata of an info page: title, description, Open Graph. */
export function infoPageMetadata(slug: InfoPageSlug, lang: ShopLang): Metadata {
  const page = INFO_PAGES[slug];
  return shopPageMetadata({
    title: pickLocalized(page.title, lang),
    description: pickLocalized(page.description, lang),
    path: `/${slug}`,
    lang,
    // Each info page has its own generated `opengraph-image` (src/app/shop/<slug>/opengraph-image.tsx).
    ownImage: true,
  });
}

function Text({ text, base }: { text: string; base: "" | "/shop" }) {
  return (
    <>
      {parseInfoInline(text).map((part, i) =>
        part.kind === "text" ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : part.href.startsWith("/") ? (
          <Link key={i} href={infoHref(base, part.href)} className="font-semibold">
            {part.text}
          </Link>
        ) : (
          <a key={i} href={part.href} rel="noopener noreferrer" className="font-semibold">
            {part.text}
          </a>
        ),
      )}
    </>
  );
}

/** /despre, /livrare-si-plata, /intrebari: copy from `infoPages.ts` with the studio facts filled in. */
export async function InfoPage({ slug }: { slug: InfoPageSlug }) {
  const lang = await getShopLang();
  const t = shopT(lang);
  const base = await getShopBase();
  const contacts = await loadShopContacts();
  const page = INFO_PAGES[slug];
  const vars = infoPageVars({
    lang,
    address: contacts.address,
    hours: contacts.hours,
    phone: contacts.mainPhone,
    paymentLive: isRealPaymentConfigured(),
  });
  const fill = (l: Parameters<typeof pickLocalized>[0]) => fillInfoText(pickLocalized(l, lang), vars);
  const mapUrl: string | null = safeHttpUrl(contacts.mapUrl);
  const title: string = pickLocalized(page.title, lang);

  const block = (b: InfoBlock, i: number) => {
    switch (b.kind) {
      case "p":
        return (
          <p key={i} className="m-0 leading-relaxed">
            <Text text={fill(b.text)} base={base} />
          </p>
        );
      case "list":
        return (
          <ul key={i} className="m-0 flex list-disc flex-col gap-1.5 pl-6 leading-relaxed">
            {b.items.map((it, j) => (
              <li key={j}>
                <Text text={fill(it)} base={base} />
              </li>
            ))}
          </ul>
        );
      case "map":
        return mapUrl ? (
          <a
            key={i}
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center self-start rounded-lg bg-(--soft) px-3 text-sm font-bold no-underline"
          >
            {pickLocalized(INFO_LABEL.map, lang)}
          </a>
        ) : null;
    }
  };

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-5 pb-12 sm:px-6 sm:pt-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: t("home"), path: "/" },
            { name: title, path: `/${slug}` },
          ]),
          // FAQ: the same questions as rich-result data, in the page language.
          ...(page.faq ? [faqPageJsonLd(infoFaqEntries(page, lang, vars))] : []),
        ]}
      />
      <nav aria-label={t("breadcrumbs")} className="flex flex-wrap gap-2 text-sm text-(--muted2)">
        <Link href={infoHref(base, "/")}>{t("home")}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <h1 className="m-0 text-[28px] leading-tight font-extrabold sm:text-4xl">{title}</h1>
      <p className="m-0 max-w-[680px] text-base leading-relaxed text-(--muted) sm:text-lg">
        <Text text={fill(page.lead)} base={base} />
      </p>
      {page.faq ? (
        <div className="flex flex-col gap-3">
          {page.sections.map((s, i) => (
            <details key={i} className="group rounded-2xl border-[1.5px] border-(--line) px-5 py-4 open:bg-(--soft)">
              <summary className="cursor-pointer list-none text-lg font-bold marker:hidden">
                <h2 className="m-0 inline text-lg font-bold">{fill(s.heading)}</h2>
              </summary>
              <div className="mt-3 flex flex-col gap-3 text-(--ink)">{s.blocks.map(block)}</div>
            </details>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {page.sections.map((s, i) => (
            <section key={i} className="flex flex-col gap-3">
              <h2 className="m-0 text-xl font-extrabold sm:text-2xl">{fill(s.heading)}</h2>
              {s.blocks.map(block)}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
