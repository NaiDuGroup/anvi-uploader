import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { HtmlLangUpdater } from "@/components/HtmlLangUpdater";
import { LocaleInitializer } from "@/components/LocaleInitializer";
import type { Locale } from "@/lib/i18n";
import { SHOP_LANG_COOKIE, parseShopLang } from "@/lib/storefront/i18n";
import { isShopRequest } from "@/lib/storefront/shopHost";
import "./globals.css";

// Local files (src/fonts) so `next build` never downloads from Google Fonts.
const geistSans = localFont({
  src: "../fonts/geist/Geist-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../fonts/geistmono/GeistMono-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "ANVI PRINT",
  description: "Upload your print files easily",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

const VALID_LOCALES = ["ro", "ru", "en"] as const satisfies readonly Locale[];

function parseLocaleCookie(value: string | undefined): Locale | null {
  return VALID_LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = parseLocaleCookie(cookieStore.get("locale")?.value);
  // `<html lang>` still needs a concrete value — fall back to the
  // default locale when the cookie is missing (first visit).
  // Storefront pages (anvi.md, print.anvi.md/shop) speak their own language (`shop_lang`).
  const shop: boolean = isShopRequest(await headers());
  const lang: string = shop ? parseShopLang(cookieStore.get(SHOP_LANG_COOKIE)?.value) : (cookieLocale ?? "ro");

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-gray-50`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 font-sans">
        {/*
          LocaleInitializer MUST wrap {children} (not sit next to it):
          async server components like `page.tsx` create implicit
          Suspense boundaries that let siblings render out-of-order,
          so a sibling LocaleInitializer occasionally ran AFTER the
          page tree and the server shipped Romanian SSR despite the
          cookie. Wrapping guarantees the store mutation completes
          before React expands the children slot.
        */}
        <LocaleInitializer cookieLocale={cookieLocale}>
          <HtmlLangUpdater skipLang={shop} />
          {children}
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{ duration: 5000 }}
          />
        </LocaleInitializer>
      </body>
    </html>
  );
}
