"use client";

import Link from "next/link";
import { useState } from "react";
import { cartCount, lineQuantity } from "@/lib/storefront/cart";
import { dispatchCart, rememberLastOrder, useCart, useHydrated } from "@/lib/storefront/cartStore";
import {
  DELIVERY_DISPLAY_PRICE,
  buildCheckoutBody,
  checkoutOutcome,
  validateCheckout,
  type CheckoutField,
  type CheckoutForm,
  type DeliveryMethod,
} from "@/lib/storefront/checkout";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopStringKey } from "@/lib/storefront/i18n";
import { useCartQuote } from "@/lib/storefront/useCartQuote";
import { CardIcon } from "./ShopIcons";
import { ShopImg } from "./ShopImg";
import { useShopLang } from "./ShopLangProvider";

const FIELD_ERR: Record<CheckoutField, ShopStringKey> = {
  name: "errName",
  phone: "errPhone",
  email: "errEmail",
  city: "errCity",
  address: "errAddress",
  terms: "errTerms",
};

const inputCls =
  "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3.5 py-3 text-base font-medium text-(--ink) aria-[invalid=true]:border-(--err)";

export function CheckoutClient() {
  const { t, lang } = useShopLang();
  const lines = useCart();
  const hydrated = useHydrated();
  const quote = useCartQuote(lines, lang, hydrated);
  const [form, setForm] = useState<CheckoutForm>({
    name: "",
    phone: "+373 ",
    email: "",
    method: "pickup",
    city: "",
    address: "",
    note: "",
    acceptTerms: false,
  });
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, true>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [soon, setSoon] = useState<{ orderNumber: string; token: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const set = <K extends keyof CheckoutForm>(k: K, v: CheckoutForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (soon) {
    return (
      <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border-[1.5px] border-(--line) p-6">
        <h2 className="m-0 text-2xl font-extrabold">{t("paymentSoonTitle")}</h2>
        <p className="m-0 leading-relaxed text-(--muted)">{t("paymentSoonText", { number: soon.orderNumber })}</p>
        <Link
          href={`/shop/comanda/${encodeURIComponent(soon.token)}`}
          className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline"
        >
          {t("openOrder")}
        </Link>
      </div>
    );
  }
  if (leaving) {
    return (
      <p role="status" className="min-h-[480px] text-lg text-(--muted)">
        {t("placing")}
      </p>
    );
  }
  if (!hydrated) return <div className="min-h-[480px]" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="m-0 text-lg text-(--muted)">{t("cartEmpty")}</p>
        <Link href="/shop" className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("cartEmptyCta")}
        </Link>
      </div>
    );
  }

  const subtotal: number | null = quote.status === "done" ? quote.subtotal : null;
  const deliveryPrice: number = DELIVERY_DISPLAY_PRICE[form.method];
  const total: number | null = subtotal != null ? subtotal + deliveryPrice : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateCheckout(form);
    setErrors(errs);
    setFormError(null);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(`co-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutBody(form, lines, lang)),
      });
      const body: unknown = await res.json().catch(() => null);
      const out = checkoutOutcome(res.status, body);
      switch (out.kind) {
        case "redirect":
          rememberLastOrder(out.created.publicToken);
          setLeaving(true);
          dispatchCart({ type: "clear" });
          window.location.href = out.url;
          return;
        case "payment_soon":
          rememberLastOrder(out.token);
          dispatchCart({ type: "clear" });
          setSoon({ orderNumber: out.orderNumber, token: out.token });
          return;
        case "line_unavailable":
          setFormError(t("errLineUnavailable", { title: out.index != null ? (lines[out.index]?.title ?? "") : "" }));
          break;
        case "invalid":
          setFormError(t("errInvalid"));
          break;
        case "rate_limited":
          setFormError(t("errRateLimit"));
          break;
        default:
          setFormError(t("errServer"));
      }
    } catch {
      setFormError(t("errNetwork"));
    }
    setSubmitting(false);
  };

  const field = (k: CheckoutField) => ({
    id: `co-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `co-${k}-err` : undefined,
  });
  const err = (k: CheckoutField) =>
    errors[k] ? (
      <span id={`co-${k}-err`} className="text-sm font-semibold text-(--err)">
        {t(FIELD_ERR[k])}
      </span>
    ) : null;

  const methods: { id: DeliveryMethod; name: string; sub: string }[] = [
    { id: "pickup", name: t("pickup"), sub: t("pickupSub") },
    { id: "courier_chisinau", name: t("courierCity"), sub: t("courierCitySub") },
    { id: "courier_moldova", name: t("courierCountry"), sub: t("courierCountrySub") },
  ];

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <h2 className="m-0 text-xl font-extrabold">{t("contacts")}</h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t("name")}
              <input {...field("name")} className={inputCls} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              {err("name")}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t("phone")}
              <input
                {...field("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              {err("phone")}
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t("email")}
            <input
              {...field("email")}
              type="email"
              autoComplete="email"
              placeholder="ana@example.md"
              className={inputCls}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
            {err("email")}
          </label>
        </section>

        <section className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <h2 className="m-0 text-xl font-extrabold">{t("deliveryTitle")}</h2>
          <div role="radiogroup" aria-label={t("delivery")} className="flex flex-col gap-2.5">
            {methods.map((m) => {
              const on: boolean = form.method === m.id;
              const price: number = DELIVERY_DISPLAY_PRICE[m.id];
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-[14px] border-[1.5px] p-4 ${on ? "border-(--ink) bg-(--soft)" : "border-(--line2)"}`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={m.id}
                    checked={on}
                    onChange={() => set("method", m.id)}
                    className="h-5 w-5 accent-(--ink)"
                  />
                  <span className="flex flex-1 flex-col">
                    <b>{m.name}</b>
                    <span className="text-sm text-(--muted)">{m.sub}</span>
                  </span>
                  <b>{price ? formatPrice(price, lang) : t("free")}</b>
                </label>
              );
            })}
          </div>
          {form.method !== "pickup" ? (
            <div className="flex flex-col gap-3.5 pt-1">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  {t("city")}
                  <input
                    {...field("city")}
                    autoComplete="address-level2"
                    className={inputCls}
                    placeholder={form.method === "courier_chisinau" ? "Chișinău" : ""}
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                  {err("city")}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  {t("address")}
                  <input
                    {...field("address")}
                    autoComplete="street-address"
                    className={inputCls}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                  {err("address")}
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {t("courierNote")}
                <input
                  id="co-note"
                  className={inputCls}
                  placeholder={t("courierNotePh")}
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <h2 className="m-0 text-xl font-extrabold">{t("paymentTitle")}</h2>
          <div className="flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--ink) bg-(--soft) p-4">
            <CardIcon size={28} />
            <span className="flex flex-col">
              <b>{t("paymentCard")}</b>
              <span className="text-sm text-(--muted)">{t("paymentCardSub")}</span>
            </span>
          </div>
          <label className="flex items-start gap-3 text-sm leading-snug text-(--muted)">
            <input
              {...field("terms")}
              type="checkbox"
              checked={form.acceptTerms}
              onChange={(e) => set("acceptTerms", e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-(--ink)"
            />
            <span>{t("terms")}</span>
          </label>
          {err("terms")}
        </section>
      </div>

      <aside className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6 lg:sticky lg:top-4">
        <b className="text-lg">{t("yourOrder")}</b>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {lines.map((l) => {
            const r = quote.byId[l.id];
            return (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <ShopImg src={l.image} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  {l.title}
                  {l.optionsText ? `, ${l.optionsText}` : ""} × {lineQuantity(l.quote)}
                </span>
                <span className="font-semibold">{r?.ok ? formatPrice(r.total, lang) : "…"}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t border-(--line) pt-3 text-(--muted)">
          <span>{t("items", { n: cartCount(lines) })}</span>
          <span>{subtotal != null ? formatPrice(subtotal, lang) : "…"}</span>
        </div>
        <div className="flex justify-between text-(--muted)">
          <span>{t("delivery")}</span>
          <span>{deliveryPrice ? formatPrice(deliveryPrice, lang) : t("free")}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-(--line) pt-3">
          <b>{t("total")}</b>
          <b className="text-2xl" aria-live="polite">
            {total != null ? formatPrice(total, lang) : "…"}
          </b>
        </div>
        {formError ? (
          <p role="alert" className="m-0 rounded-[10px] bg-(--err-soft) px-3.5 py-2.5 text-sm font-semibold text-(--err)">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-60"
        >
          {submitting ? t("placing") : total != null ? t("pay", { price: formatPrice(total, lang) }) : t("checkout")}
        </button>
        <span className="text-xs leading-snug text-(--muted2)">
          {t("checkoutReady")} {t("deliveryServerNote")}
        </span>
      </aside>
    </form>
  );
}
