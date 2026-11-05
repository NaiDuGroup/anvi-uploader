"use client";

import Link from "next/link";
import { useState } from "react";
import { cartCount, lineQuantity } from "@/lib/storefront/cart";
import { dispatchCart, placeOrderFromCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import {
  DELIVERY_DISPLAY_PRICE,
  applyPriceChange,
  buildCheckoutBody,
  checkoutOutcome,
  clearFieldError,
  filterPhoneInput,
  validateCheckout,
  type CheckoutField,
  type CheckoutForm,
  type CheckoutLineProblem,
  type DeliveryMethod,
  lineUnavailableText,
} from "@/lib/storefront/checkout";
import {
  clearCheckoutDraft,
  EMPTY_CHECKOUT_DRAFT,
  loadCheckoutDraft,
  mergeAccountDraft,
  saveCheckoutDraft,
  type CheckoutDraft,
} from "@/lib/storefront/checkoutDraft";
import { lineMissingFile } from "@/lib/storefront/fileRules";
import { formatPrice } from "@/lib/storefront/format";
import { itemsLabel, type ShopStringKey, type ShopT } from "@/lib/storefront/i18n";
import { cartLeadTime, leadTimeText } from "@/lib/storefront/leadTime";
import { cartLineText, qtySuffix, type ShopLineLabels } from "@/lib/storefront/lineLabels";
import { useCartQuote } from "@/lib/storefront/useCartQuote";
import { trackPaymentStart } from "@/lib/storefront/analytics";
import { CheckoutPromoField, CheckoutPromoLine, useCheckoutPromo } from "./CheckoutPromo";
import { CardIcon } from "./ShopIcons";
import { ShopImg } from "./ShopImg";
import { useShopLang } from "./ShopLangProvider";
import { turnstileHeaders, turnstileRejected } from "@/lib/turnstile/client";
import { TURNSTILE_ERROR } from "@/lib/turnstile/config";
import { turnstileText } from "@/lib/turnstile/texts";

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
const labelCls = "text-sm font-semibold";

/** Studio pickup point: address, opening hours (one line) and the map link. */
export interface ShopPickupInfo {
  address: string;
  hours: string;
  mapUrl: string | null;
}

export function PickupInfo({ pickup }: { pickup: ShopPickupInfo }) {
  const { t } = useShopLang();
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-(--soft) px-4 py-3 text-sm">
      <b>{t("pickupAt", { address: pickup.address })}</b>
      {pickup.hours ? <span className="text-(--muted)">{t("pickupHours", { hours: pickup.hours })}</span> : null}
      {pickup.mapUrl ? (
        <a href={pickup.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center self-start font-semibold">
          {t("openMap")} <span className="sr-only">{t("newTab")}</span>
        </a>
      ) : null}
    </div>
  );
}

/** One readable message per wrong line from the server's answer. */
function lineProblemText(p: CheckoutLineProblem, title: string, t: ShopT): string {
  if (p.field === "files" && p.code === "required") return t("errLineFileRequired", { title });
  if (p.field === "files" && p.code === "file_not_found") return t("errLineFileGone", { title });
  if (p.field === "files" && p.code === "file_type") return t("errLineFileType", { title });
  return t("errLineInvalid", { title });
}

/**
 * Checkout form on first render: the signed-in account's details (gaps from
 * this browser's draft), else the saved draft; never the terms checkbox.
 */
function initialForm(account: CheckoutDraft | null): CheckoutForm {
  const draft = typeof window === "undefined" ? null : loadCheckoutDraft();
  const base: CheckoutDraft = account ? mergeAccountDraft(account, draft) : (draft ?? EMPTY_CHECKOUT_DRAFT);
  return { ...base, acceptTerms: false };
}

export function CheckoutClient({
  paymentAvailable = true,
  labels = null,
  pickup = null,
  account = null,
}: {
  paymentAvailable?: boolean;
  labels?: ShopLineLabels | null;
  pickup?: ShopPickupInfo | null;
  /** Signed-in storefront account: prefills the form. */
  account?: CheckoutDraft | null;
}) {
  const { t, lang, href } = useShopLang();
  const lines = useCart();
  const hydrated = useHydrated();
  const quote = useCartQuote(lines, lang, hydrated);
  const [form, setForm] = useState<CheckoutForm>(() => initialForm(account));
  /** The form was prefilled from the saved draft: offer «Nu sunt eu» (not for a signed-in account). */
  const [restored, setRestored] = useState<boolean>(
    () => account == null && typeof window !== "undefined" && loadCheckoutDraft() != null,
  );
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, true>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [soon, setSoon] = useState<{ orderNumber: string; token: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [unavailable, setUnavailable] = useState(!paymentAvailable);
  // Promo code: previewed by the server, priced again by the checkout.
  const promo = useCheckoutPromo(lines, form.method, form.email, lang, quote.status === "done" ? String(quote.subtotal) : "");

  const set = <K extends keyof CheckoutForm>(k: K, v: CheckoutForm[K]) => {
    const next: CheckoutForm = { ...form, [k]: v };
    setForm(next);
    saveCheckoutDraft(next);
    // A message goes away as soon as its field is touched.
    setErrors((e) => clearFieldError(e, k));
  };

  if (soon) {
    return (
      <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border-[1.5px] border-(--line) p-6">
        <h2 className="m-0 text-2xl font-extrabold">{t("paymentSoonTitle")}</h2>
        <p className="m-0 leading-relaxed text-(--muted)">{t("paymentSoonText", { number: soon.orderNumber })}</p>
        <Link
          href={href(`/shop/comanda/${encodeURIComponent(soon.token)}`)}
          className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline"
        >
          {t("openOrder")}
        </Link>
      </div>
    );
  }
  if (unavailable) {
    return (
      <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border-[1.5px] border-(--line) p-6">
        <span className="text-(--muted2)">
          <CardIcon size={28} />
        </span>
        <h2 className="m-0 text-2xl font-extrabold">{t("paymentUnavailableTitle")}</h2>
        <p className="m-0 leading-relaxed text-(--muted)">{t("paymentUnavailableText")}</p>
        <Link
          href={href("/shop/cos")}
          className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline"
        >
          {t("cartTitle")}
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
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("cartEmptyCta")}
        </Link>
      </div>
    );
  }

  const texts = lines.map((l) => cartLineText(l, labels, t));
  const missing: boolean[] = lines.map(lineMissingFile);
  const anyMissing: boolean = missing.some(Boolean);
  const editHref = (i: number): string =>
    href(`/shop/p/${texts[i]!.slug}?edit=${encodeURIComponent(lines[i]!.id)}`);

  const notMe = () => {
    clearCheckoutDraft();
    setForm({ ...EMPTY_CHECKOUT_DRAFT, acceptTerms: false });
    setErrors({});
    setRestored(false);
  };
  const subtotal: number | null = quote.status === "done" ? quote.subtotal : null;
  const deliveryPrice: number = DELIVERY_DISPLAY_PRICE[form.method];
  const promoDiscount: number = promo.applied?.discount ?? 0;
  const total: number | null = subtotal != null ? Math.max(0, Math.round((subtotal + deliveryPrice - promoDiscount) * 100) / 100) : null;

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
    if (anyMissing) {
      setFormError(t("filesMissingCart"));
      return;
    }
    setSubmitting(true);
    // Exactly these lines go into the order; anything added meanwhile stays in the cart.
    const sentIds: string[] = lines.map((l) => l.id);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await turnstileHeaders()) },
        body: JSON.stringify({
          ...buildCheckoutBody(form, lines, lang, texts),
          ...(promo.applied ? { promoCode: promo.applied.code } : {}),
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 403 && (body as { error?: unknown } | null)?.error === TURNSTILE_ERROR) {
        // Anti-bot check failed: a fresh check starts now, the next «Plătește» retries.
        turnstileRejected();
        setFormError(turnstileText(lang, "failed"));
        setSubmitting(false);
        return;
      }
      const promoRejected = body as { error?: unknown; reason?: unknown; minOrderMdl?: unknown } | null;
      if (res.status === 422 && promoRejected?.error === "promo_invalid") {
        // The code stopped applying (expired, used up…): no order was placed; the customer decides.
        promo.rejectedByCheckout(
          typeof promoRejected.reason === "string" ? promoRejected.reason : "invalid",
          typeof promoRejected.minOrderMdl === "number" ? promoRejected.minOrderMdl : undefined,
        );
        setSubmitting(false);
        return;
      }
      const out = checkoutOutcome(res.status, body);
      switch (out.kind) {
        case "redirect":
          setLeaving(true);
          placeOrderFromCart({ token: out.created.publicToken, number: out.created.orderNumber, lineIds: sentIds });
          trackPaymentStart(out.created.publicToken);
          window.location.assign(href(out.url));
          return;
        case "payment_soon":
          placeOrderFromCart({ token: out.token, number: out.orderNumber, lineIds: sentIds });
          setSoon({ orderNumber: out.orderNumber, token: out.token });
          return;
        case "payment_unavailable":
          setUnavailable(true);
          setSubmitting(false);
          return;
        case "price_changed": {
          // Documents re-counted by the server: the cart gets the real pages (the summary re-prices), the customer confirms by paying again.
          for (const c of out.lines) {
            const line = lines[c.index];
            const next = line ? applyPriceChange(line, c) : null;
            if (next) dispatchCart({ type: "update", line: next });
          }
          setFormError(t("errPriceChanged", { price: out.total != null ? formatPrice(out.total, lang) : "—" }));
          break;
        }
        case "line_unavailable":
          setFormError(lineUnavailableText(out, out.index != null ? (texts[out.index]?.title ?? "") : "", t));
          break;
        case "invalid": {
          // Say which line / field is wrong; the generic text only when the answer names nothing known.
          const lineTexts: string[] = out.lines.map((p) => lineProblemText(p, texts[p.index]?.title ?? "", t));
          if (out.fields.length) {
            setErrors(Object.fromEntries(out.fields.map((f) => [f, true])) as Partial<Record<CheckoutField, true>>);
            document.getElementById(`co-${out.fields[0]}`)?.focus();
          }
          setFormError(lineTexts.length ? lineTexts.join("\n") : out.fields.length ? null : t("errInvalid"));
          break;
        }
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
        <section aria-labelledby="co-h-contacts" className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="co-h-contacts" className="m-0 text-xl font-extrabold">
              {t("contacts")}
            </h2>
            {account ? <span className="text-sm text-(--muted2)">{t("accPrefilled")}</span> : null}
            {restored ? (
              <span className="text-sm text-(--muted2)">
                {t("draftSaved")}{" "}
                <button type="button" onClick={notMe} className="inline-flex min-h-10 items-center font-semibold text-(--ink) underline">
                  {t("notMe")}
                </button>
              </span>
            ) : null}
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co-name" className={labelCls}>
                {t("name")}
              </label>
              <input {...field("name")} className={inputCls} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              {err("name")}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co-phone" className={labelCls}>
                {t("phone")}
              </label>
              <input
                {...field("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", filterPhoneInput(e.target.value))}
              />
              {err("phone")}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-email" className={labelCls}>
              {t("email")}
            </label>
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
          </div>
        </section>

        <section aria-labelledby="co-h-delivery" className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <h2 id="co-h-delivery" className="m-0 text-xl font-extrabold">
            {t("deliveryTitle")}
          </h2>
          <div role="radiogroup" aria-labelledby="co-h-delivery" className="flex flex-col gap-2.5">
            {methods.map((m) => {
              const on: boolean = form.method === m.id;
              const price: number = DELIVERY_DISPLAY_PRICE[m.id];
              return (
                <label
                  key={m.id}
                  htmlFor={`co-method-${m.id}`}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-[14px] border-[1.5px] p-4 ${on ? "border-(--ink) bg-(--soft)" : "border-(--line2)"}`}
                >
                  <input
                    id={`co-method-${m.id}`}
                    type="radio"
                    name="delivery"
                    value={m.id}
                    checked={on}
                    aria-labelledby={`co-method-${m.id}-name`}
                    aria-describedby={`co-method-${m.id}-sub co-method-${m.id}-price`}
                    onChange={() => set("method", m.id)}
                    className="h-5 w-5 accent-(--ink)"
                  />
                  <span className="flex flex-1 flex-col">
                    <b id={`co-method-${m.id}-name`}>{m.name}</b>
                    <span id={`co-method-${m.id}-sub`} className="text-sm text-(--muted)">
                      {m.sub}
                    </span>
                  </span>
                  <b id={`co-method-${m.id}-price`}>{price ? formatPrice(price, lang) : t("free")}</b>
                </label>
              );
            })}
          </div>
          {form.method === "pickup" && pickup ? <PickupInfo pickup={pickup} /> : null}
          {form.method !== "pickup" ? (
            <div className="flex flex-col gap-3.5 pt-1">
              <div className="grid gap-3.5 sm:grid-cols-2">
                {form.method === "courier_moldova" ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="co-city" className={labelCls}>
                      {t("city")}
                    </label>
                    <input
                      {...field("city")}
                      autoComplete="address-level2"
                      className={inputCls}
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                    />
                    {err("city")}
                  </div>
                ) : (
                  // Courier in Chișinău: the city is fixed (the order is sent with «Chișinău»).
                  <p className="m-0 self-end rounded-[10px] bg-(--soft) px-3.5 py-3 text-base font-semibold">{t("cityFixed")}</p>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="co-address" className={labelCls}>
                    {t("address")}
                  </label>
                  <input
                    {...field("address")}
                    autoComplete="street-address"
                    className={inputCls}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                  {err("address")}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="co-note" className={labelCls}>
                  {t("courierNote")}
                </label>
                <input
                  id="co-note"
                  className={inputCls}
                  placeholder={t("courierNotePh")}
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="co-h-payment" className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
          <h2 id="co-h-payment" className="m-0 text-xl font-extrabold">
            {t("paymentTitle")}
          </h2>
          <div className="flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--ink) bg-(--soft) p-4">
            <CardIcon size={28} />
            <span className="flex flex-col">
              <b>{t("paymentCard")}</b>
              <span className="text-sm text-(--muted)">{t("paymentCardSub")}</span>
            </span>
          </div>
          <div className="flex items-start gap-3 text-sm leading-snug text-(--muted)">
            <input
              {...field("terms")}
              type="checkbox"
              checked={form.acceptTerms}
              onChange={(e) => set("acceptTerms", e.target.checked)}
              aria-labelledby="co-terms-label"
              className="mt-0.5 h-5 w-5 shrink-0 accent-(--ink)"
            />
            <span id="co-terms-label">
              <label htmlFor="co-terms" className="cursor-pointer">
                {t("termsBefore")}
              </label>
              <a href={href("/shop/termeni")} target="_blank" rel="noopener" className="font-semibold">
                {t("termsLinkText")}
                <span className="sr-only"> {t("newTab")}</span>
              </a>
              <label htmlFor="co-terms" className="cursor-pointer">
                {t("termsMiddle")}
              </label>
              <a href={href("/shop/retur")} target="_blank" rel="noopener" className="font-semibold">
                {t("returnsLinkText")}
                <span className="sr-only"> {t("newTab")}</span>
              </a>
              <label htmlFor="co-terms" className="cursor-pointer">
                {t("termsAfter")}
              </label>
            </span>
          </div>
          {err("terms")}
        </section>
      </div>

      <aside className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6 lg:sticky lg:top-4">
        <b className="text-lg">{t("yourOrder")}</b>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {lines.map((l, i) => {
            const r = quote.byId[l.id];
            const text = texts[i]!;
            return (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <ShopImg src={l.image} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span>
                    {text.title}
                    {text.optionsText ? `, ${text.optionsText}` : ""}
                    {l.quote.kind === "print" ? "" : qtySuffix(text.optionsText, lineQuantity(l.quote))}
                  </span>
                  {missing[i] ? (
                    <span role="alert" className="font-semibold text-(--err)">
                      {t("fileMissing")}{" "}
                      <Link href={editHref(i)} className="underline">
                        {t("uploadFileLink")}
                      </Link>
                    </span>
                  ) : null}
                </span>
                <span className="font-semibold">{r?.ok ? formatPrice(r.total, lang) : "…"}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t border-(--line) pt-3 text-(--muted)">
          <span>{itemsLabel(cartCount(lines), lang)}</span>
          <span>{subtotal != null ? formatPrice(subtotal, lang) : "…"}</span>
        </div>
        <div className="flex justify-between text-(--muted)">
          <span>{t("delivery")}</span>
          <span>{deliveryPrice ? formatPrice(deliveryPrice, lang) : t("free")}</span>
        </div>
        <CheckoutPromoLine applied={promo.applied} lang={lang} />
        <CheckoutPromoField promo={promo} lang={lang} />
        <div className="flex items-baseline justify-between border-t border-(--line) pt-3">
          <b>{t("total")}</b>
          <b className="text-2xl" aria-live="polite">
            {total != null ? formatPrice(total, lang) : "…"}
          </b>
        </div>
        {formError ? (
          <p role="alert" className="m-0 rounded-[10px] bg-(--err-soft) px-3.5 py-2.5 text-sm font-semibold whitespace-pre-line text-(--err)">
            {formError}
          </p>
        ) : null}
        {anyMissing && !formError ? (
          <p role="alert" className="m-0 rounded-[10px] bg-(--err-soft) px-3.5 py-2.5 text-sm font-semibold text-(--err)">
            {t("filesMissingCart")}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || anyMissing}
          className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-60"
        >
          {submitting ? t("placing") : total != null ? t("pay", { price: formatPrice(total, lang) }) : t("checkout")}
        </button>
        <span className="text-xs leading-snug text-(--muted2)">
          {leadTimeText(cartLeadTime(lines.map((l) => l.quote), labels), t, "checkout")}
        </span>
      </aside>
    </form>
  );
}
