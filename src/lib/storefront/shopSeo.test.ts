import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shopPaymentState } from "@/lib/shop/paymentMode";
import { DEFAULT_STUDIO_INFO } from "@/lib/studioInfo/studioInfo";
import { SHOP_CATEGORIES } from "./catalogConfig";
import { SHOP_LANGS, shopT, type Localized } from "./i18n";
import { INFO_LABEL, INFO_PAGES, fillInfoText, infoFaqEntries, infoHref, infoPageVars, parseInfoInline, stripInfoLinks } from "./infoPages";
import { PRINT_ACCEPT } from "./printFiles";
import { SHOP_ROBOTS_DISALLOW, routeShopRequest, shopRobotsTxt } from "./shopHost";
import { shopLayoutMetadata, shopTestBannerKeys } from "./shopMetadata";
import {
  SHOP_DEFAULT_OG_IMAGE,
  SHOP_DUPLICATE_ROBOTS,
  SHOP_PRINT_DESCRIPTION,
  SHOP_PRIVATE_PATHS,
  SHOP_PRIVATE_ROBOTS,
  SHOP_SITEMAP_STATIC_PATHS,
  breadcrumbJsonLd,
  buildShopSitemapXml,
  faqPageJsonLd,
  isShopPrivatePath,
  shopBusinessCardPageMetadata,
  shopPrintPageMetadata,
  shopSegmentOgImage,
  jsonLdScript,
  localBusinessJsonLd,
  openingHoursJsonLd,
  previewText,
  productJsonLd,
  shopFromPrice,
  shopPageMetadata,
  shopSitemapPaths,
  splitStudioAddress,
} from "./shopSeo";

const ENV = {};
const LAUNCHED = { SHOP_LAUNCHED: "1" };

describe("page metadata (Open Graph + Twitter)", () => {
  it("has title, description, absolute-ready url, locale and a large card", () => {
    const m = shopPageMetadata({ title: "Căni", description: "Căni cu poza ta", path: "/cani", lang: "ro" });
    expect(m.title).toBe("Căni");
    expect(m.openGraph).toMatchObject({
      type: "website",
      siteName: "ANVI",
      title: "Căni",
      description: "Căni cu poza ta",
      url: "/cani",
      locale: "ro_RO",
      alternateLocale: ["ru_RU", "en_US"],
    });
    // Default: the /shop brand image.
    expect((m.openGraph as { images?: unknown }).images).toEqual([SHOP_DEFAULT_OG_IMAGE]);
    expect((m.twitter as { images?: unknown }).images).toEqual(["/shop/opengraph-image"]);
    // A segment with its own opengraph-image file: no images key, so Next applies the file.
    const own = shopPageMetadata({ title: "Căni", path: "/cani", lang: "ro", ownImage: true });
    expect(own.openGraph).not.toHaveProperty("images");
    expect(own.twitter).not.toHaveProperty("images");
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Căni" });
  });

  it("product pages carry the product photo; locale follows the page language", () => {
    const m = shopPageMetadata({
      title: "Cană albă",
      path: "/p/cana-alba",
      lang: "ru",
      images: [{ url: "/api/public/file?key=a.jpg", alt: "Cană albă" }],
    });
    expect((m.openGraph as { images?: unknown }).images).toEqual([{ url: "/api/public/file?key=a.jpg", alt: "Cană albă" }]);
    expect((m.twitter as { images?: unknown }).images).toEqual(["/api/public/file?key=a.jpg"]);
    expect((m.openGraph as { locale?: string }).locale).toBe("ru_RU");
  });

  it("home title is absolute; an explicit canonical replaces the layout one", () => {
    expect(shopPageMetadata({ title: "ANVI", path: "/", lang: "en", absoluteTitle: true }).title).toEqual({ absolute: "ANVI" });
    const bc = shopPageMetadata({ title: "BC", path: "/carti-de-vizita", canonical: "/carti-de-vizita", lang: "ro" });
    expect(bc.alternates).toEqual({ canonical: "/carti-de-vizita" });
  });

  it("preview text is one line and cut on a word", () => {
    expect(previewText("a\n b")).toBe("a b");
    const long = previewText("cuvânt ".repeat(60), 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith("…")).toBe(true);
  });

  it("«de la» price is the cheapest single piece, then the run price", () => {
    expect(shopFromPrice({ fromPrice: 120, unitFrom: 9 })).toBe(120);
    expect(shopFromPrice({ fromPrice: null, unitFrom: 9 })).toBe(9);
  });
});

describe("layout metadata: launch switch", () => {
  it("closed test → noindex; launched on anvi.md → index, follow; print.anvi.md → noindex always", () => {
    expect(shopLayoutMetadata("/", ENV).robots).toEqual({ index: false, follow: false });
    expect(shopLayoutMetadata("/cani", LAUNCHED).robots).toEqual({ index: true, follow: true });
    expect(shopLayoutMetadata(null, LAUNCHED).robots).toEqual({ index: false, follow: false });
  });

  it("absolute URLs on https://anvi.md, canonical = clean path", () => {
    const m = shopLayoutMetadata("/p/cana", LAUNCHED, "ru");
    expect(String(m.metadataBase)).toBe("https://anvi.md/");
    expect(m.alternates).toEqual({ canonical: "/p/cana" });
    expect(m.openGraph).toMatchObject({ siteName: "ANVI", url: "/p/cana", locale: "ru_RU" });
    expect(String(shopLayoutMetadata("/", { SHOP_HOSTS: "shop.localhost" }).metadataBase)).toBe("https://shop.localhost/");
  });

  it("banner: closed test until launched; launching alone does not enable payment", () => {
    expect(shopTestBannerKeys(false, "unavailable")).toEqual(["closedTestBanner"]);
    expect(shopTestBannerKeys(false, "tester")).toEqual(["closedTestBanner", "testerMode"]);
    expect(shopTestBannerKeys(true, "unavailable")).toEqual([]);
    expect(shopTestBannerKeys(true, "tester")).toEqual(["testerMode"]);
    expect(shopTestBannerKeys(true, "real")).toEqual([]);
    const prod = { VERCEL_ENV: "production", NODE_ENV: "production" };
    expect(shopPaymentState(prod)).toBe("unavailable");
    expect(shopPaymentState({ ...prod, ...LAUNCHED })).toBe("unavailable");
    expect(shopPaymentState({ ...prod, ...LAUNCHED }, { tester: true })).toBe("tester");
  });
});

describe("JSON-LD", () => {
  it("Product with an MDL offer on https://anvi.md", () => {
    const ld = productJsonLd(
      { name: "Cană albă", description: "330 ml", slug: "cana-alba", image: "/api/public/file?k=1", price: 139, available: true, category: "Căni" },
      "/p/cana-alba",
      ENV,
    );
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Cană albă",
      sku: "cana-alba",
      url: "https://anvi.md/p/cana-alba",
      image: ["https://anvi.md/api/public/file?k=1"],
      offers: {
        "@type": "Offer",
        price: "139.00",
        priceCurrency: "MDL",
        availability: "https://schema.org/InStock",
        url: "https://anvi.md/p/cana-alba",
        seller: { "@id": "https://anvi.md/#business" },
      },
    });
    // No price → no offer (an Offer without a price is invalid).
    expect(productJsonLd({ name: "x", description: "", slug: "x", image: null, price: null, available: true }, "/p/x", ENV).offers).toBeUndefined();
    // Absolute CDN photos stay as they are.
    expect(productJsonLd({ name: "x", description: "", slug: "x", image: "https://cdn.example/x.jpg", price: 1, available: false }, "/p/x", ENV)).toMatchObject({
      image: ["https://cdn.example/x.jpg"],
      offers: { availability: "https://schema.org/OutOfStock" },
    });
  });

  it("BreadcrumbList with positions and absolute items", () => {
    expect(breadcrumbJsonLd([{ name: "Acasă", path: "/" }, { name: "Căni", path: "/cani" }], ENV)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Acasă", item: "https://anvi.md/" },
        { "@type": "ListItem", position: 2, name: "Căni", item: "https://anvi.md/cani" },
      ],
    });
  });

  it("LocalBusiness from the studio card: address, phone, hours (no geo: not stored)", () => {
    const ld = localBusinessJsonLd(
      {
        companyName: "ANVI-STUDIO GROUP SRL",
        idno: "1023600000396",
        address: DEFAULT_STUDIO_INFO.address,
        mainPhone: DEFAULT_STUDIO_INFO.mainPhone,
        mapUrl: DEFAULT_STUDIO_INFO.mapUrl,
        hours: DEFAULT_STUDIO_INFO.hours,
        description: "d",
      },
      ENV,
    );
    expect(ld).toMatchObject({
      "@type": "LocalBusiness",
      "@id": "https://anvi.md/#business",
      legalName: "ANVI-STUDIO GROUP SRL",
      url: "https://anvi.md/",
      logo: "https://anvi.md/logo.png",
      telephone: "+37379545631",
      taxID: "1023600000396",
      address: { "@type": "PostalAddress", streetAddress: "str. Alba-Iulia 77/18", addressLocality: "Chișinău", addressCountry: "MD" },
    });
    expect(ld.geo).toBeUndefined();
    const hours = ld.openingHoursSpecification as { dayOfWeek: string[]; opens: string; closes: string }[];
    expect(hours.length).toBeGreaterThan(0);
    for (const h of hours) {
      expect(h.opens).toMatch(/^\d\d:\d\d$/);
      expect(h.closes).toMatch(/^\d\d:\d\d$/);
      expect(h.dayOfWeek.every((d) => d.startsWith("https://schema.org/"))).toBe(true);
    }
    // Sunday is closed: never listed.
    expect(hours.some((h) => h.dayOfWeek.includes("https://schema.org/Sunday"))).toBe(false);
  });

  it("opening hours group days with the same intervals", () => {
    const iv = [{ from: "9:00", to: "18:00" }];
    const spec = openingHoursJsonLd({ mon: iv, tue: iv, wed: [], thu: [], fri: [], sat: [{ from: "10:00", to: "15:00" }], sun: [] });
    expect(spec).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["https://schema.org/Monday", "https://schema.org/Tuesday"], opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["https://schema.org/Saturday"], opens: "10:00", closes: "15:00" },
    ]);
  });

  it("address split and script escaping", () => {
    expect(splitStudioAddress("str. Alba-Iulia 77/18, Chișinău")).toEqual({ street: "str. Alba-Iulia 77/18", locality: "Chișinău" });
    expect(splitStudioAddress("Alba-Iulia 77")).toEqual({ street: "Alba-Iulia 77", locality: "Chișinău" });
    const s = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("sitemap + robots", () => {
  const paths = shopSitemapPaths({ categorySlugs: [...SHOP_CATEGORIES.map((c) => c.slug), "carti-de-vizita"], productSlugs: ["cana-alba", "pix"] });

  it("lists home, categories, products and info pages — not cart, checkout or account", () => {
    expect(paths[0]).toBe("/");
    expect(paths).toContain("/cani");
    expect(paths).toContain("/carti-de-vizita");
    expect(paths).toContain("/p/cana-alba");
    for (const p of ["/despre", "/livrare-si-plata", "/intrebari", "/companii", "/retur"]) expect(paths).toContain(p);
    for (const p of ["/cos", "/checkout", "/cont", "/comenzi"]) expect(paths).not.toContain(p);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("XML with absolute https://anvi.md URLs", () => {
    const xml = buildShopSitemapXml(paths, ENV);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://anvi.md/</loc>");
    expect(xml).toContain("<loc>https://anvi.md/p/cana-alba</loc>");
    expect(xml.match(/<url>/g)?.length).toBe(paths.length);
    expect(xml).not.toMatch(/<loc>(?!https:\/\/anvi\.md\/)/);
    expect(buildShopSitemapXml(["/p/a&b"], ENV)).toContain("<loc>https://anvi.md/p/a&amp;b</loc>");
  });

  it("robots.txt: Disallow all in the closed test; Allow + Sitemap once launched", () => {
    expect(shopRobotsTxt(ENV)).toBe("User-agent: *\nDisallow: /\n");
    const live = shopRobotsTxt(LAUNCHED);
    expect(live).toContain("Allow: /\n");
    expect(live).not.toContain("Disallow: /\n");
    expect(live).toContain("Disallow: /cos\n");
    expect(live).toContain("Disallow: /checkout\n");
    expect(live).toContain("Sitemap: https://anvi.md/sitemap.xml");
  });

  it("/sitemap.xml on the shop host goes to the storefront route in both modes", () => {
    expect(routeShopRequest("anvi.md", "/sitemap.xml", "", ENV)).toEqual({ kind: "rewrite", pathname: "/shop/sitemap.xml" });
    expect(routeShopRequest("anvi.md", "/sitemap.xml", "", LAUNCHED)).toEqual({ kind: "rewrite", pathname: "/shop/sitemap.xml" });
    expect(SHOP_SITEMAP_STATIC_PATHS.every((p) => p.startsWith("/"))).toBe(true);
  });
});

describe("info pages (/despre, /livrare-si-plata, /intrebari)", () => {
  const all: Localized[] = [];
  for (const page of Object.values(INFO_PAGES)) {
    all.push(page.title, page.description, page.lead);
    for (const s of page.sections) {
      all.push(s.heading);
      for (const b of s.blocks) {
        if (b.kind === "p") all.push(b.text);
        if (b.kind === "list") all.push(...b.items);
      }
    }
  }
  all.push(...Object.values(INFO_LABEL));
  const vars = infoPageVars({ lang: "ro", address: "str. Alba-Iulia 77/18, Chișinău", hours: DEFAULT_STUDIO_INFO.hours, phone: "+37379545631", paymentLive: false });

  it("every text exists in ro, ru and en, with the same placeholders and links", () => {
    for (const l of all) {
      for (const lang of SHOP_LANGS) expect(l[lang].trim().length, JSON.stringify(l)).toBeGreaterThan(0);
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      const links = (s: string) => parseInfoInline(s).filter((p) => p.kind === "link").map((p) => (p as { href: string }).href).join();
      expect(ph(l.ru), l.ro).toBe(ph(l.ro));
      expect(ph(l.en), l.ro).toBe(ph(l.ro));
      expect(links(l.ru), l.ro).toBe(links(l.ro));
      expect(links(l.en), l.ro).toBe(links(l.ro));
      // Every placeholder has a value.
      for (const lang of SHOP_LANGS) expect(fillInfoText(l[lang], vars)).not.toMatch(/\{\w+\}/);
    }
  });

  it("links point at existing storefront pages", () => {
    const known = new Set(["/retur", "/companii", "/carti-de-vizita", "/cont", "/intrebari", "/livrare-si-plata", "/printare"]);
    for (const l of all) for (const p of parseInfoInline(l.ro)) if (p.kind === "link") expect(known.has(p.href), p.href).toBe(true);
    expect(infoHref("", "/retur")).toBe("/retur");
    expect(infoHref("/shop", "/retur")).toBe("/shop/retur");
    expect(infoHref("/shop", "/")).toBe("/shop");
  });

  it("facts come from the shop constants: production time, delivery prices, Paynet «în curând»", () => {
    expect(vars.readyIn).toBe(shopT("ro")("readyIn").replace("✓ ", ""));
    expect(vars.readyIn).toContain("1–2 zile lucrătoare");
    const sp = (x: string) => x.replace(/\s/g, " ");
    expect(sp(vars.courierChisinau)).toBe("45 lei");
    expect(sp(vars.courierMoldova)).toBe("60 lei");
    expect(vars.phone).toBe("+373 79 545 631");
    expect(vars.soon).toBe(" (în curând)");
    expect(infoPageVars({ lang: "ru", address: "", hours: DEFAULT_STUDIO_INFO.hours, phone: "", paymentLive: true }).soon).toBe("");
    expect(sp(infoPageVars({ lang: "ru", address: "", hours: DEFAULT_STUDIO_INFO.hours, phone: "", paymentLive: false }).courierChisinau)).toBe("45 лей");
    expect(infoPageVars({ lang: "en", address: "", hours: DEFAULT_STUDIO_INFO.hours, phone: "", paymentLive: false }).readyIn).toBe("Ready in 1–2 working days");
  });

  it("FAQ covers files, resolution, bleed, editor, delivery, payment, changes, companies and account", () => {
    const qs = INFO_PAGES.intrebari.sections.map((s) => s.heading.ro + " " + s.blocks.map((b) => (b.kind === "p" ? b.text.ro : "")).join(" "));
    for (const re of [/fișiere/i, /rezoluție/i, /bleed/i, /editor/i, /livrare/i, /plătesc/i, /\/retur/, /\/companii/, /parolă/i]) {
      expect(qs.some((q) => re.test(q)), String(re)).toBe(true);
    }
  });
});

describe("/printare and /carti-de-vizita: own metadata, duplicates under /p/", () => {
  it("/printare: per-language title + description, canonical /printare, its own OG image", () => {
    const titles = new Set<string>();
    for (const lang of SHOP_LANGS) {
      const m = shopPrintPageMetadata(lang);
      expect(m.title).toBe(shopT(lang)("photoTileTitle"));
      expect(m.title).not.toBe(shopT(lang)("metaTitle"));
      expect(m.description).toBe(SHOP_PRINT_DESCRIPTION[lang]);
      expect((m.description ?? "").length).toBeLessThanOrEqual(200);
      expect(m.alternates).toEqual({ canonical: "/printare" });
      expect(m.robots).toBeUndefined();
      expect(m.openGraph).toMatchObject({ url: "/printare", title: m.title, description: m.description });
      // The segment's own opengraph-image applies only when the page sets no images.
      expect((m.openGraph as { images?: unknown }).images).toBeUndefined();
      titles.add(String(m.title));
    }
    expect(titles.size).toBe(SHOP_LANGS.length);
    expect(shopPrintPageMetadata("ro").title).toBe("Printare foto și documente");
  });

  it("/printare has a branded OG image and BreadcrumbList JSON-LD", () => {
    const og = readFileSync(join(process.cwd(), "src/app/shop/printare/opengraph-image.tsx"), "utf8");
    expect(og).toContain('title: "Printare foto și documente"');
    expect(og).toContain("shopOgImage(");
    const page = readFileSync(join(process.cwd(), "src/app/shop/printare/page.tsx"), "utf8");
    expect(page).toContain("breadcrumbJsonLd(");
    expect(page).toContain("shopPrintPageMetadata(");
    const b = breadcrumbJsonLd(
      [
        { name: shopT("ro")("home"), path: "/" },
        { name: shopT("ro")("photoTileTitle"), path: "/printare" },
      ],
      ENV,
    );
    expect(b.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: shopT("ro")("home"), item: "https://anvi.md/" },
      { "@type": "ListItem", position: 2, name: "Printare foto și documente", item: "https://anvi.md/printare" },
    ]);
  });

  it("/p/printare and /p/carti-de-vizita: canonical to the clean page, noindex, follow", () => {
    expect(SHOP_DUPLICATE_ROBOTS).toEqual({ index: false, follow: true });
    for (const lang of SHOP_LANGS) {
      const print = shopPrintPageMetadata(lang, { duplicate: true });
      expect(print.alternates).toEqual({ canonical: "/printare" });
      expect(print.robots).toEqual({ index: false, follow: true });
      expect(print.openGraph).toMatchObject({ url: "/printare", images: [{ url: "/shop/printare/opengraph-image" }] });
      const bc = shopBusinessCardPageMetadata(lang, { duplicate: true });
      expect(bc.alternates).toEqual({ canonical: "/carti-de-vizita" });
      expect(bc.robots).toEqual({ index: false, follow: true });
      expect(bc.openGraph).toMatchObject({ url: "/carti-de-vizita", images: [{ url: "/shop/carti-de-vizita/opengraph-image" }] });
      // The clean pages stay indexable.
      expect(shopBusinessCardPageMetadata(lang).robots).toBeUndefined();
      expect(shopBusinessCardPageMetadata(lang).alternates).toEqual({ canonical: "/carti-de-vizita" });
    }
    const p = readFileSync(join(process.cwd(), "src/app/shop/p/[slug]/page.tsx"), "utf8");
    expect(p).toContain("shopPrintPageMetadata(lang, { duplicate: true })");
    expect(p).toContain("shopBusinessCardPageMetadata(lang, { duplicate: true })");
  });

  it("the /p/ duplicates are not in the sitemap", () => {
    const paths = shopSitemapPaths({ categorySlugs: ["carti-de-vizita"], productSlugs: ["printare", "carti-de-vizita", "cana-alba"] });
    expect(paths).toContain("/printare");
    expect(paths).toContain("/carti-de-vizita");
    expect(paths).toContain("/p/cana-alba");
    expect(paths).not.toContain("/p/printare");
    expect(paths).not.toContain("/p/carti-de-vizita");
  });

  it("business-card Product JSON-LD has an absolute raster image", () => {
    const img = shopSegmentOgImage("/carti-de-vizita", "Cărți de vizită");
    expect(img).toEqual({ url: "/shop/carti-de-vizita/opengraph-image", width: 1200, height: 630, alt: "Cărți de vizită" });
    const ld = productJsonLd({ name: "Cărți de vizită", description: "x", slug: "carti-de-vizita", image: img.url, price: 1, available: true }, "/carti-de-vizita", ENV);
    expect(ld.image).toEqual(["https://anvi.md/shop/carti-de-vizita/opengraph-image"]);
    expect(existsSync(join(process.cwd(), "src/app/shop/carti-de-vizita/opengraph-image.tsx"))).toBe(true);
    expect(readFileSync(join(process.cwd(), "src/app/shop/carti-de-vizita/page.tsx"), "utf8")).toContain("image: shopSegmentOgImage(SHOP_BC_PATH");
  });
});

describe("private pages: noindex, not in the sitemap, disallowed in robots.txt", () => {
  const SHOP_APP = join(process.cwd(), "src/app/shop");
  /** Every page.tsx under a private section (subpaths included). */
  const pagesUnder = (dir: string): string[] =>
    (readdirSync(join(SHOP_APP, dir), { recursive: true }) as string[]).filter((f) => f.endsWith("page.tsx")).map((f) => join(dir, f));

  it("the list: cart, checkout, account (+ subpaths), orders, order status, payment, tester link, editor", () => {
    expect([...SHOP_PRIVATE_PATHS]).toEqual(["/cos", "/checkout", "/cont", "/comenzi", "/comanda/", "/pay/", "/tester", "/editor/"]);
    expect([...SHOP_ROBOTS_DISALLOW]).toEqual([...SHOP_PRIVATE_PATHS]);
    for (const p of ["/cos", "/checkout", "/cont", "/cont/comenzi/12", "/cont/verifica", "/comenzi", "/comanda/abc", "/pay/test", "/tester", "/editor/mug"]) {
      expect(isShopPrivatePath(p), p).toBe(true);
    }
    for (const p of ["/", "/printare", "/cani", "/p/cana-alba", "/contacte", "/costume", "/intrebari", "/editor"]) expect(isShopPrivatePath(p), p).toBe(false);
  });

  it("every private page sets robots noindex", () => {
    expect(SHOP_PRIVATE_ROBOTS).toEqual({ index: false, follow: false });
    const pages = ["cos", "checkout", "cont", "comenzi", "comanda", "pay", "editor"].flatMap(pagesUnder);
    expect(pages.length).toBeGreaterThanOrEqual(12);
    for (const f of pages) {
      const src = readFileSync(join(SHOP_APP, f), "utf8");
      expect(src, f).toMatch(/robots: SHOP_PRIVATE_ROBOTS/);
      expect(src, f).not.toMatch(/index: true/);
    }
    // The editor sets it on every branch (unknown kind, no product, product).
    expect(readFileSync(join(SHOP_APP, "editor/[kind]/page.tsx"), "utf8").match(/robots: SHOP_PRIVATE_ROBOTS/g)?.length).toBe(3);
    // /tester is a redirect route: noindex header.
    expect(readFileSync(join(SHOP_APP, "tester/route.ts"), "utf8")).toContain('"X-Robots-Tag", "noindex, nofollow"');
  });

  it("not in the sitemap, disallowed once launched", () => {
    const paths = shopSitemapPaths({ categorySlugs: ["cos", "cani"], productSlugs: ["x"] });
    expect(paths.filter(isShopPrivatePath)).toEqual([]);
    expect(paths).toContain("/cani");
    const live = shopRobotsTxt(LAUNCHED);
    for (const p of SHOP_PRIVATE_PATHS) expect(live).toContain(`Disallow: ${p}\n`);
  });
});

describe("info pages: printing + files per product, FAQPage JSON-LD", () => {
  const studio = { address: "str. Alba-Iulia 77/18, Chișinău", hours: DEFAULT_STUDIO_INFO.hours, phone: "+37379545631", paymentLive: false };
  const vars = infoPageVars({ lang: "ro", ...studio });
  const texts = (slug: "despre" | "intrebari", lang: (typeof SHOP_LANGS)[number]): string =>
    [INFO_PAGES[slug].lead, ...INFO_PAGES[slug].sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => (b.kind === "p" ? [b.text] : b.kind === "list" ? b.items : []))])]
      .map((l) => l[lang])
      .join("\n");

  it("/despre and /intrebari mention photo + document printing with a link to /printare", () => {
    for (const lang of SHOP_LANGS) {
      expect(texts("despre", lang)).toContain("](/printare)");
      expect(texts("intrebari", lang)).toContain("](/printare)");
    }
  });

  it("«Ce fișiere pot încărca?» lists the formats each upload really takes", () => {
    const q = INFO_PAGES.intrebari.sections.find((s) => s.heading.ro === "Ce fișiere pot încărca?")!;
    expect(q).toBeDefined();
    for (const lang of SHOP_LANGS) {
      const a = q.blocks.flatMap((b) => (b.kind === "p" ? [b.text[lang]] : b.kind === "list" ? b.items.map((i) => i[lang]) : [])).join("\n");
      for (const f of ["PDF", "Word", "DOCX", "ODT", "RTF", "JPG", "PNG", "HEIC", "WEBP", "TIFF", "SVG"]) expect(a, `${lang} ${f}`).toContain(f);
      expect(a).toContain("](/printare)");
      expect(a).toContain("](/carti-de-vizita)");
    }
    // What the FAQ says /printare takes is what its file inputs accept.
    for (const ext of [".pdf", ".doc", ".docx", ".odt", ".rtf", ".jpg", ".png"]) expect(PRINT_ACCEPT.doc).toContain(ext);
    for (const ext of [".jpg", ".png", ".heic", ".webp", ".tif"]) expect(PRINT_ACCEPT.photo).toContain(ext);
    const bc = readFileSync(join(process.cwd(), "src/components/shop/BusinessCardView.tsx"), "utf8");
    expect(bc).toContain('const ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";');
    const art = readFileSync(join(process.cwd(), "src/components/shop/ArtworkUpload.tsx"), "utf8");
    expect(art).toContain('SHOP_ARTWORK_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf,.tif,.tiff,.svg"');
  });

  it("FAQPage JSON-LD: every question, plain text, in the page language", () => {
    expect(stripInfoLinks("Vezi [Retur](/retur) acum")).toBe("Vezi Retur acum");
    for (const lang of SHOP_LANGS) {
      const entries = infoFaqEntries(INFO_PAGES.intrebari, lang, infoPageVars({ lang, ...studio }));
      expect(entries.length).toBe(INFO_PAGES.intrebari.sections.length);
      for (const e of entries) {
        expect(e.question.length).toBeGreaterThan(0);
        expect(e.answer.length).toBeGreaterThan(0);
        expect(e.answer).not.toMatch(/\]\(|\{\w+\}/);
      }
      expect(entries[0]!.question).toBe(INFO_PAGES.intrebari.sections[0]!.heading[lang]);
      const ld = faqPageJsonLd(entries);
      expect(ld["@type"]).toBe("FAQPage");
      expect((ld.mainEntity as unknown[])[0]).toEqual({
        "@type": "Question",
        name: entries[0]!.question,
        acceptedAnswer: { "@type": "Answer", text: entries[0]!.answer },
      });
    }
    const ro = infoFaqEntries(INFO_PAGES.intrebari, "ro", vars);
    expect(ro.find((e) => e.question === "Printați fotografii și documente?")?.answer).toContain("Printare foto și documente");
    expect(ro.find((e) => e.question === "Ce fișiere pot încărca?")?.answer).toContain("• ");
    expect(readFileSync(join(process.cwd(), "src/components/shop/InfoPage.tsx"), "utf8")).toContain("faqPageJsonLd(infoFaqEntries(page, lang, vars))");
  });
});
