import type { Metadata } from "next";
import { TestPayClient } from "@/components/shop/TestPayClient";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Test", robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ShopTestPayPage({ searchParams }: Props) {
  const t = shopT(await getShopLang());
  const raw = (await searchParams).token;
  const token: string | null = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pt-8 pb-12">
      <p
        role="note"
        className="m-0 rounded-xl border-2 border-dashed border-(--warn) bg-(--warn-soft) px-4 py-3 text-center font-extrabold text-(--warn)"
      >
        {t("testPayBanner")}
      </p>
      <h1 className="m-0 text-3xl font-extrabold">{t("testPayTitle")}</h1>
      <TestPayClient token={token} />
    </main>
  );
}
