import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { HtmlLangUpdater } from "@/components/HtmlLangUpdater";
import { LocaleInitializer } from "@/components/LocaleInitializer";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  const lang: Locale = cookieLocale ?? "ro";

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
          <HtmlLangUpdater />
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
