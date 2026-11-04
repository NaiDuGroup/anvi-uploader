import type { Metadata } from "next";
import type { WeekHours } from "@/lib/studioInfo/studioHours";
import { WEEKDAYS, phoneDigits, type Weekday } from "@/lib/studioInfo/studioInfo";
import { SHOP_LANGS, shopT, type Localized, type ShopLang } from "./i18n";
import { shopOrigin } from "./shopHost";

/**
 * Search / link-preview helpers of the storefront: per-page Open Graph +
 * Twitter metadata, JSON-LD (Product, BreadcrumbList, LocalBusiness), the
 * sitemap and robots.txt. Pure (unit-tested): pages pass the data in.
 *
 * The language is a cookie (`shop_lang`), not part of the URL: one URL per
 * page, so there are no hreflang alternates. Crawlers and link-preview bots
 * send no cookie and see Romanian.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const SHOP_SITE_NAME = "ANVI";

/** `og:locale` per shop language (Facebook's locale list has no `*_MD`). */
export const SHOP_OG_LOCALE: Record<ShopLang, string> = { ro: "ro_RO", ru: "ru_RU", en: "en_US" };

export interface ShopOgImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * The generated brand image of /shop (`src/app/shop/opengraph-image.tsx`):
 * the preview of pages without their own image. A route segment's own
 * `opengraph-image` file takes priority over it (home, categories, info pages).
 */
export const SHOP_DEFAULT_OG_IMAGE: ShopOgImage = {
  url: "/shop/opengraph-image",
  width: 1200,
  height: 630,
  alt: "ANVI — produse personalizate",
};

/**
 * Metadata of one storefront page: title, description, Open Graph and the
 * Twitter card. `path` is the clean storefront path (`/cani`, `/p/cana-alba`),
 * resolved against `metadataBase` (https://anvi.md). Images: `images` (product
 * photo); `ownImage` = the route segment has its own `opengraph-image` file
 * (Next only applies it when the page sets no `openGraph.images`); otherwise
 * the /shop brand image.
 */
export function shopPageMetadata(o: {
  title: string;
  description?: string;
  path: string;
  lang: ShopLang;
  images?: ShopOgImage[];
  ownImage?: boolean;
  /** Full `<title>` without the « · ANVI» template (home page). */
  absoluteTitle?: boolean;
  canonical?: string;
  /** Duplicate URL of another page (`/p/printare` → `/printare`): noindex, follow. */
  noindex?: boolean;
}): Metadata {
  const images: ShopOgImage[] | null = o.images?.length ? o.images : o.ownImage ? null : [SHOP_DEFAULT_OG_IMAGE];
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    ...(o.description ? { description: o.description } : {}),
    ...(o.canonical ? { alternates: { canonical: o.canonical } } : {}),
    ...(o.noindex ? { robots: SHOP_DUPLICATE_ROBOTS } : {}),
    openGraph: {
      type: "website",
      siteName: SHOP_SITE_NAME,
      title: o.title,
      ...(o.description ? { description: o.description } : {}),
      url: o.canonical ?? o.path,
      locale: SHOP_OG_LOCALE[o.lang],
      alternateLocale: SHOP_LANGS.filter((l) => l !== o.lang).map((l) => SHOP_OG_LOCALE[l]),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: o.title,
      ...(o.description ? { description: o.description } : {}),
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

/** Robots of a duplicate URL (`/p/printare`, `/p/carti-de-vizita`): out of the index, links still followed. */
export const SHOP_DUPLICATE_ROBOTS = { index: false, follow: true } as const;

/**
 * Robots of the private storefront pages (cart, checkout, account, order
 * status, payment, editor): never indexed. Replaces the layout's
 * `index, follow` once launched (Next merges `robots` per field set, the page wins).
 */
export const SHOP_PRIVATE_ROBOTS = { index: false, follow: false } as const;

/**
 * Private storefront paths (clean, without `/shop`): noindex pages, kept out
 * of the sitemap and disallowed in robots.txt. A trailing `/` = the subpaths
 * only (`/comanda/<token>`, `/editor/<kind>`).
 */
export const SHOP_PRIVATE_PATHS: readonly string[] = ["/cos", "/checkout", "/cont", "/comenzi", "/comanda/", "/pay/", "/tester", "/editor/"];

/** Whether a clean storefront path is private (see `SHOP_PRIVATE_PATHS`). */
export function isShopPrivatePath(path: string): boolean {
  return SHOP_PRIVATE_PATHS.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/** Link-preview image of a route segment with its own `opengraph-image` file (clean path of the page). */
export function shopSegmentOgImage(path: string, alt: string): ShopOgImage {
  return { url: `/shop${path === "/" ? "" : path}/opengraph-image`, width: 1200, height: 630, alt };
}

/** /printare: photo + document printing (`src/app/shop/printare`). */
export const SHOP_PRINT_PATH = "/printare";
/** /carti-de-vizita: business cards (`src/app/shop/carti-de-vizita`). */
export const SHOP_BC_PATH = "/carti-de-vizita";

/** Search description of /printare (the page intro is too long for a snippet). */
export const SHOP_PRINT_DESCRIPTION: Localized = {
  ro: "Printare documente și fotografii în Chișinău: încarci PDF, Word sau poze, alegi formatul și numărul de copii, plătești online — ridici din atelier sau primești prin curier.",
  ru: "Печать документов и фотографий в Кишинёве: загрузите PDF, Word или фото, выберите формат и число копий, оплатите онлайн — заберите в мастерской или получите курьером.",
  en: "Document and photo printing in Chișinău: upload a PDF, Word file or photos, choose the format and the number of copies, pay online — pick up at the workshop or get it by courier.",
};

/**
 * Metadata of /printare. `duplicate` = the same page at `/p/printare` (cart
 * «Editează» links): canonical /printare and noindex. Image: the segment's
 * own `opengraph-image` (src/app/shop/printare/opengraph-image.tsx).
 */
export function shopPrintPageMetadata(lang: ShopLang, o: { duplicate?: boolean } = {}): Metadata {
  const title: string = shopT(lang)("photoTileTitle");
  return shopPageMetadata({
    title,
    description: SHOP_PRINT_DESCRIPTION[lang],
    path: SHOP_PRINT_PATH,
    canonical: SHOP_PRINT_PATH,
    lang,
    ...(o.duplicate
      ? { noindex: true, images: [shopSegmentOgImage(SHOP_PRINT_PATH, shopT("ro")("photoTileTitle"))] }
      : { ownImage: true }),
  });
}

/** Metadata of /carti-de-vizita; `duplicate` = `/p/carti-de-vizita` (canonical /carti-de-vizita, noindex). */
export function shopBusinessCardPageMetadata(lang: ShopLang, o: { duplicate?: boolean } = {}): Metadata {
  const t = shopT(lang);
  return shopPageMetadata({
    title: t("bcTitle"),
    description: previewText(t("bcDescription")),
    path: SHOP_BC_PATH,
    canonical: SHOP_BC_PATH,
    lang,
    ...(o.duplicate ? { noindex: true, images: [shopSegmentOgImage(SHOP_BC_PATH, shopT("ro")("bcTitle"))] } : { ownImage: true }),
  });
}

/** Description for link previews: one line, at most `max` characters (cut on a word). */
export function previewText(text: string, max = 200): string {
  const one: string = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut: string = one.slice(0, max - 1);
  const space: number = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** Absolute URL on the shop origin for a clean path or an already absolute URL. */
export function shopAbsUrl(pathOrUrl: string, env: Env = process.env): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${shopOrigin(env)}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

export type JsonLd = Record<string, unknown>;

/** `@id` of the studio node, referenced by product offers. */
export function shopBusinessId(env: Env = process.env): string {
  return `${shopOrigin(env)}/#business`;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], env: Env = process.env): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: shopAbsUrl(it.path, env),
    })),
  };
}

/**
 * Product with one offer: the lowest price per piece shown as «de la X lei»
 * (MDL). Availability follows the catalog flag (always in stock while the
 * shop's stock check is off).
 */
export function productJsonLd(
  p: {
    name: string;
    description: string;
    slug: string;
    image: string | null;
    price: number | null;
    available: boolean;
    category?: string;
  },
  path: string,
  env: Env = process.env,
): JsonLd {
  const url: string = shopAbsUrl(path, env);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    sku: p.slug,
    url,
    ...(p.image ? { image: [shopAbsUrl(p.image, env)] } : {}),
    ...(p.category ? { category: p.category } : {}),
    brand: { "@type": "Brand", name: SHOP_SITE_NAME },
    ...(p.price != null && p.price > 0
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: p.price.toFixed(2),
            priceCurrency: "MDL",
            availability: p.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@id": shopBusinessId(env) },
          },
        }
      : {}),
  };
}

const SCHEMA_DAY: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Opening hours as schema.org specs: days with the same intervals share one entry per interval. */
export function openingHoursJsonLd(hours: WeekHours): JsonLd[] {
  const groups = new Map<string, { days: Weekday[]; intervals: { from: string; to: string }[] }>();
  for (const d of WEEKDAYS) {
    const list = [...(hours[d] ?? [])].sort((a, b) => a.from.localeCompare(b.from));
    if (!list.length) continue;
    const key = JSON.stringify(list);
    const g = groups.get(key);
    if (g) g.days.push(d);
    else groups.set(key, { days: [d], intervals: list });
  }
  const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
  return [...groups.values()].flatMap((g) =>
    g.intervals.map((i) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: g.days.map((d) => `https://schema.org/${SCHEMA_DAY[d]}`),
      opens: pad(i.from),
      closes: pad(i.to),
    })),
  );
}

/** «str. Alba-Iulia 77/18, Chișinău» → street + locality (the last comma part). */
export function splitStudioAddress(address: string): { street: string; locality: string } {
  const i: number = address.lastIndexOf(",");
  if (i < 0) return { street: address.trim(), locality: "Chișinău" };
  return { street: address.slice(0, i).trim(), locality: address.slice(i + 1).trim() || "Chișinău" };
}

/** The studio as a LocalBusiness (home page): address, phone, hours, map. No geo — coordinates are not stored. */
export function localBusinessJsonLd(
  c: {
    companyName: string;
    idno: string | null;
    address: string;
    mainPhone: string;
    mapUrl: string | null;
    hours: WeekHours;
    description: string;
  },
  env: Env = process.env,
): JsonLd {
  const origin: string = shopOrigin(env);
  const { street, locality } = splitStudioAddress(c.address);
  const digits: string = phoneDigits(c.mainPhone);
  const hours = openingHoursJsonLd(c.hours);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": shopBusinessId(env),
    name: "ANVI-STUDIO",
    legalName: c.companyName,
    description: c.description,
    url: `${origin}/`,
    logo: `${origin}/logo.png`,
    image: `${origin}/logo.png`,
    ...(digits ? { telephone: `+${digits}` } : {}),
    ...(c.idno ? { taxID: c.idno } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: locality,
      addressCountry: "MD",
    },
    ...(c.mapUrl ? { hasMap: c.mapUrl } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    currenciesAccepted: "MDL",
    areaServed: { "@type": "Country", name: "Moldova" },
  };
}

/** FAQPage (the /intrebari page): plain-text questions and answers in the page language. */
export function faqPageJsonLd(entries: readonly { question: string; answer: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` escaped so the text can never close the tag. */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// ─── Sitemap + robots ───────────────────────────────────────────────────────

/** Info and legal pages listed in the sitemap (clean paths). */
export const SHOP_SITEMAP_STATIC_PATHS: readonly string[] = [
  "/printare",
  "/despre",
  "/livrare-si-plata",
  "/intrebari",
  "/companii",
  "/termeni",
  "/retur",
  "/confidentialitate",
];

/** Product slugs whose `/p/<slug>` is a duplicate of a page of its own (not in the sitemap). */
const SHOP_DUPLICATE_PRODUCT_SLUGS: ReadonlySet<string> = new Set(["printare", "carti-de-vizita"]);

/** Every indexable storefront URL: home, categories, products, info pages (no cart, checkout, account, editor). */
export function shopSitemapPaths(o: { categorySlugs: readonly string[]; productSlugs: readonly string[] }): string[] {
  const paths: string[] = [
    "/",
    ...o.categorySlugs.map((s) => `/${s}`),
    ...o.productSlugs.filter((s) => !SHOP_DUPLICATE_PRODUCT_SLUGS.has(s)).map((s) => `/p/${encodeURIComponent(s)}`),
    ...SHOP_SITEMAP_STATIC_PATHS,
  ];
  return [...new Set(paths)].filter((p) => !isShopPrivatePath(p));
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildShopSitemapXml(paths: readonly string[], env: Env = process.env): string {
  const urls: string = paths
    .map((p) => {
      const priority: string = p === "/" ? "1.0" : p.startsWith("/p/") ? "0.8" : SHOP_SITEMAP_STATIC_PATHS.includes(p) ? "0.5" : "0.9";
      return `  <url><loc>${xmlEscape(shopAbsUrl(p, env))}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * The «de la X lei» price of a product in previews and JSON-LD: the cheapest
 * option for a single piece (`fromPrice`), not the bulk run price, so the
 * offer matches what one piece costs on the page.
 */
export function shopFromPrice(p: { unitFrom: number | null; fromPrice: number | null }): number | null {
  return p.fromPrice ?? p.unitFrom;
}
