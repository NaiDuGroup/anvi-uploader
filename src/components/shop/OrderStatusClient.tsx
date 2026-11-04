"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { rememberLastOrder } from "@/lib/storefront/cartStore";
import { formatOrderDate, formatPrice } from "@/lib/storefront/format";
import { isPaid, orderSteps, type ShopOrderView } from "@/lib/storefront/orderStatus";
import { CheckIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

type State = { status: "loading" } | { status: "notfound" } | { status: "error" } | { status: "ok"; order: ShopOrderView };

export function OrderStatusClient({ token, viberHref }: { token: string; viberHref: string | null }) {
  const { t, lang, href } = useShopLang();
  const [state, setState] = useState<State>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/shop/order/${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return setState({ status: "notfound" });
        if (!res.ok) return setState({ status: "error" });
        const order = (await res.json()) as ShopOrderView;
        rememberLastOrder(token);
        setState({ status: "ok", order });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [token, reload]);

  if (state.status === "loading") {
    return (
      <p role="status" className="min-h-[420px] text-(--muted)">
        {t("orderLoading")}
      </p>
    );
  }
  if (state.status !== "ok") {
    return (
      <div role="alert" className="flex min-h-[300px] flex-col items-start gap-4">
        <p className="m-0 text-lg text-(--muted)">{state.status === "notfound" ? t("orderNotFound") : t("priceError")}</p>
        <div className="flex gap-3">
          {state.status === "error" ? (
            <button type="button" onClick={() => setReload((n) => n + 1)} className="rounded-xl bg-(--soft) px-5 py-3 font-bold">
              {t("retry")}
            </button>
          ) : null}
          <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-5 py-3 font-bold no-underline">
            {t("backToShop")}
          </Link>
        </div>
      </div>
    );
  }

  const o = state.order;
  const paid: boolean = isPaid(o);
  const steps = orderSteps(o.status, o.delivery.method);
  const deliveryLabel: string =
    o.delivery.method === "pickup" ? t("pickup") : o.delivery.method === "courier_chisinau" ? t("courierCity") : t("courierCountry");
  const firstName: string = o.customerName.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="flex max-w-[860px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        {paid ? (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-(--ok-soft) text-(--ok)">
            <CheckIcon size={28} />
          </span>
        ) : null}
        <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">
          {t(paid ? "thanksPaid" : "thanksPending", { name: firstName })}
        </h1>
        <p className="m-0 text-base leading-relaxed text-(--muted) sm:text-lg">
          {t("orderIntro", { number: String(o.orderNumber), total: formatPrice(o.total, lang) })}
        </p>
        {o.createdAt ? <span className="text-sm text-(--muted2)">{t("createdAt", { date: formatOrderDate(o.createdAt, lang) })}</span> : null}
      </div>

      <section aria-labelledby="h-track" className="flex flex-col gap-3.5">
        <h2 id="h-track" className="m-0 text-xl font-extrabold">
          {t("whereIsOrder")}
        </h2>
        {o.status === "pending_payment" ? (
          <p className="m-0 rounded-xl bg-(--warn-soft) px-4 py-3 font-semibold text-(--warn)">{t("stPendingPayment")}</p>
        ) : null}
        {o.status === "issue" ? (
          <p role="alert" className="m-0 rounded-xl bg-(--err-soft) px-4 py-3 font-semibold text-(--err)">
            {t("stIssue")}
          </p>
        ) : null}
        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.label}
              aria-current={s.state === "current" ? "step" : undefined}
              className={`flex flex-col gap-1 rounded-[14px] border-[1.5px] p-4 ${
                s.state === "done"
                  ? "border-(--ok) bg-(--ok-soft)"
                  : s.state === "current"
                    ? "border-(--gold) bg-[#fbf5dc]"
                    : "border-(--line)"
              }`}
            >
              <b className="flex items-center gap-2">
                {s.state === "done" ? <CheckIcon size={18} className="text-(--ok)" /> : <span className="text-(--muted2)">{i + 1}.</span>}
                {t(s.label)}
              </b>
              {i === 2 && o.delivery.method !== "pickup" ? (
                <span className="text-sm text-(--muted)">
                  {o.trackingNumber ? t("tracking", { n: o.trackingNumber }) : t("trackingLater")}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {o.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                {l.title}
                {l.optionsText ? <span className="text-(--muted)">, {l.optionsText}</span> : null} × {l.quantity}
              </span>
              <b className="shrink-0">{formatPrice(l.total, lang)}</b>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-(--line) pt-3 text-(--muted)">
          <span>
            {deliveryLabel}
            {o.delivery.city ? ` · ${o.delivery.city}` : ""}
          </span>
          <span>{o.deliveryPrice ? formatPrice(o.deliveryPrice, lang) : t("free")}</span>
        </div>
        <div className="flex justify-between border-t border-(--line) pt-3">
          <b>{paid ? t("paidTotal") : t("toPay")}</b>
          <b className="text-xl">{formatPrice(o.total, lang)}</b>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("backToShop")}
        </Link>
        {viberHref ? (
          <a href={viberHref} className="rounded-xl border-[1.5px] border-(--line2) px-6 py-3.5 font-bold no-underline">
            {t("writeUs")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
