import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TestPayClient } from "@/components/shop/TestPayClient";
import { prisma } from "@/lib/prisma";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Test", robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** Whether the storefront order behind `token` is already paid (an old tab / back button must not offer the button again). */
async function isOrderPaid(token: string): Promise<boolean> {
  if (token.length > 64) return false;
  try {
    const o = await prisma.order.findUnique({
      where: { publicToken: token },
      select: { source: true, deletedAt: true, paymentStatus: true, isPaid: true },
    });
    return o != null && o.source === "shop" && !o.deletedAt && (o.paymentStatus === "paid" || o.isPaid);
  } catch (error) {
    console.error("[shop-pay-test] order lookup failed:", error);
    return false;
  }
}

export default async function ShopTestPayPage({ searchParams }: Props) {
  const t = shopT(await getShopLang());
  const raw = (await searchParams).token;
  const token: string | null = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  if (token && (await isOrderPaid(token))) {
    const href = await getShopHref();
    redirect(href(`/shop/comanda/${encodeURIComponent(token)}`));
  }
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
