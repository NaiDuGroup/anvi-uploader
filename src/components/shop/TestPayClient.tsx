"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useShopLang } from "./ShopLangProvider";

/** Pilot-only payment stand-in: marks the order paid through `POST /api/shop/pay/test`. */
export function TestPayClient({ token }: { token: string | null }) {
  const { t, href } = useShopLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back button / an old tab (bfcache) must not offer the button for a paid order.
  useEffect(() => {
    if (!token) return;
    const orderHref = href(`/shop/comanda/${encodeURIComponent(token)}`);
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/shop/order/${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const view = (await res.json()) as { canPay?: unknown } | null;
        if (view && view.canPay === false) window.location.replace(orderHref);
      } catch {
        // Offline: keep the page; the server rejects a second payment anyway.
      }
    };
    void check();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBusy(false);
        void check();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, href]);

  if (!token) {
    return (
      <p role="alert" className="text-(--err)">
        {t("testPayMissing")}
      </p>
    );
  }

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/pay/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.push(href(`/shop/comanda/${encodeURIComponent(token)}`));
    } catch {
      setError(t("testPayFailed"));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 leading-relaxed text-(--muted)">{t("testPayText")}</p>
      {error ? (
        <p role="alert" className="m-0 rounded-[10px] bg-(--err-soft) px-3.5 py-2.5 font-semibold text-(--err)">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) px-6 text-[17px] font-extrabold disabled:opacity-60"
      >
        {busy ? "…" : t("testPayButton")}
      </button>
    </div>
  );
}
