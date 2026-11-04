"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useShopLang } from "./ShopLangProvider";

/** Pilot-only payment stand-in: marks the order paid through `POST /api/shop/pay/test`. */
export function TestPayClient({ token }: { token: string | null }) {
  const { t, href } = useShopLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
