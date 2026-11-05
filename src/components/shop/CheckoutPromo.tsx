"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SHOP_MIN_PAYABLE_MDL } from "@/lib/shop/constants";
import type { CartLine } from "@/lib/storefront/cart";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang } from "@/lib/storefront/i18n";
import { promoReasonText, promoText } from "@/lib/storefront/promoText";

/**
 * Checkout promo code: «Am un cod promoțional» → input + «Aplică». The
 * discount shown here is the server's preview (`POST /api/shop/promo`); the
 * checkout prices the code again and is the only one that counts.
 */

export interface CheckoutPromoApplied {
  code: string;
  type: string;
  discount: number;
  /** The server cut the discount to keep the minimum payable. */
  limited?: boolean;
}

export interface CheckoutPromoState {
  applied: CheckoutPromoApplied | null;
  /** The code the customer applied (kept while a re-check runs or after it stopped applying). */
  code: string | null;
  error: string | null;
  busy: boolean;
  apply: (code: string) => Promise<void>;
  remove: () => void;
  /** The checkout refused the code (`422 promo_invalid`). */
  rejectedByCheckout: (reason: string, minOrderMdl?: number) => void;
}

function reasonText(reason: string, lang: ShopLang, minOrderMdl?: number): string {
  return promoReasonText(reason, lang, minOrderMdl != null ? { min: formatPrice(minOrderMdl, lang) } : undefined);
}

export function useCheckoutPromo(
  lines: readonly CartLine[],
  method: string,
  email: string,
  lang: ShopLang,
  /** Changes whenever the cart is re-priced (e.g. the quoted subtotal). */
  cartKey: string,
): CheckoutPromoState {
  const [applied, setApplied] = useState<CheckoutPromoApplied | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const check = useCallback(
    async (raw: string, quiet: boolean) => {
      const c: string = raw.trim();
      if (!c) {
        setError(promoText("errEmpty", lang));
        return;
      }
      const my = ++seq.current;
      setBusy(true);
      if (!quiet) setError(null);
      try {
        const res = await fetch("/api/shop/promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: c,
            locale: lang,
            lines: lines.map((l) => ({ quote: l.quote })),
            delivery: { method },
            ...(email.trim() ? { email: email.trim() } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (my !== seq.current) return;
        setCode(c);
        if (res.status === 429) {
          setError(promoText("errRateLimit", lang));
        } else if (body?.ok === true && typeof body.discount === "number") {
          setApplied({
            code: String(body.code ?? c),
            type: String(body.type ?? ""),
            discount: body.discount,
            limited: body.limited === true,
          });
          setError(null);
        } else if (body && body.ok === false && typeof body.reason === "string") {
          setApplied(null);
          setError(reasonText(body.reason, lang, typeof body.minOrderMdl === "number" ? body.minOrderMdl : undefined));
        } else {
          setError(promoText("errServer", lang));
        }
      } catch {
        if (my === seq.current) setError(promoText("errServer", lang));
      } finally {
        if (my === seq.current) setBusy(false);
      }
    },
    [lines, method, email, lang],
  );

  // Delivery, e-mail or cart changed: the applied code is checked again (free delivery, limits, min total).
  const codeRef = useRef<string | null>(null);
  const checkRef = useRef(check);
  useEffect(() => {
    codeRef.current = code;
    checkRef.current = check;
  });
  useEffect(() => {
    if (!codeRef.current) return;
    // Debounced: typing the e-mail must not fire one check per key (the endpoint is rate-limited).
    const timer = setTimeout(() => {
      if (codeRef.current) void checkRef.current(codeRef.current, true);
    }, 700);
    return () => clearTimeout(timer);
  }, [method, email, cartKey]);

  return {
    applied,
    code,
    error,
    busy,
    apply: (c) => check(c, false),
    remove: () => {
      seq.current++;
      setApplied(null);
      setCode(null);
      setError(null);
      setBusy(false);
    },
    rejectedByCheckout: (reason, minOrderMdl) => {
      setApplied(null);
      setError(promoText("checkoutRejected", lang, { reason: reasonText(reason, lang, minOrderMdl) }));
    },
  };
}

const inputCls =
  "min-w-0 flex-1 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3.5 py-2.5 text-base font-medium uppercase text-(--ink)";

/** The collapsed link, the input and «Aplică» / the applied code with «Elimină». */
export function CheckoutPromoField({ promo, lang }: { promo: CheckoutPromoState; lang: ShopLang }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (promo.applied) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-(--ok-soft) px-3.5 py-2.5 text-sm">
          <span className="font-semibold text-(--ok)">{promoText("applied", lang, { code: promo.applied.code })}</span>
          <button type="button" onClick={promo.remove} className="inline-flex min-h-10 items-center font-semibold underline">
            {promoText("remove", lang)}
          </button>
        </div>
        {promo.applied.limited ? (
          <p role="status" className="text-sm text-(--muted)">
            {promoText("limited", lang, { min: formatPrice(SHOP_MIN_PAYABLE_MDL, lang) })}
          </p>
        ) : null}
      </div>
    );
  }
  if (!open && !promo.code) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center self-start text-sm font-semibold underline"
        aria-expanded={false}
      >
        {promoText("toggle", lang)}
      </button>
    );
  }
  const submit = () => void promo.apply(value || promo.code || "");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="co-promo" className="text-sm font-semibold">
        {promoText("label", lang)}
      </label>
      <div className="flex gap-2">
        <input
          id="co-promo"
          className={inputCls}
          value={value}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={promo.error ? true : undefined}
          aria-describedby={promo.error ? "co-promo-err" : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter applies the code; it must not submit the order form.
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={promo.busy}
          className="shop-btn-dark min-h-11 shrink-0 rounded-[10px] bg-(--ink) px-4 font-bold disabled:opacity-60"
        >
          {promo.busy ? promoText("applying", lang) : promoText("apply", lang)}
        </button>
      </div>
      {promo.error ? (
        <span id="co-promo-err" role="alert" className="text-sm font-semibold text-(--err)">
          {promo.error}
          {promo.code ? (
            <>
              {" "}
              <button type="button" onClick={promo.remove} className="inline-flex min-h-10 items-center underline">
                {promoText("remove", lang)}
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** «Reducere (COD) −X lei» row of the order summary. */
export function CheckoutPromoLine({ applied, lang }: { applied: CheckoutPromoApplied | null; lang: ShopLang }) {
  if (!applied || applied.discount <= 0) return null;
  return (
    <div className="flex justify-between font-semibold text-(--ok)">
      <span>
        {applied.type === "free_delivery" ? promoText("freeDelivery", lang) : promoText("discountLine", lang, { code: applied.code })}
      </span>
      <span>−{formatPrice(applied.discount, lang)}</span>
    </div>
  );
}
