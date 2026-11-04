"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { applyOrderChecks, useHydrated, useRecentOrders } from "@/lib/storefront/cartStore";
import { visibleRecentOrders, type RecentOrderCheck } from "@/lib/storefront/recentOrders";
import { formatOrderDate } from "@/lib/storefront/format";
import { ReceiptIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

/**
 * «Comenzile mele»: the last orders placed from this browser (localStorage),
 * newest first. Each remembered order is checked once per visit: one the
 * server does not know (404) is forgotten, a missing number is filled in.
 * Entries without a number are not shown.
 */
export function MyOrdersClient() {
  const { t, lang, href } = useShopLang();
  const stored = useRecentOrders();
  const hydrated = useHydrated();
  const checked = useRef<Set<string>>(new Set());

  useEffect(() => {
    const seen: Set<string> = checked.current;
    const todo: string[] = stored.map((o) => o.token).filter((tk) => !seen.has(tk));
    if (todo.length === 0) return;
    for (const tk of todo) seen.add(tk);
    const ctrl = new AbortController();
    let finished = false;
    void Promise.all(
      todo.map(async (token): Promise<RecentOrderCheck | null> => {
        try {
          const res = await fetch(`/api/shop/order/${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: "no-store" });
          if (res.status === 404) return { token, found: false };
          if (!res.ok) return null;
          const body = (await res.json()) as { orderNumber?: unknown };
          const n: unknown = body?.orderNumber;
          return typeof n === "number" || typeof n === "string" ? { token, found: true, number: n } : null;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (ctrl.signal.aborted) return;
      finished = true;
      applyOrderChecks(results.filter((r): r is RecentOrderCheck => r != null));
    });
    return () => {
      if (finished) return;
      ctrl.abort();
      // Aborted before the answers (unmount / strict mode): check these again on the next run.
      for (const tk of todo) seen.delete(tk);
    };
  }, [stored]);

  const orders = visibleRecentOrders(stored);
  if (!hydrated) return <div className="min-h-[200px]" aria-busy="true" />;
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-4">
        <p className="m-0 text-lg text-(--muted)">{t("myOrdersEmpty")}</p>
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("cartEmptyCta")}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {orders.map((o) => (
          <li key={o.token}>
            <Link
              href={href(`/shop/comanda/${encodeURIComponent(o.token)}`)}
              className="flex min-h-14 items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--line) px-4 py-3 no-underline hover:border-(--ink)"
            >
              <ReceiptIcon size={22} />
              <span className="flex flex-1 flex-col">
                <b>{o.number ? t("orderNumberShort", { number: o.number }) : t("orderNoNumber")}</b>
                {o.at ? (
                  <span className="text-sm text-(--muted)">{formatOrderDate(new Date(o.at).toISOString(), lang)}</span>
                ) : null}
              </span>
              <span aria-hidden className="text-(--muted2)">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm text-(--muted2)">{t("myOrdersNote")}</p>
    </div>
  );
}
